import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, SESSION_COOKIE } from '../../test/http/test-app';
import type { InsightsRepository } from './repository';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
const FX = { asOf: '2026-10-01', source: 'Illustrative static reference rates (approximate)' };

/** Records the filters it receives and returns fixed, minimal results. */
function fakeInsightsRepository() {
  const calls: unknown[] = [];
  const repository: InsightsRepository = {
    summary: async (filter) => {
      calls.push(filter);
      return {
        activeHeadcount: 1,
        countryCount: 1,
        totalPayrollUsd: usd(100),
        averageSalaryUsd: usd(100),
        medianSalaryUsd: usd(100),
      };
    },
    byCountry: async () => [],
    countryDetail: async (code) =>
      code === 'IN'
        ? {
            country: { code: 'IN', name: 'India' },
            currency: 'INR',
            summary: {
              headcount: 0,
              min: { amountMinor: 0, currency: 'INR' },
              max: { amountMinor: 0, currency: 'INR' },
              average: { amountMinor: 0, currency: 'INR' },
              median: { amountMinor: 0, currency: 'INR' },
            },
            jobTitles: [],
            distribution: [],
          }
        : undefined,
    byJobTitle: async () => [],
    byDepartment: async () => [],
  };
  return { repository, calls };
}

function setup() {
  const fake = fakeInsightsRepository();
  const app = buildTestApp({ insightsRepository: fake.repository });
  const get = (path: string) => request(app).get(`/api/v1${path}`).set('Cookie', SESSION_COOKIE);
  return { ...fake, app, get };
}

describe('insights API', () => {
  it('requires a session', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/v1/insights/summary')).status).toBe(401);
  });

  it('attaches FX metadata to responses containing USD figures', async () => {
    const { get } = setup();
    for (const path of [
      '/insights/summary',
      '/insights/by-country',
      '/insights/by-job-title/1',
      '/insights/by-department',
    ]) {
      const response = await get(path);
      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({ fx: FX });
    }
  });

  it('passes the employment type filter through', async () => {
    const { get, calls } = setup();
    await get('/insights/summary?employmentType=contract');
    expect(calls).toEqual([{ employmentType: 'contract' }]);
  });

  it('rejects an unknown employment type with 400', async () => {
    const { get } = setup();
    expect((await get('/insights/summary?employmentType=intern')).status).toBe(400);
  });

  it('returns a country drill-down and 404 for an unknown country', async () => {
    const { get } = setup();
    const found = await get('/insights/by-country/IN');
    expect(found.status).toBe(200);
    expect(found.body.data.country.code).toBe('IN');
    expect((await get('/insights/by-country/XX')).status).toBe(404);
    expect((await get('/insights/by-country/india')).status).toBe(400);
  });

  it('returns 404 for an unknown job title', async () => {
    const { get } = setup();
    expect((await get('/insights/by-job-title/999')).status).toBe(404);
  });
});
