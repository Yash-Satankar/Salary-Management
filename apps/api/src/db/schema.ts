import type { EmployeeStatus, EmploymentType } from '@acme/shared';
import type { ColumnType, Generated } from 'kysely';

/**
 * Hand-written to match migrations/ exactly (SPEC §3). BIGINT columns arrive as safe JS numbers,
 * DATE columns as `YYYY-MM-DD` strings and NUMERIC as strings (see type-parsers.ts).
 */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface CurrenciesTable {
  code: string;
  name: string;
  minor_unit: number;
}

export interface FxRatesTable {
  currency_code: string;
  usd_per_unit: string;
  as_of: string;
  source: string;
}

export interface CountriesTable {
  code: string;
  name: string;
  currency_code: string;
}

export interface DepartmentsTable {
  id: Generated<number>;
  name: string;
}

export interface JobTitlesTable {
  id: Generated<number>;
  name: string;
  department_id: number;
}

export interface EmployeesTable {
  id: Generated<number>;
  employee_code: Generated<string>;
  full_name: string;
  email: string;
  job_title_id: number;
  country_code: string;
  currency_code: string;
  salary_minor: number;
  employment_type: EmploymentType;
  hire_date: string;
  status: Generated<EmployeeStatus>;
  terminated_on: string | null;
  created_at: Timestamp & Generated<Date>;
  updated_at: Timestamp & Generated<Date>;
}

export interface SalaryChangesTable {
  id: Generated<number>;
  employee_id: number;
  previous_salary_minor: number | null;
  previous_currency_code: string | null;
  new_salary_minor: number;
  new_currency_code: string;
  effective_date: string;
  reason: string | null;
  created_at: Generated<Date>;
}

export interface Database {
  currencies: CurrenciesTable;
  fx_rates: FxRatesTable;
  countries: CountriesTable;
  departments: DepartmentsTable;
  job_titles: JobTitlesTable;
  employees: EmployeesTable;
  salary_changes: SalaryChangesTable;
}
