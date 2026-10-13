import { type Kysely, sql } from 'kysely';

// DDL is kept as plain SQL, mirroring SPEC §3 verbatim, so reviewers can diff the two directly.
const UP = [
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE TABLE currencies (
    code        CHAR(3) PRIMARY KEY,
    name        TEXT NOT NULL,
    minor_unit  SMALLINT NOT NULL CHECK (minor_unit BETWEEN 0 AND 3)
  )`,
  `CREATE TABLE fx_rates (
    currency_code CHAR(3) PRIMARY KEY REFERENCES currencies(code),
    usd_per_unit  NUMERIC(20,10) NOT NULL CHECK (usd_per_unit > 0),
    as_of         DATE NOT NULL,
    source        TEXT NOT NULL
  )`,
  `CREATE TABLE countries (
    code          CHAR(2) PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    currency_code CHAR(3) NOT NULL REFERENCES currencies(code),
    UNIQUE (code, currency_code)
  )`,
  `CREATE TABLE departments (
    id   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE job_titles (
    id            SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    department_id SMALLINT NOT NULL REFERENCES departments(id)
  )`,
  `CREATE SEQUENCE employee_code_seq`,
  `CREATE TABLE employees (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_code   TEXT NOT NULL UNIQUE
                    DEFAULT ('EMP-' || lpad(nextval('employee_code_seq')::text, 6, '0')),
    full_name       TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
    email           TEXT NOT NULL,
    job_title_id    SMALLINT NOT NULL REFERENCES job_titles(id),
    country_code    CHAR(2) NOT NULL,
    currency_code   CHAR(3) NOT NULL,
    salary_minor    BIGINT NOT NULL CHECK (salary_minor > 0),
    employment_type TEXT NOT NULL CHECK (employment_type IN ('full_time','part_time','contract')),
    hire_date       DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','terminated')),
    terminated_on   DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (country_code, currency_code) REFERENCES countries(code, currency_code),
    CHECK ((status = 'terminated') = (terminated_on IS NOT NULL)),
    CHECK (terminated_on IS NULL OR terminated_on >= hire_date)
  )`,
  `CREATE UNIQUE INDEX employees_email_lower_uq ON employees (lower(email))`,
  `CREATE INDEX employees_active_country_idx ON employees (country_code, job_title_id) WHERE status = 'active'`,
  `CREATE INDEX employees_status_name_idx ON employees (status, full_name, id)`,
  `CREATE INDEX employees_job_title_idx ON employees (job_title_id)`,
  `CREATE INDEX employees_full_name_trgm_idx ON employees USING gin (full_name gin_trgm_ops)`,
  `CREATE TABLE salary_changes (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id            BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    previous_salary_minor  BIGINT,
    previous_currency_code CHAR(3) REFERENCES currencies(code),
    new_salary_minor       BIGINT NOT NULL CHECK (new_salary_minor > 0),
    new_currency_code      CHAR(3) NOT NULL REFERENCES currencies(code),
    effective_date         DATE NOT NULL,
    reason                 TEXT CHECK (reason IS NULL OR char_length(reason) <= 200),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX salary_changes_employee_idx ON salary_changes (employee_id, effective_date DESC, id DESC)`,
];

const DOWN = [
  `DROP TABLE salary_changes`,
  `DROP TABLE employees`,
  `DROP SEQUENCE employee_code_seq`,
  `DROP TABLE job_titles`,
  `DROP TABLE departments`,
  `DROP TABLE countries`,
  `DROP TABLE fx_rates`,
  `DROP TABLE currencies`,
];

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const statement of UP) {
    await sql.raw(statement).execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const statement of DOWN) {
    await sql.raw(statement).execute(db);
  }
}
