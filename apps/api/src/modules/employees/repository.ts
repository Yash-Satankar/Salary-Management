import type { EmployeeListItem, EmployeeListQuery, EmployeeSortField } from '@acme/shared';
import { sql } from 'kysely';
import type { Db } from '../../db/client';
import {
  DuplicateEmailError,
  type EmployeeChanges,
  type EmployeeRepository,
  type EmployeeTransaction,
} from './types';

const RECORD_COLUMNS = [
  'id',
  'employee_code as employeeCode',
  'full_name as fullName',
  'email',
  'job_title_id as jobTitleId',
  'country_code as countryCode',
  'currency_code as currencyCode',
  'salary_minor as salaryMinor',
  'employment_type as employmentType',
  'hire_date as hireDate',
  'status',
  'terminated_on as terminatedOn',
] as const;

/** Same formula as the insights SQL and shared `toUsdMinor`: exact NUMERIC, rounded to cents. */
const salaryUsdMinor = sql<number>`round(e.salary_minor::numeric / power(10::numeric, cur.minor_unit) * fx.usd_per_unit * 100)::bigint`;

const LIST_COLUMNS = [
  'e.id',
  'e.employee_code as employeeCode',
  'e.full_name as fullName',
  'e.email',
  'jt.id as jobTitleId',
  'jt.name as jobTitleName',
  'd.id as departmentId',
  'd.name as departmentName',
  'e.country_code as countryCode',
  'c.name as countryName',
  'e.salary_minor as salaryMinor',
  'e.currency_code as currencyCode',
  salaryUsdMinor.as('salaryUsdMinor'),
  'e.employment_type as employmentType',
  'e.hire_date as hireDate',
  'e.status',
  'e.terminated_on as terminatedOn',
  'e.created_at as createdAt',
  'e.updated_at as updatedAt',
] as const;

const SORT_EXPRESSIONS = {
  fullName: sql`e.full_name`,
  hireDate: sql`e.hire_date`,
  country: sql`c.name`,
  jobTitle: sql`jt.name`,
  salaryUsd: salaryUsdMinor,
} satisfies Record<EmployeeSortField, unknown>;

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function isEmailUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'employees_email_lower_uq'
  );
}

async function mapUniqueEmail<T>(email: string, work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    throw isEmailUniqueViolation(error) ? new DuplicateEmailError(email) : error;
  }
}

function toRow(changes: EmployeeChanges) {
  return {
    full_name: changes.fullName,
    email: changes.email?.toLowerCase(),
    job_title_id: changes.jobTitleId,
    country_code: changes.countryCode,
    currency_code: changes.currencyCode,
    salary_minor: changes.salaryMinor,
    employment_type: changes.employmentType,
    hire_date: changes.hireDate,
    status: changes.status,
    terminated_on: changes.terminatedOn,
  };
}

const EXPORT_PAGE_SIZE = 1_000;

