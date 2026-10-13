import {
  EMPLOYMENT_TYPES,
  type EmploymentType,
  emailSchema,
  type ImportRowError,
  InvalidAmountError,
  isoDateSchema,
  toMinor,
} from '@acme/shared';
import { CsvError, parse } from 'csv-parse/sync';
import {
  exceedsSalaryLimit,
  HIRE_DATE_LIMIT_MESSAGE,
  isHireDateTooFarAhead,
  SALARY_LIMIT_MESSAGE,
} from '../employees/rules';
import { FORMULA_TRIGGERS } from './formula-escape';

export const MAX_IMPORT_ROWS = 10_000;

export const REQUIRED_HEADERS = [
  'full_name',
  'email',
  'job_title',
  'country_code',
  'currency',
  'salary',
  'employment_type',
  'hire_date',
] as const;
const OPTIONAL_HEADERS = ['employee_code', 'department'] as const;

type ImportColumn = (typeof REQUIRED_HEADERS)[number] | (typeof OPTIONAL_HEADERS)[number];

/** A problem with the file as a whole (400), as opposed to a problem with one row. */
export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFileError';
  }
}

export interface ParsedRow {
  /** 1-based line where the record starts, counting the header as line 1. */
  line: number;
  values: Partial<Record<ImportColumn, string>>;
}

export interface ParsedImportFile {
  rows: ParsedRow[];
}

export interface ImportContext {
  today: string;
  jobTitles: { id: number; name: string; departmentName: string }[];
  countries: { code: string; currencyCode: string; minorUnit: number; usdPerUnit: string }[];
}

export interface ValidatedImportRow {
  line: number;
  employeeCode: string | null;
  fullName: string;
  email: string;
  jobTitleId: number;
  countryCode: string;
  currencyCode: string;
  salaryMinor: number;
  employmentType: EmploymentType;
  hireDate: string;
}

export interface ImportValidation {
  rows: ValidatedImportRow[];
  errors: ImportRowError[];
}

const KNOWN_COLUMNS = new Set<string>([...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]);

interface RecordWithInfo {
  record: string[];
  info: { lines: number };
}

/** Undoes the export guard: `'=SUM(1)` was written by us and means the text `=SUM(1)`. */
function unescapeFormula(value: string): string {
  return value.startsWith("'") && FORMULA_TRIGGERS.includes(value.charAt(1))
    ? value.slice(1)
    : value;
}

/** Pure: text in, rows out. Throws ImportFileError for anything that is not a usable CSV. */
export function parseImportFile(text: string): ParsedImportFile {
  let records: RecordWithInfo[];
  try {
    // With `info: true` csv-parse returns { record, info } objects; its typings omit that overload.
    records = parse(text, {
      bom: true,
      info: true,
      relax_column_count: true,
      skip_empty_lines: false,
    }) as unknown as RecordWithInfo[];
  } catch (error) {
    if (error instanceof CsvError) {
      throw new ImportFileError(`The file is not valid CSV: ${error.message}`);
    }
    throw error;
  }

  const [header, ...dataRecords] = records;
  const headers = (header?.record ?? []).map((name) => name.trim().toLowerCase());
  const missing = REQUIRED_HEADERS.filter((name) => !headers.includes(name));
  if (missing.length > 0) {
    throw new ImportFileError(`Missing required columns: ${missing.join(', ')}`);
  }

  const rows: ParsedRow[] = [];
  let previousEndLine = header?.info.lines ?? 1;
  for (const { record, info } of dataRecords) {
    const startLine = previousEndLine + 1;
    previousEndLine = info.lines;
    if (record.every((cell) => cell.trim() === '')) {
      continue;
    }
    const values: ParsedRow['values'] = {};
    headers.forEach((name, index) => {
      if (KNOWN_COLUMNS.has(name)) {
        values[name as ImportColumn] = unescapeFormula((record[index] ?? '').trim());
      }
    });
    rows.push({ line: startLine, values });
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(
      `The file has more than ${MAX_IMPORT_ROWS.toLocaleString('en-US')} data rows`,
    );
  }
  return { rows };
}

const LABELS: Record<(typeof REQUIRED_HEADERS)[number], string> = {
  full_name: 'Full name',
  email: 'Email',
  job_title: 'Job title',
  country_code: 'Country code',
  currency: 'Currency',
  salary: 'Salary',
  employment_type: 'Employment type',
  hire_date: 'Hire date',
};

const PLAIN_NUMBER = /^\d+(\.\d+)?$/;

/**
 * Pure per-row validation against reference data. Applies the same domain rules as the employee
 * service; checks that need the database (unknown codes, email owners) happen in the service.
 */
