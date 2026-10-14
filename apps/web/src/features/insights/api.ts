import {
  byCountryDetailResponseSchema,
  byCountryResponseSchema,
  byDepartmentResponseSchema,
  byJobTitleResponseSchema,
  type InsightsQuery,
  insightsSummaryResponseSchema,
} from '@acme/shared';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

const keys = {
  summary: (filter: InsightsQuery) => ['insights', 'summary', filter] as const,
  byCountry: (filter: InsightsQuery) => ['insights', 'by-country', filter] as const,
  country: (code: string, filter: InsightsQuery) => ['insights', 'country', code, filter] as const,
  jobTitle: (id: number, filter: InsightsQuery) => ['insights', 'job-title', id, filter] as const,
  byDepartment: (filter: InsightsQuery) => ['insights', 'by-department', filter] as const,
};

export function useInsightsSummary(filter: InsightsQuery) {
  return useQuery({
    queryKey: keys.summary(filter),
    queryFn: () =>
      apiClient.request('/insights/summary', {
        query: filter,
        schema: insightsSummaryResponseSchema,
      }),
  });
}

export function useInsightsByCountry(filter: InsightsQuery) {
  return useQuery({
    queryKey: keys.byCountry(filter),
    queryFn: () =>
      apiClient.request('/insights/by-country', { query: filter, schema: byCountryResponseSchema }),
  });
}

export function useCountryInsight(code: string, filter: InsightsQuery) {
  return useQuery({
    queryKey: keys.country(code, filter),
    queryFn: () =>
      apiClient.request(`/insights/by-country/${code}`, {
        query: filter,
        schema: byCountryDetailResponseSchema,
      }),
    enabled: code !== '',
  });
}

export function useRoleComparison(jobTitleId: number | null, filter: InsightsQuery) {
  return useQuery({
    queryKey: keys.jobTitle(jobTitleId ?? 0, filter),
    queryFn: () =>
      apiClient.request(`/insights/by-job-title/${jobTitleId}`, {
        query: filter,
        schema: byJobTitleResponseSchema,
      }),
    enabled: jobTitleId !== null,
  });
}

export function useInsightsByDepartment(filter: InsightsQuery) {
  return useQuery({
    queryKey: keys.byDepartment(filter),
    queryFn: () =>
      apiClient.request('/insights/by-department', {
        query: filter,
        schema: byDepartmentResponseSchema,
      }),
  });
}
