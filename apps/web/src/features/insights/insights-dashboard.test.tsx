import type { ReferenceData } from '@acme/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, type RecordedRequest, stubFetch } from '@/test/fetch';
import { renderWithProviders } from '@/test/render';
import { InsightsDashboard } from './components/insights-dashboard';

const FX = { asOf: '2026-10-01', source: 'Illustrative static reference rates (approximate)' };
const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
const jpy = (amountMinor: number) => ({ amountMinor, currency: 'JPY' });

const reference: ReferenceData = {
  countries: [
    { code: 'JP', name: 'Japan', currency: { code: 'JPY', name: 'Japanese Yen', minorUnit: 0 } },
    {
      code: 'US',
      name: 'United States',
      currency: { code: 'USD', name: 'US Dollar', minorUnit: 2 },
    },
  ],
  departments: [{ id: 1, name: 'Engineering' }],
  jobTitles: [{ id: 1, name: 'Software Engineer', departmentId: 1 }],
  fx: { ...FX, rates: { JPY: '0.0067', USD: '1' } },
};

const japan = {
  country: { code: 'JP', name: 'Japan' },
  currency: 'JPY',
  headcount: 3,
  min: jpy(5_000_000),
  max: jpy(9_000_001),
  average: jpy(7_333_334),
  median: jpy(8_000_000),
  averageUsd: usd(4_913_334),
  medianUsd: usd(5_360_000),
};

function stubInsights() {
  return stubFetch({
    'GET /api/v1/reference': () => jsonResponse({ data: reference }),
    'GET /api/v1/insights/summary': () =>
      jsonResponse({
        data: {
          activeHeadcount: 9_700,
          countryCount: 8,
          totalPayrollUsd: usd(81_140_001_00),
          averageSalaryUsd: usd(6_761_667),
          medianSalaryUsd: usd(5_680_000),
        },
        meta: { fx: FX },
      }),
    'GET /api/v1/insights/by-country': () => jsonResponse({ data: [japan], meta: { fx: FX } }),
    'GET /api/v1/insights/by-department': () =>
      jsonResponse({
        data: [
          {
            department: { id: 1, name: 'Engineering' },
            headcount: 9,
            averageUsd: usd(7_848_889),
            medianUsd: usd(6_030_001),
            minUsd: usd(2_300_000),
            maxUsd: usd(20_000_000),
          },
        ],
        meta: { fx: FX },
      }),
    'GET /api/v1/insights/by-country/JP': () =>
      jsonResponse({
        data: {
          country: japan.country,
          currency: 'JPY',
          summary: {
            headcount: 3,
            min: japan.min,
            max: japan.max,
            average: japan.average,
            median: japan.median,
          },
          jobTitles: [
            {
              jobTitle: { id: 1, name: 'Software Engineer' },
              department: { id: 1, name: 'Engineering' },
              headcount: 2,
              min: jpy(8_000_000),
              max: jpy(9_000_001),
              average: jpy(8_500_001),
              median: jpy(8_500_001),
            },
          ],
          distribution: [{ fromMinor: 5_000_000, toMinor: 9_000_001, count: 3 }],
        },
      }),
    'GET /api/v1/insights/by-job-title/1': () =>
      jsonResponse({
        data: [
          {
            country: japan.country,
            headcount: 2,
            average: jpy(8_500_001),
            median: jpy(8_500_001),
            averageUsd: usd(5_695_000),
            medianUsd: usd(5_695_000),
          },
        ],
        meta: { fx: FX },
      }),
  });
}

function renderDashboard(searchParams = '') {
  renderWithProviders(<InsightsDashboard />, {
    wrapper: withNuqsTestingAdapter({ searchParams }),
  });
}

const paths = (requests: RecordedRequest[]) => requests.map((request) => request.url.pathname);

describe('InsightsDashboard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows org-wide totals as approximate USD with the FX date', async () => {
    stubInsights();
    renderDashboard();
    const summary = await screen.findByRole('region', { name: 'Summary' });
    expect(await within(summary).findByText('9,700')).toBeInTheDocument();
    expect(within(summary).getByText('≈ $81,140,001')).toBeInTheDocument();
    expect(within(summary).getByText('≈ $67,617')).toBeInTheDocument();
    expect(screen.getAllByText(/as of 2026-10-01/).length).toBeGreaterThan(0);
  });

  it('lists each country in local currency with approximate USD averages', async () => {
    stubInsights();
    renderDashboard();
    const table = await screen.findByRole('table', { name: 'Pay by country' });
    const row = within(table).getByText('Japan').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('¥5,000,000');
    expect(row).toHaveTextContent('¥9,000,001');
    expect(row).toHaveTextContent('≈ $49,133');
  });

  it('drills into a country, showing its job titles', async () => {
    const { requests } = stubInsights();
    renderDashboard();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Country to explore'), 'JP');
    const table = await screen.findByRole('table', { name: 'Pay by job title in Japan' });
    expect(within(table).getByText('Software Engineer')).toBeInTheDocument();
    expect(within(table).getAllByText('¥8,500,001')).toHaveLength(2);
    expect(paths(requests)).toContain('/api/v1/insights/by-country/JP');
  });

  it('compares a role across countries', async () => {
    stubInsights();
    renderDashboard('?jobTitleId=1');
    const table = await screen.findByRole('table', { name: 'Software Engineer across countries' });
    expect(within(table).getByText('Japan').closest('tr')).toHaveTextContent('≈ $56,950');
  });

  it('applies the employment type filter to every insight request', async () => {
    const { requests } = stubInsights();
    renderDashboard('?employmentType=contract');
    await screen.findByRole('table', { name: 'Pay by country' });
    await waitFor(() => {
      const insightRequests = requests.filter((request) =>
        request.url.pathname.startsWith('/api/v1/insights'),
      );
      expect(insightRequests.length).toBeGreaterThanOrEqual(3);
      for (const request of insightRequests) {
        expect(request.url.searchParams.get('employmentType')).toBe('contract');
      }
    });
  });
});
