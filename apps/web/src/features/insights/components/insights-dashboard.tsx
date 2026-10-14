'use client';

import {
  EMPLOYMENT_TYPES,
  type CountryInsight,
  type InsightsQuery,
  type MoneyDto,
  type ReferenceData,
  type SalaryStats,
} from '@acme/shared';
import type { ReactNode } from 'react';
import { FxDisclaimer } from '@/components/fx-disclaimer';
import { EmptyState, ErrorState, LoadingRows } from '@/components/query-states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EMPLOYMENT_TYPE_LABELS } from '@/features/employees/labels';
import { minorUnitOf, useReference } from '@/features/reference/hooks';
import { formatSalary, formatUsdApprox } from '@/lib/money';
import {
  useCountryInsight,
  useInsightsByCountry,
  useInsightsByDepartment,
  useInsightsSummary,
  useRoleComparison,
} from '../api';
import { toInsightsFilter, useInsightsParams } from '../params';
import { AverageMedianChart, centsToDollars, DistributionChart } from './charts';

const number = new Intl.NumberFormat('en-US');

export function InsightsDashboard() {
  const [params, setParams] = useInsightsParams();
  const filter = toInsightsFilter(params.employmentType);
  const reference = useReference();
  const summary = useInsightsSummary(filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pay insights</h1>
          <p className="text-sm text-muted-foreground">Active employees only.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="insights-type">Employment type</Label>
          <NativeSelect
            id="insights-type"
            value={params.employmentType ?? ''}
            onChange={(event) =>
              void setParams({
                employmentType:
                  EMPLOYMENT_TYPES.find((type) => type === event.target.value) ?? null,
              })
            }
          >
            <NativeSelectOption value="">All types</NativeSelectOption>
            {EMPLOYMENT_TYPES.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {EMPLOYMENT_TYPE_LABELS[type]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      {summary.data && <FxDisclaimer fx={summary.data.meta.fx} />}

      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {summary.isError ? (
          <div className="sm:col-span-2 lg:col-span-5">
            <ErrorState
              message="Totals could not be loaded."
              onRetry={() => void summary.refetch()}
            />
          </div>
        ) : (
          <>
            <StatTile
              label="Active employees"
              value={summary.data && number.format(summary.data.data.activeHeadcount)}
            />
            <StatTile
              label="Countries"
              value={summary.data && number.format(summary.data.data.countryCount)}
            />
            <StatTile
              label="Total payroll (USD)"
              value={summary.data && formatUsdApprox(summary.data.data.totalPayrollUsd)}
            />
            <StatTile
              label="Average salary (USD)"
              value={summary.data && formatUsdApprox(summary.data.data.averageSalaryUsd)}
            />
            <StatTile
              label="Median salary (USD)"
              value={summary.data && formatUsdApprox(summary.data.data.medianSalaryUsd)}
            />
          </>
        )}
      </section>

      {reference.isError ? (
        <ErrorState
          message="Reference data could not be loaded."
          onRetry={() => void reference.refetch()}
        />
      ) : !reference.data ? (
        <LoadingRows label="Loading insights" />
      ) : (
        <>
          <ByCountry filter={filter} reference={reference.data} />
          <CountryDrillDown
            code={params.country}
            onChange={(country) => void setParams({ country: country || null })}
            filter={filter}
            reference={reference.data}
          />
          <RoleComparison
            jobTitleId={params.jobTitleId}
            onChange={(jobTitleId) => void setParams({ jobTitleId })}
            filter={filter}
            reference={reference.data}
          />
          <ByDepartment filter={filter} />
        </>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? '…'}</p>
    </div>
  );
}

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        {actions}
      </CardHeader>
      <CardContent className="space-y-6">{children}</CardContent>
    </Card>
  );
}

interface SectionProps {
  filter: InsightsQuery;
  reference: ReferenceData;
}

function ByCountry({ filter, reference }: SectionProps) {
  const byCountry = useInsightsByCountry(filter);
  const local = (money: MoneyDto) => formatSalary(money, minorUnitOf(reference, money.currency));
  if (byCountry.isError) {
    return (
      <ErrorState
        message="Country figures could not be loaded."
        onRetry={() => void byCountry.refetch()}
      />
    );
  }
  if (!byCountry.data) {
    return <LoadingRows label="Loading countries" />;
  }
  const rows: CountryInsight[] = byCountry.data.data;
  return (
    <Section title="By country">
      <AverageMedianChart
        title="Average and median salary by country (≈ USD)"
        data={rows.map((row) => ({
          label: row.country.name,
          average: centsToDollars(row.averageUsd.amountMinor),
          median: centsToDollars(row.medianUsd.amountMinor),
        }))}
      />
      <div className="overflow-x-auto">
        <Table aria-label="Pay by country">
          <TableHeader>
            <TableRow>
              <TableHead>Country</TableHead>
              <TableHead className="text-right">Headcount</TableHead>
              <TableHead className="text-right">Min</TableHead>
              <TableHead className="text-right">Max</TableHead>
              <TableHead className="text-right">Average</TableHead>
              <TableHead className="text-right">Median</TableHead>
              <TableHead className="text-right">Avg ≈ USD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.country.code}>
                <TableCell>{row.country.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {number.format(row.headcount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{local(row.min)}</TableCell>
                <TableCell className="text-right tabular-nums">{local(row.max)}</TableCell>
                <TableCell className="text-right tabular-nums">{local(row.average)}</TableCell>
                <TableCell className="text-right tabular-nums">{local(row.median)}</TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {formatUsdApprox(row.averageUsd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Section>
  );
}

function StatsCells({
  stats,
  format,
}: {
  stats: SalaryStats;
  format: (money: MoneyDto) => string;
}) {
  return (
    <>
      <TableCell className="text-right tabular-nums">{number.format(stats.headcount)}</TableCell>
      <TableCell className="text-right tabular-nums">{format(stats.min)}</TableCell>
      <TableCell className="text-right tabular-nums">{format(stats.max)}</TableCell>
      <TableCell className="text-right tabular-nums">{format(stats.average)}</TableCell>
      <TableCell className="text-right tabular-nums">{format(stats.median)}</TableCell>
    </>
  );
}

function CountryDrillDown({
  code,
  onChange,
  filter,
  reference,
}: SectionProps & { code: string; onChange: (code: string) => void }) {
  const detail = useCountryInsight(code, filter);
  const country = reference.countries.find((candidate) => candidate.code === code);
  const local = (money: MoneyDto) => formatSalary(money, minorUnitOf(reference, money.currency));

  return (
    <Section
      title="Country drill-down"
      actions={
        <div className="space-y-1.5">
          <Label htmlFor="insights-country">Country to explore</Label>
          <NativeSelect
            id="insights-country"
            value={code}
            onChange={(event) => onChange(event.target.value)}
          >
            <NativeSelectOption value="">Choose a country</NativeSelectOption>
            {reference.countries.map((option) => (
              <NativeSelectOption key={option.code} value={option.code}>
                {option.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      }
    >
      {!code || !country ? (
        <EmptyState>
          Choose a country to see pay by job title and the salary distribution.
        </EmptyState>
      ) : detail.isError ? (
        <ErrorState
          message="Country details could not be loaded."
          onRetry={() => void detail.refetch()}
        />
      ) : !detail.data ? (
        <LoadingRows rows={4} label="Loading country" />
      ) : (
        <>
          <DistributionChart
            title={`Salary distribution in ${country.name} (${country.currency.code}, 10 equal-width bands)`}
            data={detail.data.data.distribution.map((bucket) => ({
              range: `${local({ amountMinor: bucket.fromMinor, currency: country.currency.code })} – ${local({ amountMinor: bucket.toMinor, currency: country.currency.code })}`,
              count: bucket.count,
            }))}
          />
          <div className="overflow-x-auto">
            <Table aria-label={`Pay by job title in ${country.name}`}>
              <TableHeader>
                <TableRow>
                  <TableHead>Job title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Headcount</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead className="text-right">Median</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.data.data.jobTitles.map((row) => (
                  <TableRow key={row.jobTitle.id}>
                    <TableCell>{row.jobTitle.name}</TableCell>
                    <TableCell>{row.department.name}</TableCell>
                    <StatsCells stats={row} format={local} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Section>
  );
}

function RoleComparison({
  jobTitleId,
  onChange,
  filter,
  reference,
}: SectionProps & { jobTitleId: number | null; onChange: (id: number | null) => void }) {
  const comparison = useRoleComparison(jobTitleId, filter);
  const title = reference.jobTitles.find((candidate) => candidate.id === jobTitleId);
  const local = (money: MoneyDto) => formatSalary(money, minorUnitOf(reference, money.currency));

  return (
    <Section
      title="Compare a role across countries"
      actions={
        <div className="space-y-1.5">
          <Label htmlFor="insights-role">Role to compare</Label>
          <NativeSelect
            id="insights-role"
            value={jobTitleId === null ? '' : String(jobTitleId)}
            onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
          >
            <NativeSelectOption value="">Choose a job title</NativeSelectOption>
            {reference.jobTitles.map((option) => (
              <NativeSelectOption key={option.id} value={String(option.id)}>
                {option.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      }
    >
      {!title ? (
        <EmptyState>Choose a job title to compare what it pays in each country.</EmptyState>
      ) : comparison.isError ? (
        <ErrorState
          message="The comparison could not be loaded."
          onRetry={() => void comparison.refetch()}
        />
      ) : !comparison.data ? (
        <LoadingRows rows={4} label="Loading comparison" />
      ) : comparison.data.data.length === 0 ? (
        <EmptyState>No active employees hold this title.</EmptyState>
      ) : (
        <>
          <AverageMedianChart
            title={`${title.name}: average and median by country (≈ USD)`}
            data={comparison.data.data.map((row) => ({
              label: row.country.name,
              average: centsToDollars(row.averageUsd.amountMinor),
              median: centsToDollars(row.medianUsd.amountMinor),
            }))}
          />
          <div className="overflow-x-auto">
            <Table aria-label={`${title.name} across countries`}>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead className="text-right">Headcount</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead className="text-right">Median</TableHead>
                  <TableHead className="text-right">Avg ≈ USD</TableHead>
                  <TableHead className="text-right">Median ≈ USD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.data.data.map((row) => (
                  <TableRow key={row.country.code}>
                    <TableCell>{row.country.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number.format(row.headcount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{local(row.average)}</TableCell>
                    <TableCell className="text-right tabular-nums">{local(row.median)}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatUsdApprox(row.averageUsd)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatUsdApprox(row.medianUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Section>
  );
}

function ByDepartment({ filter }: { filter: InsightsQuery }) {
  const byDepartment = useInsightsByDepartment(filter);
  if (byDepartment.isError) {
    return (
      <ErrorState
        message="Department figures could not be loaded."
        onRetry={() => void byDepartment.refetch()}
      />
    );
  }
  if (!byDepartment.data) {
    return <LoadingRows rows={4} label="Loading departments" />;
  }
  const rows = byDepartment.data.data;
  return (
    <Section title="By department">
      <AverageMedianChart
        title="Average and median salary by department (≈ USD, all countries)"
        data={rows.map((row) => ({
          label: row.department.name,
          average: centsToDollars(row.averageUsd.amountMinor),
          median: centsToDollars(row.medianUsd.amountMinor),
        }))}
      />
      <div className="overflow-x-auto">
        <Table aria-label="Pay by department">
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Headcount</TableHead>
              <TableHead className="text-right">Min ≈ USD</TableHead>
              <TableHead className="text-right">Max ≈ USD</TableHead>
              <TableHead className="text-right">Average ≈ USD</TableHead>
              <TableHead className="text-right">Median ≈ USD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.department.id}>
                <TableCell>{row.department.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {number.format(row.headcount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUsdApprox(row.minUsd)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUsdApprox(row.maxUsd)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUsdApprox(row.averageUsd)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUsdApprox(row.medianUsd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Section>
  );
}
