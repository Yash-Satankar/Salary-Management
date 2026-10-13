import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../test/integration/test-database';
import { createInsightsRepository } from './repository';

const testDb = useTestDatabase();
const repository = () => createInsightsRepository(testDb.db);

/*
 * Hand-computed fixture: 12 active employees in 3 countries plus 1 terminated (always excluded).
 * USD cents per employee = salary_minor / 10^minor_unit × usd_per_unit × 100, kept unrounded until
 * aggregation (INR 0.0115, JPY 0.0067, USD 1).
 *
 *  key  country title                 type       local (minor)       USD cents
 *  U1   US      Software Engineer     full_time   10,000,000  ($100,000.00)  10,000,000
 *  U2   US      Software Engineer     full_time   12,000,000  ($120,000.00)  12,000,000
 *  U3   US      Engineering Manager   full_time   20,000,000  ($200,000.00)  20,000,000
 *  U4   US      Recruiter             part_time    6,000,000   ($60,000.00)   6,000,000
 *  U5   US      Software Engineer     terminated  50,000,000  — excluded everywhere
 *  I1   IN      Software Engineer     full_time  200,000,000 (₹2,000,000.00)  2,300,000
 *  I2   IN      Software Engineer     full_time  300,000,000 (₹3,000,000.00)  3,450,000
 *  I3   IN      Software Engineer     full_time  400,000,000 (₹4,000,000.00)  4,600,000
 *  I4   IN      Recruiter             full_time  100,000,050 (₹1,000,000.50)  1,150,000.575
 *  I5   IN      Engineering Manager   contract   600,000,000 (₹6,000,000.00)  6,900,000
 *  J1   JP      Software Engineer     full_time    8,000,000  (¥8,000,000)    5,360,000
 *  J2   JP      Software Engineer     full_time    9,000,001  (¥9,000,001)    6,030,000.67
 *  J3   JP      Recruiter             full_time    5,000,000  (¥5,000,000)    3,350,000
 */
const FIXTURE = [
  ['U1', 'US', 'USD', 'Software Engineer', 'full_time', 10_000_000],
  ['U2', 'US', 'USD', 'Software Engineer', 'full_time', 12_000_000],
  ['U3', 'US', 'USD', 'Engineering Manager', 'full_time', 20_000_000],
  ['U4', 'US', 'USD', 'Recruiter', 'part_time', 6_000_000],
  ['I1', 'IN', 'INR', 'Software Engineer', 'full_time', 200_000_000],
  ['I2', 'IN', 'INR', 'Software Engineer', 'full_time', 300_000_000],
  ['I3', 'IN', 'INR', 'Software Engineer', 'full_time', 400_000_000],
  ['I4', 'IN', 'INR', 'Recruiter', 'full_time', 100_000_050],
  ['I5', 'IN', 'INR', 'Engineering Manager', 'contract', 600_000_000],
  ['J1', 'JP', 'JPY', 'Software Engineer', 'full_time', 8_000_000],
  ['J2', 'JP', 'JPY', 'Software Engineer', 'full_time', 9_000_001],
  ['J3', 'JP', 'JPY', 'Recruiter', 'full_time', 5_000_000],
] as const;

const titleIds = new Map<string, number>();
const departmentIds = new Map<string, number>();

beforeEach(async () => {
  const titles = await testDb.db
    .selectFrom('job_titles')
    .innerJoin('departments', 'departments.id', 'job_titles.department_id')
    .select([
      'job_titles.id',
      'job_titles.name',
      'departments.id as departmentId',
      'departments.name as department',
    ])
    .execute();
  for (const title of titles) {
    titleIds.set(title.name, title.id);
    departmentIds.set(title.department, title.departmentId);
  }
  const titleId = (name: string) => titleIds.get(name) ?? 0;

  await testDb.db
    .insertInto('employees')
    .values([
      ...FIXTURE.map(([key, country, currency, title, type, salary]) => ({
        full_name: `Employee ${key}`,
        email: `${key.toLowerCase()}@acme.test`,
        job_title_id: titleId(title),
        country_code: country,
        currency_code: currency,
        salary_minor: salary,
        employment_type: type,
        hire_date: '2020-01-01',
      })),
      {
        full_name: 'Employee U5',
        email: 'u5@acme.test',
        job_title_id: titleId('Software Engineer'),
        country_code: 'US',
        currency_code: 'USD',
        salary_minor: 50_000_000,
        employment_type: 'full_time' as const,
        hire_date: '2020-01-01',
        status: 'terminated' as const,
        terminated_on: '2025-01-01',
      },
    ])
    .execute();
});

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
const inr = (amountMinor: number) => ({ amountMinor, currency: 'INR' });
const jpy = (amountMinor: number) => ({ amountMinor, currency: 'JPY' });
const usdLocal = usd;

