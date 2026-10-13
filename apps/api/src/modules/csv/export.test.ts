import type { EmployeeListItem } from '@acme/shared';
import { text } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { createExportStream, EXPORT_COLUMNS, exportFilename, toExportRecord } from './export';
import { escapeFormula } from './formula-escape';

const MINOR_UNITS = { INR: 2, JPY: 0, USD: 2 };

const asha: EmployeeListItem = {
  id: 1,
  employeeCode: 'EMP-000001',
  fullName: 'Asha Rao',
  email: 'asha.rao@acme.test',
  jobTitle: { id: 1, name: 'Software Engineer' },
  department: { id: 1, name: 'Engineering' },
  country: { code: 'IN', name: 'India' },
  salary: { amountMinor: 125_000_000, currency: 'INR' },
  salaryUsd: { amountMinor: 1_437_500, currency: 'USD' },
  employmentType: 'full_time',
  hireDate: '2021-04-01',
  status: 'active',
  terminatedOn: null,
};

async function* items(...list: EmployeeListItem[]) {
  yield* list;
}

describe('escapeFormula', () => {
  it.each(['=SUM(A1)', '+1', '-1', '@cmd', '\tx', '\rx'])(
    'prefixes %j with an apostrophe',
    (value) => {
      expect(escapeFormula(value)).toBe(`'${value}`);
    },
  );

  it('leaves ordinary text alone, including formula characters later in the text', () => {
    expect(escapeFormula('Asha Rao')).toBe('Asha Rao');
    expect(escapeFormula('a=b')).toBe('a=b');
    expect(escapeFormula('')).toBe('');
  });
});

describe('toExportRecord', () => {
  it('maps a list item to the export columns, in order', () => {
    expect(EXPORT_COLUMNS).toEqual([
      'employee_code',
      'full_name',
      'email',
      'department',
      'job_title',
      'country_code',
      'currency',
      'salary',
      'employment_type',
      'hire_date',
      'status',
      'terminated_on',
    ]);
    expect(toExportRecord(asha, MINOR_UNITS)).toEqual([
      'EMP-000001',
      'Asha Rao',
      'asha.rao@acme.test',
      'Engineering',
      'Software Engineer',
      'IN',
      'INR',
      '1250000.00',
      'full_time',
      '2021-04-01',
      'active',
      '',
    ]);
  });

  it('writes JPY salaries without decimals and includes the termination date', () => {
    const record = toExportRecord(
      {
        ...asha,
        country: { code: 'JP', name: 'Japan' },
        salary: { amountMinor: 8_500_000, currency: 'JPY' },
        status: 'terminated',
        terminatedOn: '2025-06-30',
      },
      MINOR_UNITS,
    );
    expect(record[7]).toBe('8500000');
    expect(record[11]).toBe('2025-06-30');
  });

  it('neutralises formula injection in text cells', () => {
    const record = toExportRecord({ ...asha, fullName: '=HYPERLINK("http://evil")' }, MINOR_UNITS);
    expect(record[1]).toBe(`'=HYPERLINK("http://evil")`);
  });
});

describe('createExportStream', () => {
  it('streams a header row and properly quoted CSV rows', async () => {
    const csv = await text(
      createExportStream(items(asha, { ...asha, id: 2, fullName: 'Rao, Asha "AR"' }), MINOR_UNITS),
    );
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe(EXPORT_COLUMNS.join(','));
    expect(lines[1]).toBe(
      'EMP-000001,Asha Rao,asha.rao@acme.test,Engineering,Software Engineer,IN,INR,1250000.00,full_time,2021-04-01,active,',
    );
    expect(lines[2]).toContain('"Rao, Asha ""AR"""');
  });
});

describe('exportFilename', () => {
  it('includes the export date', () => {
    expect(exportFilename('2026-10-13')).toBe('employees-2026-10-13.csv');
  });
});
