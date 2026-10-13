import {
  type EmployeeCreateInput,
  type EmployeeDetail,
  type EmployeeListItem,
  type EmployeeListQuery,
  type EmployeeListMeta,
  type EmployeeUpdateInput,
  type FxMeta,
  toUsdMinor,
} from '@acme/shared';
import type { Clock } from '../../lib/clock';
import { conflict, notFound, unprocessable } from '../../lib/errors';
import type { CountryInfo, JobTitleInfo, ReferenceRepository } from '../reference/repository';
import {
  DuplicateEmailError,
  type EmployeeRecord,
  type EmployeeRepository,
  type EmployeeTransaction,
} from './types';

export interface EmployeeService {
  list(query: EmployeeListQuery): Promise<{ items: EmployeeListItem[]; meta: EmployeeListMeta }>;
  getDetail(id: number): Promise<EmployeeDetail>;
  create(input: EmployeeCreateInput): Promise<EmployeeDetail>;
  update(id: number, input: EmployeeUpdateInput): Promise<EmployeeDetail>;
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

export const INITIAL_SALARY_REASON = 'Initial salary';

const DUPLICATE_EMAIL_MESSAGE = 'An employee with this email already exists';

function duplicateEmail() {
  return conflict(DUPLICATE_EMAIL_MESSAGE, {
    formErrors: [],
    fieldErrors: { email: [DUPLICATE_EMAIL_MESSAGE] },
  });
}

/** The unique index is the final arbiter; this turns a lost race into the same 409. */
async function mapDuplicateEmail<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    throw error instanceof DuplicateEmailError ? duplicateEmail() : error;
  }
}

export function createEmployeeService({
  employeeRepository,
  referenceRepository,
  clock,
  transaction,
}: EmployeeServiceDeps): EmployeeService {
  async function requireEmployee(id: number): Promise<EmployeeRecord> {
    const employee = await employeeRepository.findById(id);
    if (!employee) {
      throw notFound(`Employee ${id} not found`);
    }
    return employee;
  }

  /** Terminated records are kept for history and audit, never edited. */
  async function requireActiveEmployee(id: number): Promise<EmployeeRecord> {
    const employee = await requireEmployee(id);
    if (employee.status === 'terminated') {
      throw conflict('Terminated employees cannot be edited');
    }
    return employee;
  }

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

  async function assertEmailAvailable(email: string, ownerId?: number): Promise<void> {
    const existing = await employeeRepository.findByEmail(email);
    if (existing && existing.id !== ownerId) {
      throw duplicateEmail();
    }
  }

  /** Bounds apply to the USD equivalent so one limit is meaningful across all currencies. */
  function assertSalaryWithinBounds(salaryMinor: number, country: CountryInfo): void {
    const usdMinor = toUsdMinor(salaryMinor, country.currency.minorUnit, country.usdPerUnit);
    if (usdMinor > MAX_SALARY_USD_MINOR) {
      throw fieldError('salaryMinor', 'Salary must not exceed the equivalent of 5,000,000 USD');
    }
  }

  /** Salary changes cannot predate the employment or be scheduled for the future in v1. */
  function resolveEffectiveDate(requested: string | undefined, hireDate: string): string {
    const effectiveDate = requested ?? clock.today();
    if (effectiveDate < hireDate) {
      throw fieldError('effectiveDate', 'Effective date cannot be before the hire date');
    }
    if (effectiveDate > clock.today()) {
      throw fieldError('effectiveDate', 'Effective date cannot be in the future');
    }
    return effectiveDate;
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
      await assertEmailAvailable(input.email);
      const created = await mapDuplicateEmail(
        transaction(async (repository) => {
          const employee = await repository.insert({
            ...input,
            currencyCode: country.currency.code,
          });
          await repository.insertSalaryChange({
            employeeId: employee.id,
            previousSalaryMinor: null,
            previousCurrencyCode: null,
            newSalaryMinor: employee.salaryMinor,
            newCurrencyCode: employee.currencyCode,
            effectiveDate: employee.hireDate,
            reason: INITIAL_SALARY_REASON,
          });
          return employee;
        }),
      );
      return getDetail(created.id);
    },

    async update(id, input) {
      const existing = await requireActiveEmployee(id);
      const { salaryChange, ...changes } = input;
      if (changes.jobTitleId !== undefined) {
        await requireJobTitle(changes.jobTitleId);
      }
      const country = await requireCountry(changes.countryCode ?? existing.countryCode);
      // A new country means a new currency, so the old amount would silently change meaning.
      if (country.code !== existing.countryCode && changes.salaryMinor === undefined) {
        throw fieldError(
          'salaryMinor',
          `Changing the country changes the currency: enter the salary in ${country.currency.code}`,
        );
      }
      const salaryMinor = changes.salaryMinor ?? existing.salaryMinor;
      const currencyCode = country.currency.code;
      const salaryChanged =
        salaryMinor !== existing.salaryMinor || currencyCode !== existing.currencyCode;
      const hireDate = changes.hireDate ?? existing.hireDate;
      const effectiveDate = salaryChanged
        ? resolveEffectiveDate(salaryChange?.effectiveDate, hireDate)
        : undefined;
      if (salaryChanged) {
        assertSalaryWithinBounds(salaryMinor, country);
      }
      if (changes.email !== undefined) {
        await assertEmailAvailable(changes.email, id);
      }

      await mapDuplicateEmail(
        transaction(async (repository) => {
          await repository.update(id, { ...changes, currencyCode });
          if (effectiveDate !== undefined) {
            await repository.insertSalaryChange({
              employeeId: id,
              previousSalaryMinor: existing.salaryMinor,
              previousCurrencyCode: existing.currencyCode,
              newSalaryMinor: salaryMinor,
              newCurrencyCode: currencyCode,
              effectiveDate,
              reason: salaryChange?.reason || null,
            });
          }
        }),
      );
      return getDetail(id);
    },

    fxMeta: () => referenceRepository.getFxMeta(),
  };
}