describe('insights: summary', () => {
  it('aggregates active employees in USD', async () => {
    // Total = 48,000,000 (US) + 18,400,000.575 (IN) + 14,740,000.67 (JP) = 81,140,001.245 → 81,140,001
    // Average = 81,140,001.245 / 12 = 6,761,666.77 → 6,761,667
    // Median of 12 = (5,360,000 + 6,000,000) / 2 = 5,680,000
    await expect(repository().summary({})).resolves.toEqual({
      activeHeadcount: 12,
      countryCount: 3,
      totalPayrollUsd: usd(81_140_001),
      averageSalaryUsd: usd(6_761_667),
      medianSalaryUsd: usd(5_680_000),
    });
  });

  it('filters by employment type', async () => {
    // full_time drops U4 and I5: total 42,000,000 + 11,500,000.575 + 14,740,000.67 = 68,240,001.245
    // Average 68,240,001.245 / 10 = 6,824,000.12 → 6,824,000; median (4,600,000 + 5,360,000) / 2
    await expect(repository().summary({ employmentType: 'full_time' })).resolves.toEqual({
      activeHeadcount: 10,
      countryCount: 3,
      totalPayrollUsd: usd(68_240_001),
      averageSalaryUsd: usd(6_824_000),
      medianSalaryUsd: usd(4_980_000),
    });
  });
});

describe('insights: by country', () => {
  it('returns local statistics and USD averages, largest headcount first', async () => {
    await expect(repository().byCountry({})).resolves.toEqual([
      {
        country: { code: 'IN', name: 'India' },
        currency: 'INR',
        headcount: 5,
        min: inr(100_000_050),
        max: inr(600_000_000),
        // 1,600,000,050 / 5
        average: inr(320_000_010),
        median: inr(300_000_000),
        // 18,400,000.575 / 5 = 3,680,000.115 → 3,680,000
        averageUsd: usd(3_680_000),
        medianUsd: usd(3_450_000),
      },
      {
        country: { code: 'US', name: 'United States' },
        currency: 'USD',
        headcount: 4,
        min: usdLocal(6_000_000),
        max: usdLocal(20_000_000),
        average: usdLocal(12_000_000),
        // (10,000,000 + 12,000,000) / 2
        median: usdLocal(11_000_000),
        averageUsd: usd(12_000_000),
        medianUsd: usd(11_000_000),
      },
      {
        country: { code: 'JP', name: 'Japan' },
        currency: 'JPY',
        headcount: 3,
        min: jpy(5_000_000),
        max: jpy(9_000_001),
        // 22,000,001 / 3 = 7,333,333.67 → 7,333,334 whole yen (JPY has no minor digits)
        average: jpy(7_333_334),
        median: jpy(8_000_000),
        // 14,740,000.67 / 3 = 4,913,333.56 → 4,913,334
        averageUsd: usd(4_913_334),
        medianUsd: usd(5_360_000),
      },
    ]);
  });
});

