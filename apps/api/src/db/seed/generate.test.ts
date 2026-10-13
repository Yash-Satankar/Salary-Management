import { describe, expect, it } from 'vitest';
import { generateSeedData, type SeedReference } from './generate';
import { US_BASE_SALARY_USD } from './salary-model';

const CURRENCIES: Record<string, [string, number, string]> = {
  IN: ['INR', 2, '0.0115'],
  US: ['USD', 2, '1'],
  GB: ['GBP', 2, '1.30'],
  JP: ['JPY', 0, '0.0067'],
  DE: ['EUR', 2, '1.10'],
  CA: ['CAD', 2, '0.73'],
  AU: ['AUD', 2, '0.66'],
  SG: ['SGD', 2, '0.76'],
};

const reference: SeedReference = {
  countries: Object.entries(CURRENCIES).map(([code, [currencyCode, minorUnit, usdPerUnit]]) => ({
    code,
    currencyCode,
    minorUnit,
    usdPerUnit,
  })),
  jobTitles: Object.keys(US_BASE_SALARY_USD).map((name, index) => ({ id: index + 1, name })),
};

const options = { seed: 42, employeeCount: 10_000, referenceDate: '2026-10-01' };
const data = generateSeedData(reference, options);

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  }
  return counts;
}

describe('generateSeedData', () => {
  it('creates exactly the requested number of employees', () => {
    expect(data).toHaveLength(10_000);
  });

  it('follows the SPEC country mix exactly', () => {
    expect(countBy(data, (employee) => employee.countryCode)).toEqual({
      IN: 3500,
      US: 2000,
      GB: 1000,
      JP: 800,
      DE: 800,
      CA: 700,
      AU: 600,
      SG: 600,
    });
  });

  it('pairs each employee with their country currency', () => {
    for (const employee of data.slice(0, 500)) {
      expect(employee.currencyCode).toBe(CURRENCIES[employee.countryCode]?.[0]);
    }
  });

  it('builds unique firstname.lastname.<n>@acme.test emails', () => {
    const emails = data.map((employee) => employee.email);
    expect(new Set(emails).size).toBe(emails.length);
    expect(emails.every((email) => /^[a-z0-9]+\.[a-z0-9]+\.\d+@acme\.test$/.test(email))).toBe(
      true,
    );
  });

  it('spreads employment types roughly 85/8/7', () => {
    const types = countBy(data, (employee) => employee.employmentType);
    expect(types.full_time).toBeGreaterThan(8200);
    expect(types.full_time).toBeLessThan(8800);
    expect(types.part_time).toBeGreaterThan(600);
    expect(types.contract).toBeGreaterThan(500);
  });

  it('terminates about 3% with a termination date between hire and reference date', () => {
    const terminated = data.filter((employee) => employee.terminatedOn !== null);
    expect(terminated.length).toBeGreaterThan(200);
    expect(terminated.length).toBeLessThan(400);
    for (const employee of terminated) {
      expect(employee.terminatedOn! >= employee.hireDate).toBe(true);
      expect(employee.terminatedOn! <= options.referenceDate).toBe(true);
    }
  });

  it('hires everyone within the 12 years before the reference date', () => {
    const hireDates = data.map((employee) => employee.hireDate).sort();
    expect(hireDates[0]! >= '2014-10-01').toBe(true);
    expect(hireDates.at(-1)! <= options.referenceDate).toBe(true);
  });

  it('gives every employee an initial history row plus 0–3 chronological changes ending at the current salary', () => {
    const changeCounts = new Set<number>();
    for (const employee of data) {
      const [initial, ...changes] = employee.history;
      expect(initial?.previousSalaryMinor).toBeNull();
      expect(initial?.effectiveDate).toBe(employee.hireDate);
      changeCounts.add(changes.length);
      expect(changes.length).toBeLessThanOrEqual(3);
      for (let index = 1; index < employee.history.length; index += 1) {
        const previous = employee.history[index - 1]!;
        const current = employee.history[index]!;
        expect(current.previousSalaryMinor).toBe(previous.newSalaryMinor);
        expect(current.effectiveDate > previous.effectiveDate).toBe(true);
      }
      expect(employee.history.at(-1)?.newSalaryMinor).toBe(employee.salaryMinor);
      expect(employee.history.every((entry) => entry.newSalaryMinor > 0)).toBe(true);
    }
    expect([...changeCounts].sort()).toEqual([0, 1, 2, 3]);
  });

  it('is identical for the same seed and different for another seed', () => {
    const small = { ...options, employeeCount: 50 };
    expect(generateSeedData(reference, small)).toEqual(generateSeedData(reference, small));
    expect(generateSeedData(reference, { ...small, seed: 7 })).not.toEqual(
      generateSeedData(reference, small),
    );
  });
});
