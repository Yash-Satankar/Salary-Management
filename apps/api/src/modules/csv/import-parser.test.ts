import { describe, expect, it } from 'vitest';
import {
  type ImportContext,
  ImportFileError,
  MAX_IMPORT_ROWS,
  parseImportFile,
  validateImportRows,
} from './import-parser';

const HEADER =
  'employee_code,full_name,email,department,job_title,country_code,currency,salary,employment_type,hire_date';

const context: ImportContext = {
  today: '2026-10-13',
  jobTitles: [
    { id: 1, name: 'Software Engineer', departmentName: 'Engineering' },
    { id: 3, name: 'Recruiter', departmentName: 'People' },
  ],
  countries: [
    { code: 'IN', currencyCode: 'INR', minorUnit: 2, usdPerUnit: '0.0115' },
    { code: 'US', currencyCode: 'USD', minorUnit: 2, usdPerUnit: '1' },
    { code: 'JP', currencyCode: 'JPY', minorUnit: 0, usdPerUnit: '0.0067' },
  ],
};

const validLine =
  ',Asha Rao,asha.rao@acme.test,Engineering,Software Engineer,IN,INR,1250000.50,full_time,2024-04-01';

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join('\n');
}

function validate(...lines: string[]) {
  return validateImportRows(parseImportFile(csv(...lines)), context);
}

describe('parseImportFile', () => {
  it('reads rows keyed by header with 1-based line numbers counting the header', () => {
    const parsed = parseImportFile(csv(validLine, validLine.replace('asha.rao', 'other')));
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({
      line: 2,
      values: expect.objectContaining({ full_name: 'Asha Rao', salary: '1250000.50' }),
    });
    expect(parsed.rows[1]?.line).toBe(3);
  });

  it('accepts a UTF-8 BOM, CRLF line endings and loosely formatted headers', () => {
    const text = `﻿${HEADER.toUpperCase().replace('full_name', ' Full_Name ')}\r\n${validLine}\r\n`;
    const parsed = parseImportFile(text);
    expect(parsed.rows[0]?.values.full_name).toBe('Asha Rao');
  });

  it('accepts files without the optional employee_code and department columns', () => {
    const header =
      'full_name,email,job_title,country_code,currency,salary,employment_type,hire_date';
    const parsed = parseImportFile(
      `${header}\nAsha Rao,asha@acme.test,Software Engineer,IN,INR,100.00,full_time,2024-04-01`,
    );
    expect(parsed.rows).toHaveLength(1);
  });

  it('ignores export-only columns such as status and terminated_on', () => {
    const parsed = parseImportFile(`${HEADER},status,terminated_on\n${validLine},active,`);
    expect(parsed.rows[0]?.values).not.toHaveProperty('status');
  });

  it('rejects a file that is missing required headers', () => {
    expect(() => parseImportFile('full_name,email\nAsha,a@acme.test')).toThrow(ImportFileError);
    expect(() => parseImportFile('full_name,email\nAsha,a@acme.test')).toThrow(
      /job_title, country_code, currency, salary, employment_type, hire_date/,
    );
  });

  it('rejects an empty file', () => {
    expect(() => parseImportFile('')).toThrow(ImportFileError);
  });

  it('rejects malformed CSV such as an unclosed quote', () => {
    expect(() => parseImportFile(csv(',"Asha Rao,asha@acme.test'))).toThrow(ImportFileError);
  });

  it(`rejects more than ${MAX_IMPORT_ROWS} data rows`, () => {
    const lines = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => validLine);
    expect(() => parseImportFile(csv(...lines))).toThrow(/10,000/);
  });

  it('keeps line numbers correct when a quoted field spans lines', () => {
    const parsed = parseImportFile(
      csv(
        ',"Asha\nRao",a@acme.test,,Software Engineer,IN,INR,1.00,full_time,2024-04-01',
        validLine,
      ),
    );
    expect(parsed.rows.map((row) => row.line)).toEqual([2, 4]);
  });

  it('removes the formula-injection guard added on export', () => {
    const parsed = parseImportFile(
      csv(`,'=Asha Rao,asha@acme.test,,Software Engineer,IN,INR,1.00,full_time,2024-04-01`),
    );
    expect(parsed.rows[0]?.values.full_name).toBe('=Asha Rao');
  });
});

