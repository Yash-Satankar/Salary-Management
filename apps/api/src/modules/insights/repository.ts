import type {
  CountryDetailInsight,
  CountryInsight,
  DepartmentInsight,
  InsightsQuery,
  InsightsSummary,
  MoneyDto,
  RoleCountryInsight,
  SalaryStats,
} from '@acme/shared';
import { type RawBuilder, sql } from 'kysely';
import type { Db } from '../../db/client';

export interface InsightsRepository {
  summary(filter: InsightsQuery): Promise<InsightsSummary>;
  byCountry(filter: InsightsQuery): Promise<CountryInsight[]>;
  countryDetail(code: string, filter: InsightsQuery): Promise<CountryDetailInsight | undefined>;
  byJobTitle(jobTitleId: number, filter: InsightsQuery): Promise<RoleCountryInsight[]>;
  byDepartment(filter: InsightsQuery): Promise<DepartmentInsight[]>;
}

const DISTRIBUTION_BUCKETS = 10;

/**
 * Active employees with their salary in unrounded US cents. Every endpoint aggregates from this
 * CTE in a single statement; rounding happens once, on the aggregate.
 */
function activeEmployees(filter: InsightsQuery, extraCondition: RawBuilder<unknown> = sql``) {
  const employmentType = filter.employmentType
    ? sql`AND e.employment_type = ${filter.employmentType}`
    : sql``;
  return sql`
    SELECT e.id, e.country_code, e.currency_code, e.job_title_id, e.salary_minor,
           e.salary_minor::numeric / power(10::numeric, cur.minor_unit) * fx.usd_per_unit * 100
             AS usd_cents
    FROM employees e
    JOIN currencies cur ON cur.code = e.currency_code
    JOIN fx_rates fx ON fx.currency_code = e.currency_code
    WHERE e.status = 'active' ${employmentType} ${extraCondition}
  `;
}

/** Averages and medians are rounded to whole minor units (half away from zero, on NUMERIC). */
const roundedAverage = (column: RawBuilder<unknown>) => sql`round(avg(${column}))::bigint`;
const roundedMedian = (column: RawBuilder<unknown>) =>
  sql`round((percentile_cont(0.5) WITHIN GROUP (ORDER BY ${column}))::numeric)::bigint`;

const SALARY = sql.ref('emp.salary_minor');
const USD = sql.ref('emp.usd_cents');

const money = (amountMinor: number | null, currency: string): MoneyDto => ({
  amountMinor: amountMinor ?? 0,
  currency,
});
const usd = (amountMinor: number | null) => money(amountMinor, 'USD');

interface LocalStatsRow {
  headcount: number;
  min: number | null;
  max: number | null;
  average: number | null;
  median: number | null;
}

const toStats = (row: LocalStatsRow, currency: string): SalaryStats => ({
  headcount: row.headcount,
  min: money(row.min, currency),
  max: money(row.max, currency),
  average: money(row.average, currency),
  median: money(row.median, currency),
});

