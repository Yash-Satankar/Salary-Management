import {
  type EmployeeCreateInput,
  type EmployeeDetail,
  type EmployeeListItem,
  type EmployeeListQuery,
  type EmployeeListMeta,
  type FxMeta,
  toUsdMinor,
} from '@acme/shared';
import type { Clock } from '../../lib/clock';
import { notFound, unprocessable } from '../../lib/errors';
import type { CountryInfo, JobTitleInfo, ReferenceRepository } from '../reference/repository';
import type { EmployeeRepository, EmployeeTransaction } from './types';

export interface EmployeeService {
  list(query: EmployeeListQuery): Promise<{ items: EmployeeListItem[]; meta: EmployeeListMeta }>;
  getDetail(id: number): Promise<EmployeeDetail>;
  create(input: EmployeeCreateInput): Promise<EmployeeDetail>;
  fxMeta(): Promise<FxMeta>;
}

export interface EmployeeServiceDeps {
  employeeRepository: EmployeeRepository;
  referenceRepository: ReferenceRepository;
  clock: Clock;
  transaction: EmployeeTransaction;
}

export const MAX_SALARY_USD_MINOR = 5_000_000_00;

/** Field-level domain error in the same shape as Zod's flattened errors, so forms can map it. */
export function fieldError(field: string, message: string) {
  return unprocessable(message, { formErrors: [], fieldErrors: { [field]: [message] } });
}

export function createEmployeeService({
  employeeRepository,
  referenceRepository,
  transaction,
}: EmployeeServiceDeps): EmployeeService {
  async function requireCountry(code: string): Promise<CountryInfo> {
    const country = await referenceRepository.findCountry(code);
    if (!country) {
      throw fieldError('countryCode', 'Unknown country');
    }
    return country;
  }

  async function requireJobTitle(id: number): Promise<JobTitleInfo> {
    const jobTitle = await referenceRepository.findJobTitle(id);
    if (!jobTitle) {
      throw fieldError('jobTitleId', 'Unknown job title');
    }
    return jobTitle;
  }

  /** Bounds apply to the USD equivalent so one limit is meaningful across all currencies. */
  function assertSalaryWithinBounds(salaryMinor: number, country: CountryInfo): void {
    const usdMinor = toUsdMinor(salaryMinor, country.currency.minorUnit, country.usdPerUnit);
    if (usdMinor > MAX_SALARY_USD_MINOR) {
      throw fieldError('salaryMinor', 'Salary must not exceed the equivalent of 5,000,000 USD');
    }
  }

  async function getDetail(id: number): Promise<EmployeeDetail> {
    const detail = await employeeRepository.getDetail(id);
    if (!detail) {
      throw notFound(`Employee ${id} not found`);
    }
    return detail;
  }

  return {
    async list(query) {
      const [{ items, total }, fx] = await Promise.all([
        employeeRepository.list(query),
        referenceRepository.getFxMeta(),
      ]);
      return {
        items,
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
          fx,
        },
      };
    },

    getDetail,

    async create(input) {
      const country = await requireCountry(input.countryCode);
      await requireJobTitle(input.jobTitleId);
      assertSalaryWithinBounds(input.salaryMinor, country);
      const created = await transaction((repository) =>
        repository.insert({ ...input, currencyCode: country.currency.code }),
      );
      return getDetail(created.id);
    },

    fxMeta: () => referenceRepository.getFxMeta(),
  };
}