describe('validateImportRows', () => {
  it('converts a valid row, deriving ids and minor units', () => {
    const result = validate(validLine);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        line: 2,
        employeeCode: null,
        fullName: 'Asha Rao',
        email: 'asha.rao@acme.test',
        jobTitleId: 1,
        countryCode: 'IN',
        currencyCode: 'INR',
        salaryMinor: 125_000_050,
        employmentType: 'full_time',
        hireDate: '2024-04-01',
      },
    ]);
  });

  it('reads whole-yen JPY salaries and upper-cases codes', () => {
    const result = validate(
      'emp-000007,Chika Tanaka,Chika@Acme.test,,software engineer,jp,jpy,8500000,part_time,2022-01-10',
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      employeeCode: 'EMP-000007',
      email: 'chika@acme.test',
      countryCode: 'JP',
      currencyCode: 'JPY',
      salaryMinor: 8_500_000,
    });
  });

  it.each([
    [
      'job_title',
      validLine.replace('Software Engineer', 'Astronaut'),
      'Unknown job title "Astronaut"',
    ],
    [
      'department',
      validLine.replace('Engineering', 'People'),
      'Software Engineer belongs to Engineering, not People',
    ],
    ['country_code', validLine.replace(',IN,', ',XX,'), 'Unknown country "XX"'],
    ['currency', validLine.replace(',INR,', ',USD,'), 'Currency must be INR for IN'],
    [
      'salary',
      validLine.replace('1250000.50', '1250000.505'),
      'Amount must have at most 2 decimal places',
    ],
    [
      'salary',
      validLine.replace('1250000.50', '"12,50,000"'),
      'Salary must be a plain number such as 1250000.50',
    ],
    ['salary', validLine.replace('1250000.50', '0'), 'Salary must be greater than zero'],
    [
      'salary',
      validLine.replace('1250000.50', '500000000.00'),
      'Salary must not exceed the equivalent of 5,000,000 USD',
    ],
    [
      'hire_date',
      validLine.replace('2024-04-01', '01/04/2024'),
      'Hire date must be a valid date in YYYY-MM-DD format',
    ],
    [
      'hire_date',
      validLine.replace('2024-04-01', '2024-02-30'),
      'Hire date must be a valid date in YYYY-MM-DD format',
    ],
    [
      'hire_date',
      validLine.replace('2024-04-01', '2027-01-12'),
      'Hire date cannot be more than 90 days ahead',
    ],
    [
      'email',
      validLine.replace('asha.rao@acme.test', 'not-an-email'),
      'Email must be a valid email address',
    ],
    ['full_name', validLine.replace('Asha Rao', 'A'), 'Full name must be 2 to 120 characters'],
    [
      'employment_type',
      validLine.replace('full_time', 'intern'),
      'Employment type must be one of full_time, part_time, contract',
    ],
  ])('reports an invalid %s', (field, line, message) => {
    const result = validate(line);
    expect(result.errors).toEqual([{ row: 2, field, message }]);
    expect(result.rows).toEqual([]);
  });

  it('rejects decimals for a zero-decimal currency', () => {
    const result = validate(
      ',Chika Tanaka,c@acme.test,,Software Engineer,JP,JPY,8500000.5,full_time,2022-01-10',
    );
    expect(result.errors).toEqual([
      { row: 2, field: 'salary', message: 'Amount must not have decimal places for this currency' },
    ]);
  });

  it('accepts a department that matches regardless of case, or a blank one', () => {
    expect(validate(validLine.replace('Engineering', 'engineering')).errors).toEqual([]);
    expect(validate(validLine.replace('Engineering', '')).errors).toEqual([]);
  });

  it('reports every problem on a row, not just the first', () => {
    const result = validate(',A,bad,,Astronaut,IN,USD,abc,intern,yesterday');
    expect(result.errors.map((error) => error.field).sort()).toEqual([
      'currency',
      'email',
      'employment_type',
      'full_name',
      'hire_date',
      'job_title',
      'salary',
    ]);
  });

  it('reports a missing required value', () => {
    const result = validate(validLine.replace('asha.rao@acme.test', ''));
    expect(result.errors).toEqual([{ row: 2, field: 'email', message: 'Email is required' }]);
  });

  it('reports duplicate emails within the file against the later row', () => {
    const result = validate(
      validLine,
      validLine.replace('Asha Rao', 'Asha Copy').replace('asha.rao', 'ASHA.RAO'),
    );
    expect(result.errors).toEqual([
      { row: 3, field: 'email', message: 'Duplicate email in file (first used on row 2)' },
    ]);
    expect(result.rows).toHaveLength(1);
  });

  it('reports a repeated employee code within the file', () => {
    const line = validLine.replace(/^,/, 'EMP-000001,');
    const result = validate(line, line.replace('asha.rao', 'someone.else'));
    expect(result.errors).toEqual([
      {
        row: 3,
        field: 'employee_code',
        message: 'Duplicate employee code in file (first used on row 2)',
      },
    ]);
  });
});
