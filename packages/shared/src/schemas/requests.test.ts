import { describe, expect, it } from 'vitest';
import { loginRequestSchema } from './auth';
import { isoDateSchema } from './common';
import {
  employeeCreateSchema,
  employeeListQuerySchema,
  employeeUpdateSchema,
  terminateEmployeeSchema,
} from './employees';

const validCreate = {
  fullName: 'Asha Rao',
  email: 'asha.rao@acme.test',
  jobTitleId: 1,
  countryCode: 'IN',
  salaryMinor: 250000000,
  employmentType: 'full_time',
  hireDate: '2021-04-01',
};

describe('isoDateSchema', () => {
  it('accepts a calendar date in YYYY-MM-DD form', () => {
    expect(isoDateSchema.parse('2024-02-29')).toBe('2024-02-29');
  });

  it.each(['2023-02-29', '2024-13-01', '2024-1-5', '01/02/2024', '2024-01-01T00:00:00Z', ''])(
    'rejects %j',
    (value) => {
      expect(isoDateSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('employeeCreateSchema', () => {
  it('accepts a valid employee', () => {
    expect(employeeCreateSchema.parse(validCreate)).toEqual(validCreate);
  });

  it('trims the name and lower-cases the email', () => {
    const parsed = employeeCreateSchema.parse({
      ...validCreate,
      fullName: '  Asha Rao ',
      email: ' Asha.Rao@ACME.test ',
    });
    expect(parsed.fullName).toBe('Asha Rao');
    expect(parsed.email).toBe('asha.rao@acme.test');
  });

  it('rejects a client-supplied currency because currency is derived from country', () => {
    const result = employeeCreateSchema.safeParse({ ...validCreate, currency: 'INR' });
    expect(result.success).toBe(false);
  });

  it.each([0, -100, 10.5, Number.MAX_SAFE_INTEGER + 1])('rejects salaryMinor %d', (salary) => {
    expect(employeeCreateSchema.safeParse({ ...validCreate, salaryMinor: salary }).success).toBe(
      false,
    );
  });

  it('rejects names shorter than 2 or longer than 120 characters', () => {
    expect(employeeCreateSchema.safeParse({ ...validCreate, fullName: 'A' }).success).toBe(false);
    expect(
      employeeCreateSchema.safeParse({ ...validCreate, fullName: 'A'.repeat(121) }).success,
    ).toBe(false);
  });

  it('rejects an invalid email, employment type or country code', () => {
    expect(employeeCreateSchema.safeParse({ ...validCreate, email: 'nope' }).success).toBe(false);
    expect(
      employeeCreateSchema.safeParse({ ...validCreate, employmentType: 'intern' }).success,
    ).toBe(false);
    expect(employeeCreateSchema.safeParse({ ...validCreate, countryCode: 'in' }).success).toBe(
      false,
    );
  });

  it('reports every missing field', () => {
    const result = employeeCreateSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(
      Object.keys(validCreate).sort(),
    );
  });
});

describe('employeeUpdateSchema', () => {
  it('accepts a partial update with an optional salary change annotation', () => {
    const parsed = employeeUpdateSchema.parse({
      salaryMinor: 300000000,
      salaryChange: { effectiveDate: '2026-01-01', reason: 'Annual review' },
    });
    expect(parsed).toEqual({
      salaryMinor: 300000000,
      salaryChange: { effectiveDate: '2026-01-01', reason: 'Annual review' },
    });
  });

  it('rejects an empty update', () => {
    expect(employeeUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a reason longer than 200 characters', () => {
    expect(
      employeeUpdateSchema.safeParse({ salaryMinor: 1, salaryChange: { reason: 'x'.repeat(201) } })
        .success,
    ).toBe(false);
  });

  it('rejects fields that cannot be edited', () => {
    expect(employeeUpdateSchema.safeParse({ employeeCode: 'EMP-000001' }).success).toBe(false);
    expect(employeeUpdateSchema.safeParse({ status: 'terminated' }).success).toBe(false);
  });
});

describe('terminateEmployeeSchema', () => {
  it('requires a termination date', () => {
    expect(terminateEmployeeSchema.parse({ terminatedOn: '2026-09-30' })).toEqual({
      terminatedOn: '2026-09-30',
    });
    expect(terminateEmployeeSchema.safeParse({}).success).toBe(false);
  });
});

describe('employeeListQuerySchema', () => {
  it('applies defaults', () => {
    expect(employeeListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
      status: 'active',
      sort: 'fullName',
      order: 'asc',
    });
  });

  it('coerces query-string numbers', () => {
    const parsed = employeeListQuerySchema.parse({
      page: '3',
      pageSize: '50',
      departmentId: '2',
      jobTitleId: '7',
    });
    expect(parsed).toMatchObject({ page: 3, pageSize: 50, departmentId: 2, jobTitleId: 7 });
  });

  it('treats empty query parameters as absent', () => {
    const parsed = employeeListQuerySchema.parse({ search: '', country: '', departmentId: '' });
    expect(parsed.search).toBeUndefined();
    expect(parsed.country).toBeUndefined();
    expect(parsed.departmentId).toBeUndefined();
  });

  it('accepts every filter, sort and order', () => {
    const parsed = employeeListQuerySchema.parse({
      search: ' rao ',
      country: 'JP',
      employmentType: 'contract',
      status: 'all',
      sort: 'salaryUsd',
      order: 'desc',
    });
    expect(parsed).toMatchObject({
      search: 'rao',
      country: 'JP',
      employmentType: 'contract',
      status: 'all',
      sort: 'salaryUsd',
      order: 'desc',
    });
  });

  it.each([
    { page: '0' },
    { pageSize: '101' },
    { pageSize: '0' },
    { search: 'x'.repeat(101) },
    { sort: 'salary' },
    { order: 'up' },
    { status: 'deleted' },
  ])('rejects %j', (query) => {
    expect(employeeListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('loginRequestSchema', () => {
  it('requires an email and a non-empty password', () => {
    expect(loginRequestSchema.safeParse({ email: 'hr@acme.test', password: 'x' }).success).toBe(
      true,
    );
    expect(loginRequestSchema.safeParse({ email: 'hr@acme.test', password: '' }).success).toBe(
      false,
    );
    expect(loginRequestSchema.safeParse({ email: 'hr', password: 'x' }).success).toBe(false);
  });
});
