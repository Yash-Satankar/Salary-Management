import { type EmployeeDetail, type EmployeeListItem, toUsdMinor } from '@acme/shared';
import {
  DuplicateEmailError,
  type EmployeeRecord,
  type EmployeeRepository,
  type EmployeeTransaction,
  type NewSalaryChange,
} from '../../modules/employees/types';
import { JOB_TITLES } from './reference';
import { fakeReferenceRepository } from './reference';

interface StoredSalaryChange extends NewSalaryChange {
  id: number;
}

interface State {
  employees: EmployeeRecord[];
  salaryChanges: StoredSalaryChange[];
}

const TIMESTAMP = '2026-10-13T09:00:00.000Z';

/**
 * Hand-written in-memory employee store. `transaction` snapshots state and restores it when the
 * work throws, so unit tests observe the same all-or-nothing behaviour as Postgres.
 */
export class InMemoryEmployeeRepository implements EmployeeRepository {
  state: State = { employees: [], salaryChanges: [] };
  private readonly reference = fakeReferenceRepository();

  get employees(): EmployeeRecord[] {
    return this.state.employees;
  }

  get salaryChanges(): StoredSalaryChange[] {
    return this.state.salaryChanges;
  }

  readonly transaction: EmployeeTransaction = async (work) => {
    const snapshot = structuredClone(this.state);
    try {
      return await work(this);
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  };

  /** Inserts a record directly, bypassing the service, to arrange test state. */
  seed(record: Partial<EmployeeRecord> & Pick<EmployeeRecord, 'email'>): EmployeeRecord {
    const id = this.state.employees.length + 1;
    const employee: EmployeeRecord = {
      id,
      employeeCode: `EMP-${String(id).padStart(6, '0')}`,
      fullName: 'Seeded Person',
      jobTitleId: JOB_TITLES.engineer.id,
      countryCode: 'IN',
      currencyCode: 'INR',
      salaryMinor: 250_000_000,
      employmentType: 'full_time',
      hireDate: '2022-01-10',
      status: 'active',
      terminatedOn: null,
      ...record,
    };
    this.state.employees.push(employee);
    return { ...employee };
  }

  // Copies, like rows from a real database, so callers never alias stored state.
  async findById(id: number) {
    const employee = this.state.employees.find((candidate) => candidate.id === id);
    return employee && { ...employee };
  }

  async findByEmail(email: string) {
    const employee = this.emailOwner(email);
    return employee && { ...employee };
  }

  /** Mirrors the unique index; independent of findByEmail so tests can simulate races. */
  private emailOwner(email: string): EmployeeRecord | undefined {
    return this.state.employees.find(
      (employee) => employee.email.toLowerCase() === email.toLowerCase(),
    );
  }

  async insert(employee: Parameters<EmployeeRepository['insert']>[0]) {
    if (this.emailOwner(employee.email)) {
      throw new DuplicateEmailError(employee.email);
    }
    return this.seed({ ...employee, status: 'active', terminatedOn: null });
  }

  async update(id: number, changes: Parameters<EmployeeRepository['update']>[1]) {
    const existing = this.state.employees.find((employee) => employee.id === id);
    if (!existing) {
      throw new Error(`No employee ${id}`);
    }
    const duplicate = changes.email ? this.emailOwner(changes.email) : undefined;
    if (duplicate && duplicate.id !== id) {
      throw new DuplicateEmailError(changes.email ?? '');
    }
    Object.assign(existing, changes);
    return { ...existing };
  }

  async insertSalaryChange(change: NewSalaryChange) {
    this.state.salaryChanges.push({ ...change, id: this.state.salaryChanges.length + 1 });
  }

  async getDetail(id: number): Promise<EmployeeDetail | undefined> {
    const employee = await this.findById(id);
    if (!employee) {
      return undefined;
    }
    const history = this.state.salaryChanges
      .filter((change) => change.employeeId === id)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.id - a.id)
      .map((change) => ({
        id: change.id,
        previous:
          change.previousSalaryMinor === null
            ? null
            : {
                amountMinor: change.previousSalaryMinor,
                currency: change.previousCurrencyCode ?? '',
              },
        new: { amountMinor: change.newSalaryMinor, currency: change.newCurrencyCode },
        effectiveDate: change.effectiveDate,
        reason: change.reason,
        createdAt: TIMESTAMP,
      }));
    return {
      ...(await this.toListItem(employee)),
      salaryHistory: history,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };
  }

  async list() {
    const items = await Promise.all(
      this.state.employees.map((employee) => this.toListItem(employee)),
    );
    return { items, total: items.length };
  }

  private async toListItem(employee: EmployeeRecord): Promise<EmployeeListItem> {
    const country = await this.reference.findCountry(employee.countryCode);
    const jobTitle = await this.reference.findJobTitle(employee.jobTitleId);
    if (!country || !jobTitle) {
      throw new Error('Fake reference data is missing a country or job title');
    }
    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      email: employee.email,
      jobTitle: { id: jobTitle.id, name: jobTitle.name },
      department: jobTitle.department,
      country: { code: country.code, name: country.name },
      salary: { amountMinor: employee.salaryMinor, currency: employee.currencyCode },
      salaryUsd: {
        amountMinor: toUsdMinor(
          employee.salaryMinor,
          country.currency.minorUnit,
          country.usdPerUnit,
        ),
        currency: 'USD',
      },
      employmentType: employee.employmentType,
      hireDate: employee.hireDate,
      status: employee.status,
      terminatedOn: employee.terminatedOn,
    };
  }
}