export function validateImportRows(
  file: ParsedImportFile,
  context: ImportContext,
): ImportValidation {
  const titles = new Map(context.jobTitles.map((title) => [title.name.toLowerCase(), title]));
  const countries = new Map(context.countries.map((country) => [country.code, country]));
  const firstLineByEmail = new Map<string, number>();
  const firstLineByCode = new Map<string, number>();
  const rows: ValidatedImportRow[] = [];
  const errors: ImportRowError[] = [];

  for (const { line, values } of file.rows) {
    const rowErrors: ImportRowError[] = [];
    const fail = (field: string, message: string) => rowErrors.push({ row: line, field, message });
    const value = (column: ImportColumn) => values[column] ?? '';

    for (const column of REQUIRED_HEADERS) {
      if (value(column) === '') {
        fail(column, `${LABELS[column]} is required`);
      }
    }
    const present = (column: (typeof REQUIRED_HEADERS)[number]) => value(column) !== '';

    const fullName = value('full_name');
    if (present('full_name') && (fullName.length < 2 || fullName.length > 120)) {
      fail('full_name', 'Full name must be 2 to 120 characters');
    }

    const email = emailSchema.safeParse(value('email'));
    if (present('email') && !email.success) {
      fail('email', 'Email must be a valid email address');
    }

    const title = titles.get(value('job_title').toLowerCase());
    if (present('job_title') && !title) {
      fail('job_title', `Unknown job title "${value('job_title')}"`);
    }
    const department = value('department');
    if (title && department && department.toLowerCase() !== title.departmentName.toLowerCase()) {
      fail('department', `${title.name} belongs to ${title.departmentName}, not ${department}`);
    }

    const countryCode = value('country_code').toUpperCase();
    const country = countries.get(countryCode);
    if (present('country_code') && !country) {
      fail('country_code', `Unknown country "${value('country_code')}"`);
    }
    const currencyCode = value('currency').toUpperCase();
    if (country && present('currency') && currencyCode !== country.currencyCode) {
      fail('currency', `Currency must be ${country.currencyCode} for ${country.code}`);
    }

    const salaryMinor = parseSalary(value('salary'), country, (message) => fail('salary', message));

    const employmentType = value('employment_type').toLowerCase();
    const isEmploymentType = (candidate: string): candidate is EmploymentType =>
      (EMPLOYMENT_TYPES as readonly string[]).includes(candidate);
    if (present('employment_type') && !isEmploymentType(employmentType)) {
      fail('employment_type', `Employment type must be one of ${EMPLOYMENT_TYPES.join(', ')}`);
    }

    const hireDate = value('hire_date');
    if (present('hire_date') && !isoDateSchema.safeParse(hireDate).success) {
      fail('hire_date', 'Hire date must be a valid date in YYYY-MM-DD format');
    } else if (present('hire_date') && isHireDateTooFarAhead(hireDate, context.today)) {
      fail('hire_date', HIRE_DATE_LIMIT_MESSAGE);
    }

    const employeeCode = value('employee_code').toUpperCase() || null;
    if (employeeCode) {
      const firstLine = firstLineByCode.get(employeeCode);
      if (firstLine !== undefined) {
        fail('employee_code', `Duplicate employee code in file (first used on row ${firstLine})`);
      } else {
        firstLineByCode.set(employeeCode, line);
      }
    }
    if (email.success) {
      const firstLine = firstLineByEmail.get(email.data);
      if (firstLine !== undefined) {
        fail('email', `Duplicate email in file (first used on row ${firstLine})`);
      } else {
        firstLineByEmail.set(email.data, line);
      }
    }

    if (
      rowErrors.length === 0 &&
      email.success &&
      title &&
      country &&
      salaryMinor !== undefined &&
      isEmploymentType(employmentType)
    ) {
      rows.push({
        line,
        employeeCode,
        fullName,
        email: email.data,
        jobTitleId: title.id,
        countryCode,
        currencyCode,
        salaryMinor,
        employmentType,
        hireDate,
      });
    }
    errors.push(...rowErrors);
  }
  return { rows, errors };
}

function parseSalary(
  text: string,
  country: ImportContext['countries'][number] | undefined,
  fail: (message: string) => void,
): number | undefined {
  if (text === '') {
    return undefined;
  }
  if (!PLAIN_NUMBER.test(text)) {
    fail('Salary must be a plain number such as 1250000.50');
    return undefined;
  }
  if (!country) {
    return undefined;
  }
  try {
    const salaryMinor = toMinor(text, country.minorUnit);
    if (salaryMinor <= 0) {
      fail('Salary must be greater than zero');
      return undefined;
    }
    if (exceedsSalaryLimit(salaryMinor, country.minorUnit, country.usdPerUnit)) {
      fail(SALARY_LIMIT_MESSAGE);
      return undefined;
    }
    return salaryMinor;
  } catch (error) {
    if (error instanceof InvalidAmountError) {
      fail(error.message);
      return undefined;
    }
    throw error;
  }
}
