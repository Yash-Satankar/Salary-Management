import type { InsightsRepository } from '../../modules/insights/repository';

const zeroUsd = { amountMinor: 0, currency: 'USD' };

/** Default for app tests that do not exercise insights. */
export function emptyInsightsRepository(): InsightsRepository {
  return {
    summary: async () => ({
      activeHeadcount: 0,
      countryCount: 0,
      totalPayrollUsd: zeroUsd,
      averageSalaryUsd: zeroUsd,
      medianSalaryUsd: zeroUsd,
    }),
    byCountry: async () => [],
    countryDetail: async () => undefined,
    byJobTitle: async () => [],
    byDepartment: async () => [],
  };
}
