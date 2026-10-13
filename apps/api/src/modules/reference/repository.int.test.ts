import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../test/integration/test-database';
import { createReferenceRepository } from './repository';

const testDb = useTestDatabase();
const repository = () => createReferenceRepository(testDb.db);

const FX_SOURCE = 'Illustrative static reference rates (approximate)';

describe('reference repository', () => {
  it('returns countries with their currency, departments, titles and FX rates', async () => {
    const data = await repository().getReferenceData();

    expect(data.countries).toHaveLength(8);
    expect(data.countries).toContainEqual({
      code: 'JP',
      name: 'Japan',
      currency: { code: 'JPY', name: 'Japanese Yen', minorUnit: 0 },
    });
    expect(data.departments).toHaveLength(9);
    expect(data.jobTitles).toHaveLength(26);
    const engineering = data.departments.find((department) => department.name === 'Engineering');
    expect(data.jobTitles).toContainEqual({
      id: expect.any(Number),
      name: 'Staff Engineer',
      departmentId: engineering?.id,
    });
    expect(data.fx).toEqual({
      asOf: '2026-10-01',
      source: FX_SOURCE,
      rates: {
        AUD: '0.66',
        CAD: '0.73',
        EUR: '1.1',
        GBP: '1.3',
        INR: '0.0115',
        JPY: '0.0067',
        SGD: '0.76',
        USD: '1',
      },
    });
  });

  it('finds a country with its currency exponent and USD rate', async () => {
    await expect(repository().findCountry('JP')).resolves.toEqual({
      code: 'JP',
      name: 'Japan',
      currency: { code: 'JPY', name: 'Japanese Yen', minorUnit: 0 },
      usdPerUnit: '0.0067',
    });
    await expect(repository().findCountry('XX')).resolves.toBeUndefined();
  });

  it('finds a job title with its department', async () => {
    const { jobTitles } = await repository().getReferenceData();
    const recruiter = jobTitles.find((title) => title.name === 'Recruiter');
    await expect(repository().findJobTitle(recruiter?.id ?? 0)).resolves.toEqual({
      id: recruiter?.id,
      name: 'Recruiter',
      department: { id: recruiter?.departmentId, name: 'People' },
    });
    await expect(repository().findJobTitle(9999)).resolves.toBeUndefined();
  });

  it('exposes FX metadata for responses that contain USD figures', async () => {
    await expect(repository().getFxMeta()).resolves.toEqual({
      asOf: '2026-10-01',
      source: FX_SOURCE,
    });
  });
});