export function createEmployeeRepository(db: Db): EmployeeRepository {
  const joined = () =>
    db
      .selectFrom('employees as e')
      .innerJoin('job_titles as jt', 'jt.id', 'e.job_title_id')
      .innerJoin('departments as d', 'd.id', 'jt.department_id')
      .innerJoin('countries as c', 'c.code', 'e.country_code')
      .innerJoin('currencies as cur', 'cur.code', 'e.currency_code')
      .innerJoin('fx_rates as fx', 'fx.currency_code', 'e.currency_code');

  const filtered = (query: EmployeeListQuery) =>
    joined().where((eb) => {
      const conditions = [];
      if (query.status !== 'all') {
        conditions.push(eb('e.status', '=', query.status));
      }
      if (query.search) {
        const term = escapeLike(query.search);
        conditions.push(
          eb.or([
            eb('e.full_name', 'ilike', `%${term}%`),
            eb(eb.fn('lower', ['e.email']), 'like', `${term.toLowerCase()}%`),
            eb('e.employee_code', 'ilike', `${term}%`),
          ]),
        );
      }
      if (query.country) {
        conditions.push(eb('e.country_code', '=', query.country));
      }
      if (query.departmentId) {
        conditions.push(eb('jt.department_id', '=', query.departmentId));
      }
      if (query.jobTitleId) {
        conditions.push(eb('e.job_title_id', '=', query.jobTitleId));
      }
      if (query.employmentType) {
        conditions.push(eb('e.employment_type', '=', query.employmentType));
      }
      return eb.and(conditions);
    });

  /** One sorted page; `id` breaks ties so rows never jump between pages. */
  const sortedPage = (query: EmployeeListQuery, limit: number, offset: number) =>
    filtered(query)
      .select(LIST_COLUMNS)
      .orderBy(SORT_EXPRESSIONS[query.sort], query.order)
      .orderBy('e.id', query.order)
      .limit(limit)
      .offset(offset)
      .execute();

  type ListRow = Awaited<ReturnType<typeof listRowById>>;
  const listRowById = (id: number) =>
    joined().select(LIST_COLUMNS).where('e.id', '=', id).executeTakeFirst();

  const toListItem = (row: NonNullable<ListRow>): EmployeeListItem => ({
    id: row.id,
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    email: row.email,
    jobTitle: { id: row.jobTitleId, name: row.jobTitleName },
    department: { id: row.departmentId, name: row.departmentName },
    country: { code: row.countryCode, name: row.countryName },
    salary: { amountMinor: row.salaryMinor, currency: row.currencyCode },
    salaryUsd: { amountMinor: row.salaryUsdMinor, currency: 'USD' },
    employmentType: row.employmentType,
    hireDate: row.hireDate,
    status: row.status,
    terminatedOn: row.terminatedOn,
  });

  return {
    async findById(id) {
      return db
        .selectFrom('employees')
        .select(RECORD_COLUMNS)
        .where('id', '=', id)
        .executeTakeFirst();
    },

    async findByEmail(email) {
      return db
        .selectFrom('employees')
        .select(RECORD_COLUMNS)
        .where((eb) => eb(eb.fn('lower', ['email']), '=', email.toLowerCase()))
        .executeTakeFirst();
    },

    async insert(employee) {
      return mapUniqueEmail(
        employee.email,
        db
          .insertInto('employees')
          .values({
            full_name: employee.fullName,
            email: employee.email.toLowerCase(),
            job_title_id: employee.jobTitleId,
            country_code: employee.countryCode,
            currency_code: employee.currencyCode,
            salary_minor: employee.salaryMinor,
            employment_type: employee.employmentType,
            hire_date: employee.hireDate,
          })
          .returning(RECORD_COLUMNS)
          .executeTakeFirstOrThrow(),
      );
    },

    async update(id, changes) {
      return mapUniqueEmail(
        changes.email ?? '',
        db
          .updateTable('employees')
          .set({ ...toRow(changes), updated_at: sql`now()` })
          .where('id', '=', id)
          .returning(RECORD_COLUMNS)
          .executeTakeFirstOrThrow(),
      );
    },

    async insertSalaryChange(change) {
      await db
        .insertInto('salary_changes')
        .values({
          employee_id: change.employeeId,
          previous_salary_minor: change.previousSalaryMinor,
          previous_currency_code: change.previousCurrencyCode,
          new_salary_minor: change.newSalaryMinor,
          new_currency_code: change.newCurrencyCode,
          effective_date: change.effectiveDate,
          reason: change.reason,
        })
        .execute();
    },

    async getDetail(id) {
      const row = await listRowById(id);
      if (!row) {
        return undefined;
      }
      const history = await db
        .selectFrom('salary_changes')
        .selectAll()
        .where('employee_id', '=', id)
        .orderBy('effective_date', 'desc')
        .orderBy('id', 'desc')
        .execute();
      return {
        ...toListItem(row),
        salaryHistory: history.map((entry) => ({
          id: entry.id,
          previous:
            entry.previous_salary_minor === null || entry.previous_currency_code === null
              ? null
              : {
                  amountMinor: entry.previous_salary_minor,
                  currency: entry.previous_currency_code,
                },
          new: { amountMinor: entry.new_salary_minor, currency: entry.new_currency_code },
          effectiveDate: entry.effective_date,
          reason: entry.reason,
          createdAt: entry.created_at.toISOString(),
        })),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    },

    async list(query) {
      const [rows, count] = await Promise.all([
        sortedPage(query, query.pageSize, (query.page - 1) * query.pageSize),
        filtered(query)
          .select((eb) => eb.fn.countAll<number>().as('total'))
          .executeTakeFirstOrThrow(),
      ]);
      return { items: rows.map(toListItem), total: count.total };
    },

    async findByCodes(codes) {
      if (codes.length === 0) {
        return [];
      }
      return db
        .selectFrom('employees')
        .select(RECORD_COLUMNS)
        .where('employee_code', 'in', codes)
        .execute();
    },

    async findByEmails(emails) {
      if (emails.length === 0) {
        return [];
      }
      const lowered = emails.map((email) => email.toLowerCase());
      return db
        .selectFrom('employees')
        .select(RECORD_COLUMNS)
        .where((eb) => eb(eb.fn('lower', ['email']), 'in', lowered))
        .execute();
    },

    async *iterate(query, pageSize = EXPORT_PAGE_SIZE) {
      for (let page = 1; ; page += 1) {
        const rows = await sortedPage(query, pageSize, (page - 1) * pageSize);
        yield* rows.map(toListItem);
        if (rows.length < pageSize) {
          return;
        }
      }
    },
  };
}

export function createEmployeeTransaction(db: Db): EmployeeTransaction {
  return (work) => db.transaction().execute((trx) => work(createEmployeeRepository(trx)));
}
