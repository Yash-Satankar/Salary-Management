import { z } from 'zod';
import { EMPLOYMENT_TYPES } from '../enums';
import {
  countryRefSchema,
  currencyCodeSchema,
  fxOnlyMetaSchema,
  moneySchema,
  namedRefSchema,
  optionalQueryParam,
} from './common';

export const insightsQuerySchema = z.object({
  employmentType: optionalQueryParam(z.enum(EMPLOYMENT_TYPES)),
});
export type InsightsQuery = z.infer<typeof insightsQuerySchema>;

const headcount = z.number().int().nonnegative();

export const salaryStatsSchema = z.object({
  headcount,
  min: moneySchema,
  max: moneySchema,
  average: moneySchema,
  median: moneySchema,
});
export type SalaryStats = z.infer<typeof salaryStatsSchema>;

export const insightsSummarySchema = z.object({
  activeHeadcount: headcount,
  countryCount: headcount,
  totalPayrollUsd: moneySchema,
  averageSalaryUsd: moneySchema,
  medianSalaryUsd: moneySchema,
});
export type InsightsSummary = z.infer<typeof insightsSummarySchema>;
export const insightsSummaryResponseSchema = z.object({
  data: insightsSummarySchema,
  meta: fxOnlyMetaSchema,
});

export const countryInsightSchema = salaryStatsSchema.extend({
  country: countryRefSchema,
  currency: currencyCodeSchema,
  averageUsd: moneySchema,
  medianUsd: moneySchema,
});
export type CountryInsight = z.infer<typeof countryInsightSchema>;
export const byCountryResponseSchema = z.object({
  data: z.array(countryInsightSchema),
  meta: fxOnlyMetaSchema,
});

export const distributionBucketSchema = z.object({
  fromMinor: z.number().int(),
  toMinor: z.number().int(),
  count: headcount,
});
export type DistributionBucket = z.infer<typeof distributionBucketSchema>;

export const jobTitleInsightSchema = salaryStatsSchema.extend({
  jobTitle: namedRefSchema,
  department: namedRefSchema,
});
export type JobTitleInsight = z.infer<typeof jobTitleInsightSchema>;

export const countryDetailInsightSchema = z.object({
  country: countryRefSchema,
  currency: currencyCodeSchema,
  summary: salaryStatsSchema,
  jobTitles: z.array(jobTitleInsightSchema),
  distribution: z.array(distributionBucketSchema),
});
export type CountryDetailInsight = z.infer<typeof countryDetailInsightSchema>;
export const byCountryDetailResponseSchema = z.object({ data: countryDetailInsightSchema });

export const roleCountryInsightSchema = z.object({
  country: countryRefSchema,
  headcount,
  average: moneySchema,
  median: moneySchema,
  averageUsd: moneySchema,
  medianUsd: moneySchema,
});
export type RoleCountryInsight = z.infer<typeof roleCountryInsightSchema>;
export const byJobTitleResponseSchema = z.object({
  data: z.array(roleCountryInsightSchema),
  meta: fxOnlyMetaSchema,
});

export const departmentInsightSchema = z.object({
  department: namedRefSchema,
  headcount,
  averageUsd: moneySchema,
  medianUsd: moneySchema,
  minUsd: moneySchema,
  maxUsd: moneySchema,
});
export type DepartmentInsight = z.infer<typeof departmentInsightSchema>;
export const byDepartmentResponseSchema = z.object({
  data: z.array(departmentInsightSchema),
  meta: fxOnlyMetaSchema,
});
