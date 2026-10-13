import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema } from './common';
import { employeeDetailResponseSchema, employeeListResponseSchema } from './employees';
import { importResultResponseSchema } from './import';
import {
  byCountryDetailResponseSchema,
  byJobTitleResponseSchema,
  insightsSummaryResponseSchema,
} from './insights';
import { referenceResponseSchema } from './reference';

const fx = { asOf: '2026-10-01', source: 'Illustrative static reference rates (approximate)' };
const inr = (amountMinor: number) => ({ amountMinor, currency: 'INR' });
const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

const listItem = {
  id: 1,
  employeeCode: 'EMP-000001',
  fullName: 'Asha Rao',
  email: 'asha.rao@acme.test',
  jobTitle: { id: 1, name: 'Software Engineer' },
  department: { id: 1, name: 'Engineering' },
  country: { code: 'IN', name: 'India' },
  salary: inr(250000000),
  salaryUsd: usd(2875000),
  employmentType: 'full_time',
  hireDate: '2021-04-01',
  status: 'active',
  terminatedOn: null,
};

describe('response schemas', () => {
  it('parses a paginated employee list with FX metadata', () => {
    const response = {
      data: [listItem],
      meta: { page: 1, pageSize: 25, total: 1, totalPages: 1, fx },
    };
    expect(employeeListResponseSchema.parse(response)).toEqual(response);
  });

  it('parses an employee detail with an initial history entry', () => {
    const response = {
      data: {
        ...listItem,
        createdAt: '2026-10-13T10:00:00.000Z',
        updatedAt: '2026-10-13T10:00:00.000Z',
        salaryHistory: [
          {
            id: 1,
            previous: null,
            new: inr(250000000),
            effectiveDate: '2021-04-01',
            reason: null,
            createdAt: '2026-10-13T10:00:00.000Z',
          },
        ],
      },
      meta: { fx },
    };
    expect(employeeDetailResponseSchema.parse(response)).toEqual(response);
  });

  it('parses reference data with string FX rates', () => {
    const response = {
      data: {
        countries: [
          {
            code: 'JP',
            name: 'Japan',
            currency: { code: 'JPY', name: 'Japanese Yen', minorUnit: 0 },
          },
        ],
        departments: [{ id: 1, name: 'Engineering' }],
        jobTitles: [{ id: 1, name: 'Software Engineer', departmentId: 1 }],
        fx: { ...fx, rates: { JPY: '0.0067' } },
      },
    };
    expect(referenceResponseSchema.parse(response)).toEqual(response);
  });

  it('parses insights payloads', () => {
    expect(
      insightsSummaryResponseSchema.parse({
        data: {
          activeHeadcount: 2,
          countryCount: 1,
          totalPayrollUsd: usd(200),
          averageSalaryUsd: usd(100),
          medianSalaryUsd: usd(100),
        },
        meta: { fx },
      }).data.activeHeadcount,
    ).toBe(2);

    const stats = { headcount: 1, min: inr(1), max: inr(1), average: inr(1), median: inr(1) };
    expect(
      byCountryDetailResponseSchema.parse({
        data: {
          country: { code: 'IN', name: 'India' },
          currency: 'INR',
          summary: stats,
          jobTitles: [
            {
              jobTitle: { id: 1, name: 'Software Engineer' },
              department: { id: 1, name: 'Engineering' },
              ...stats,
            },
          ],
          distribution: [{ fromMinor: 1, toMinor: 1, count: 1 }],
        },
      }).data.distribution,
    ).toHaveLength(1);

    expect(
      byJobTitleResponseSchema.parse({
        data: [
          {
            country: { code: 'IN', name: 'India' },
            headcount: 1,
            average: inr(1),
            median: inr(1),
            averageUsd: usd(1),
            medianUsd: usd(1),
          },
        ],
        meta: { fx },
      }).data,
    ).toHaveLength(1);
  });

  it('parses an import result with row-level errors', () => {
    const response = {
      data: {
        dryRun: true,
        totalRows: 2,
        toCreate: 1,
        toUpdate: 0,
        unchanged: 0,
        errors: [{ row: 3, field: 'currency', message: 'Currency must be JPY for JP' }],
      },
    };
    expect(importResultResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects an error envelope with an unknown code', () => {
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: 'TEAPOT', message: 'short and stout' } })
        .success,
    ).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'Employee not found' } })
        .success,
    ).toBe(true);
  });
});

describe('error codes', () => {
  it('include FORBIDDEN for cross-origin mutation attempts', () => {
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: 'FORBIDDEN', message: 'Origin not allowed' } })
        .success,
    ).toBe(true);
  });
});
