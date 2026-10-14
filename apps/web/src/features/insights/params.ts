import { EMPLOYMENT_TYPES, type InsightsQuery } from '@acme/shared';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';

/** Drill-down choices live in the URL so an answer to a pay question can be shared as a link. */
export function useInsightsParams() {
  return useQueryStates({
    employmentType: parseAsStringLiteral(EMPLOYMENT_TYPES),
    country: parseAsString.withDefault(''),
    jobTitleId: parseAsInteger,
  });
}

export function toInsightsFilter(employmentType: InsightsQuery['employmentType'] | null) {
  return employmentType ? { employmentType } : {};
}