describe('insights: country detail', () => {
  it('returns the summary, per-title breakdown and a 10-bucket distribution', async () => {
    const detail = await repository().countryDetail('IN', {});
    expect(detail?.country).toEqual({ code: 'IN', name: 'India' });
    expect(detail?.currency).toBe('INR');
    expect(detail?.summary).toEqual({
      headcount: 5,
      min: inr(100_000_050),
      max: inr(600_000_000),
      average: inr(320_000_010),
      median: inr(300_000_000),
    });
    // Ordered by headcount, then title name.
    expect(detail?.jobTitles).toEqual([
      {
        jobTitle: { id: titleIds.get('Software Engineer'), name: 'Software Engineer' },
        department: { id: departmentIds.get('Engineering'), name: 'Engineering' },
        headcount: 3,
        min: inr(200_000_000),
        max: inr(400_000_000),
        average: inr(300_000_000),
        median: inr(300_000_000),
      },
      {
        jobTitle: { id: titleIds.get('Engineering Manager'), name: 'Engineering Manager' },
        department: { id: departmentIds.get('Engineering'), name: 'Engineering' },
        headcount: 1,
        min: inr(600_000_000),
        max: inr(600_000_000),
        average: inr(600_000_000),
        median: inr(600_000_000),
      },
      {
        jobTitle: { id: titleIds.get('Recruiter'), name: 'Recruiter' },
        department: { id: departmentIds.get('People'), name: 'People' },
        headcount: 1,
        min: inr(100_000_050),
        max: inr(100_000_050),
        average: inr(100_000_050),
        median: inr(100_000_050),
      },
    ]);
  });

  it('puts the maximum salary in the last bucket of 10 equal-width buckets', async () => {
    // Range 100,000,050 → 600,000,000 is 499,999,950 wide, so each bucket is 49,999,995.
    // ₹2,000,000.00 (200,000,000) is just below bucket 3's start (200,000,040) → bucket 2.
    // The maximum, 600,000,000, would be width_bucket 11 and is clamped into bucket 10.
    const detail = await repository().countryDetail('IN', {});
    const start = 100_000_050;
    const width = 49_999_995;
    const counts = [1, 1, 0, 1, 0, 1, 0, 0, 0, 1];
    expect(detail?.distribution).toEqual(
      counts.map((count, index) => ({
        fromMinor: start + index * width,
        toMinor: index === 9 ? 600_000_000 : start + (index + 1) * width,
        count,
      })),
    );
  });

  it('returns a single bucket when every salary is equal', async () => {
    // Only I5 is a contractor in India.
    const detail = await repository().countryDetail('IN', { employmentType: 'contract' });
    expect(detail?.distribution).toEqual([
      { fromMinor: 600_000_000, toMinor: 600_000_000, count: 1 },
    ]);
  });

  it('returns undefined for an unknown country', async () => {
    await expect(repository().countryDetail('XX', {})).resolves.toBeUndefined();
  });
});

describe('insights: role across countries', () => {
  it('compares one job title across countries, highest USD average first', async () => {
    const rows = await repository().byJobTitle(titleIds.get('Software Engineer') ?? 0, {});
    expect(rows).toEqual([
      {
        country: { code: 'US', name: 'United States' },
        headcount: 2,
        average: usdLocal(11_000_000),
        median: usdLocal(11_000_000),
        averageUsd: usd(11_000_000),
        medianUsd: usd(11_000_000),
      },
      {
        country: { code: 'JP', name: 'Japan' },
        headcount: 2,
        // (8,000,000 + 9,000,001) / 2 = 8,500,000.5 → rounds half up to 8,500,001
        average: jpy(8_500_001),
        median: jpy(8_500_001),
        // (5,360,000 + 6,030,000.67) / 2 = 5,695,000.335 → 5,695,000
        averageUsd: usd(5_695_000),
        medianUsd: usd(5_695_000),
      },
      {
        country: { code: 'IN', name: 'India' },
        headcount: 3,
        average: inr(300_000_000),
        median: inr(300_000_000),
        // (2,300,000 + 3,450,000 + 4,600,000) / 3
        averageUsd: usd(3_450_000),
        medianUsd: usd(3_450_000),
      },
    ]);
  });
});

describe('insights: by department', () => {
  it('summarises each department in USD', async () => {
    await expect(repository().byDepartment({})).resolves.toEqual([
      {
        department: { id: departmentIds.get('Engineering'), name: 'Engineering' },
        // U1 U2 U3 I1 I2 I3 I5 J1 J2: sum 70,640,000.67 / 9 = 7,848,888.96 → 7,848,889
        headcount: 9,
        averageUsd: usd(7_848_889),
        // 5th of 9 sorted values: 6,030,000.67 → 6,030,001
        medianUsd: usd(6_030_001),
        minUsd: usd(2_300_000),
        maxUsd: usd(20_000_000),
      },
      {
        department: { id: departmentIds.get('People'), name: 'People' },
        // U4 I4 J3: 10,500,000.575 / 3 = 3,500,000.19 → 3,500,000
        headcount: 3,
        averageUsd: usd(3_500_000),
        medianUsd: usd(3_350_000),
        // 1,150,000.575 → 1,150,001
        minUsd: usd(1_150_001),
        maxUsd: usd(6_000_000),
      },
    ]);
  });
});
