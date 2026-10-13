import type {
  EmployeeDetail,
  EmployeeListItem,
  EmployeeListQuery,
  EmployeeStatus,
  EmploymentType,
} from '@acme/shared';

/** An employees row as the domain sees it (camelCase, money in minor units). */
export interface EmployeeRecord {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  jobTitleId: number;
  countryCode: string;
  currencyCode: string;
  salaryMinor: number;
  employmentType: EmploymentType;
  hireDate: string;
  status: EmployeeStatus;
  terminatedOn: string | null;
}

export type NewEmployee = Omit<EmployeeRecord, 'id' | 'employeeCode' | 'status' | 'terminatedOn'>;

export type EmployeeChanges = Partial<Omit<EmployeeRecord, 'id' | 'employeeCode'>>;

export interface NewSalaryChange {
  employeeId: number;
  previousSalaryMinor: number | null;
  previousCurrencyCode: string | null;
  newSalaryMinor: number;
  newCurrencyCode: string;
  effectiveDate: string;
  reason: string | null;
}

export interface EmployeeListPage {
  items: EmployeeListItem[];
  total: number;
}

/** Raised by repositories when the case-insensitive email index rejects a write. */
export class DuplicateEmailError extends Error {
  constructor(readonly email: string) {
    super(`An employee with email ${email} already exists`);
    this.name = 'DuplicateEmailError';
  }
}

export interface EmployeeRepository {
  findById(id: number): Promise<EmployeeRecord | undefined>;
  /** Case-insensitive lookup. */
  findByEmail(email: string): Promise<EmployeeRecord | undefined>;
  insert(employee: NewEmployee): Promise<EmployeeRecord>;
  update(id: number, changes: EmployeeChanges): Promise<EmployeeRecord>;
  insertSalaryChange(change: NewSalaryChange): Promise<void>;
  getDetail(id: number): Promise<EmployeeDetail | undefined>;
  list(query: EmployeeListQuery): Promise<EmployeeListPage>;
}

/** Runs `work` atomically; the repository it receives is bound to the transaction. */
export type EmployeeTransaction = <T>(
  work: (repository: EmployeeRepository) => Promise<T>,
) => Promise<T>;