export function createInsightsRepository(db: Db): InsightsRepository {
  return {
    async summary(filter) {
      const { rows } = await sql<{
        headcount: number;
        countries: number;
        total: number | null;
        average: number | null;
        median: number | null;
      }>`
        WITH emp AS (${activeEmployees(filter)})
        SELECT count(*) AS headcount,
               count(DISTINCT emp.country_code) AS countries,
               round(sum(${USD}))::bigint AS total,
               ${roundedAverage(USD)} AS average,
               ${roundedMedian(USD)} AS median
        FROM emp
      `.execute(db);
      const row = rows[0];
      return {
        activeHeadcount: row?.headcount ?? 0,
        countryCount: row?.countries ?? 0,
        totalPayrollUsd: usd(row?.total ?? 0),
        averageSalaryUsd: usd(row?.average ?? 0),
        medianSalaryUsd: usd(row?.median ?? 0),
      };
    },

    async byCountry(filter) {
      const { rows } = await sql<
        LocalStatsRow & {
          code: string;
          name: string;
          currency: string;
          averageUsd: number;
          medianUsd: number;
        }
      >`
        WITH emp AS (${activeEmployees(filter)})
        SELECT c.code, c.name, emp.currency_code AS currency,
               count(*) AS headcount,
               min(${SALARY}) AS min, max(${SALARY}) AS max,
               ${roundedAverage(SALARY)} AS average, ${roundedMedian(SALARY)} AS median,
               ${roundedAverage(USD)} AS "averageUsd", ${roundedMedian(USD)} AS "medianUsd"
        FROM emp
        JOIN countries c ON c.code = emp.country_code
        GROUP BY c.code, c.name, emp.currency_code
        ORDER BY headcount DESC, c.name
      `.execute(db);
      return rows.map((row) => ({
        country: { code: row.code, name: row.name },
        currency: row.currency,
        ...toStats(row, row.currency),
        averageUsd: usd(row.averageUsd),
        medianUsd: usd(row.medianUsd),
      }));
    },

    async countryDetail(code, filter) {
      // width_bucket puts a value equal to the upper bound in bucket count + 1; LEAST clamps the
      // maximum salary into the last bucket. Equal min and max make a single degenerate bucket.
      const { rows } = await sql<{
        code: string;
        name: string;
        currency: string;
        summary: LocalStatsRow;
        jobTitles: (LocalStatsRow & {
          jobTitleId: number;
          jobTitleName: string;
          departmentId: number;
          departmentName: string;
        })[];
        distribution: { fromMinor: number; toMinor: number; count: number }[];
      }>`
        WITH country AS (
          SELECT code, name, currency_code FROM countries WHERE code = ${code}
        ),
        emp AS (${activeEmployees(filter, sql`AND e.country_code = ${code}`)}),
        stats AS (
          SELECT count(*) AS headcount, min(${SALARY}) AS min, max(${SALARY}) AS max,
                 ${roundedAverage(SALARY)} AS average, ${roundedMedian(SALARY)} AS median
          FROM emp
        ),
        titles AS (
          SELECT jt.id AS "jobTitleId", jt.name AS "jobTitleName",
                 d.id AS "departmentId", d.name AS "departmentName",
                 count(*) AS headcount, min(${SALARY}) AS min, max(${SALARY}) AS max,
                 ${roundedAverage(SALARY)} AS average, ${roundedMedian(SALARY)} AS median
          FROM emp
          JOIN job_titles jt ON jt.id = emp.job_title_id
          JOIN departments d ON d.id = jt.department_id
          GROUP BY jt.id, jt.name, d.id, d.name
        ),
        bucketed AS (
          SELECT CASE WHEN s.max = s.min THEN 1
                      ELSE LEAST(width_bucket(${SALARY}::numeric, s.min::numeric, s.max::numeric,
                                              ${DISTRIBUTION_BUCKETS}), ${DISTRIBUTION_BUCKETS})
                 END AS bucket
          FROM emp CROSS JOIN stats s
        ),
        buckets AS (
          SELECT b.i,
                 CASE WHEN s.max = s.min THEN s.min
                      ELSE s.min + round((b.i - 1) * (s.max - s.min)::numeric / ${DISTRIBUTION_BUCKETS})::bigint
                 END AS "fromMinor",
                 CASE WHEN s.max = s.min OR b.i = ${DISTRIBUTION_BUCKETS} THEN s.max
                      ELSE s.min + round(b.i * (s.max - s.min)::numeric / ${DISTRIBUTION_BUCKETS})::bigint
                 END AS "toMinor",
                 (SELECT count(*) FROM bucketed WHERE bucketed.bucket = b.i) AS count
          FROM stats s
          CROSS JOIN generate_series(1, CASE WHEN s.max = s.min THEN 1 ELSE ${DISTRIBUTION_BUCKETS} END) AS b(i)
          WHERE s.headcount > 0
        )
        SELECT country.code, country.name, country.currency_code AS currency,
               (SELECT row_to_json(stats) FROM stats) AS summary,
               COALESCE((SELECT json_agg(titles ORDER BY titles.headcount DESC, titles."jobTitleName")
                         FROM titles), '[]'::json) AS "jobTitles",
               COALESCE((SELECT json_agg(json_build_object('fromMinor', "fromMinor",
                                                           'toMinor', "toMinor",
                                                           'count', count) ORDER BY i)
                         FROM buckets), '[]'::json) AS distribution
        FROM country
      `.execute(db);
      const row = rows[0];
      if (!row) {
        return undefined;
      }
      return {
        country: { code: row.code, name: row.name },
        currency: row.currency,
        summary: toStats(row.summary, row.currency),
        jobTitles: row.jobTitles.map((title) => ({
          jobTitle: { id: title.jobTitleId, name: title.jobTitleName },
          department: { id: title.departmentId, name: title.departmentName },
          ...toStats(title, row.currency),
        })),
        distribution: row.distribution,
      };
    },

    async byJobTitle(jobTitleId, filter) {
      const { rows } = await sql<{
        code: string;
        name: string;
        currency: string;
        headcount: number;
        average: number;
        median: number;
        averageUsd: number;
        medianUsd: number;
      }>`
        WITH emp AS (${activeEmployees(filter, sql`AND e.job_title_id = ${jobTitleId}`)})
        SELECT c.code, c.name, emp.currency_code AS currency, count(*) AS headcount,
               ${roundedAverage(SALARY)} AS average, ${roundedMedian(SALARY)} AS median,
               ${roundedAverage(USD)} AS "averageUsd", ${roundedMedian(USD)} AS "medianUsd"
        FROM emp
        JOIN countries c ON c.code = emp.country_code
        GROUP BY c.code, c.name, emp.currency_code
        ORDER BY avg(${USD}) DESC, c.name
      `.execute(db);
      return rows.map((row) => ({
        country: { code: row.code, name: row.name },
        headcount: row.headcount,
        average: money(row.average, row.currency),
        median: money(row.median, row.currency),
        averageUsd: usd(row.averageUsd),
        medianUsd: usd(row.medianUsd),
      }));
    },

    async byDepartment(filter) {
      const { rows } = await sql<{
        id: number;
        name: string;
        headcount: number;
        averageUsd: number;
        medianUsd: number;
        minUsd: number;
        maxUsd: number;
      }>`
        WITH emp AS (${activeEmployees(filter)})
        SELECT d.id, d.name, count(*) AS headcount,
               ${roundedAverage(USD)} AS "averageUsd", ${roundedMedian(USD)} AS "medianUsd",
               round(min(${USD}))::bigint AS "minUsd", round(max(${USD}))::bigint AS "maxUsd"
        FROM emp
        JOIN job_titles jt ON jt.id = emp.job_title_id
        JOIN departments d ON d.id = jt.department_id
        GROUP BY d.id, d.name
        ORDER BY headcount DESC, d.name
      `.execute(db);
      return rows.map((row) => ({
        department: { id: row.id, name: row.name },
        headcount: row.headcount,
        averageUsd: usd(row.averageUsd),
        medianUsd: usd(row.medianUsd),
        minUsd: usd(row.minUsd),
        maxUsd: usd(row.maxUsd),
      }));
    },
  };
}
