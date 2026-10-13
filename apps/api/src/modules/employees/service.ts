import type {
  EmployeeCreateInput,
  EmployeeDetail,
  EmployeeListItem,
  EmployeeListQuery,
  EmployeeListMeta,
  FxMeta,
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
      const created = await transaction((repository) =>
        repository.insert({ ...input, currencyCode: country.currency.code }),
      );
      return getDetail(created.id);
    },

    fxMeta: () => referenceRepository.getFxMeta(),
  };
}
