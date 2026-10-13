import type { Currency, FxMeta, ReferenceData } from '@acme/shared';
import { sql } from 'kysely';
import type { Db } from '../../db/client';

export interface CountryInfo {
  code: string;
  name: string;
  currency: Currency;
  /** USD per major unit as an exact decimal string. */
  usdPerUnit: string;
}

export interface JobTitleInfo {
  id: number;
  name: string;
  department: { id: number; name: string };
}

export interface ReferenceRepository {
  getReferenceData(): Promise<ReferenceData>;
  findCountry(code: string): Promise<CountryInfo | undefined>;
  findJobTitle(id: number): Promise<JobTitleInfo | undefined>;
  getFxMeta(): Promise<FxMeta>;
}

// trim_scale drops NUMERIC(20,10) padding so rates read as entered, e.g. "1.1" not "1.1000000000".
const usdPerUnit = sql<string>`trim_scale(fx_rates.usd_per_unit)::text`;

export function createReferenceRepository(db: Db): ReferenceRepository {
  const countries = () =>
    db
      .selectFrom('countries')
      .innerJoin('currencies', 'currencies.code', 'countries.currency_code')
      .innerJoin('fx_rates', 'fx_rates.currency_code', 'countries.currency_code')
      .select([
        'countries.code',
        'countries.name',
        'currencies.code as currencyCode',
        'currencies.name as currencyName',
        'currencies.minor_unit as minorUnit',
        usdPerUnit.as('usdPerUnit'),
      ]);

  const toCountryInfo = (row: {
    code: string;
    name: string;
    currencyCode: string;
    currencyName: string;
    minorUnit: number;
    usdPerUnit: string;
  }): CountryInfo => ({
    code: row.code,
    name: row.name,
    currency: { code: row.currencyCode, name: row.currencyName, minorUnit: row.minorUnit },
    usdPerUnit: row.usdPerUnit,
  });

  const getFxMeta = async (): Promise<FxMeta> => {
    // Rates are loaded together, so one row carries the as-of date and source for the table.
    const row = await db
      .selectFrom('fx_rates')
      .select(['as_of as asOf', 'source'])
      .orderBy('as_of', 'desc')
      .executeTakeFirstOrThrow();
    return row;
  };

  return {
    async getReferenceData() {
      const [countryRows, departments, jobTitles, rates, fxMeta] = await Promise.all([
        countries().orderBy('countries.name').execute(),
        db.selectFrom('departments').select(['id', 'name']).orderBy('name').execute(),
        db
          .selectFrom('job_titles')
          .select(['id', 'name', 'department_id as departmentId'])
          .orderBy('name')
          .execute(),
        db
          .selectFrom('fx_rates')
          .select(['currency_code as currency', usdPerUnit.as('rate')])
          .orderBy('currency_code')
          .execute(),
        getFxMeta(),
      ]);
      return {
        countries: countryRows.map((row) => {
          const { code, name, currency } = toCountryInfo(row);
          return { code, name, currency };
        }),
        departments,
        jobTitles,
        fx: { ...fxMeta, rates: Object.fromEntries(rates.map((row) => [row.currency, row.rate])) },
      };
    },

    async findCountry(code) {
      const row = await countries().where('countries.code', '=', code).executeTakeFirst();
      return row && toCountryInfo(row);
    },

    async findJobTitle(id) {
      const row = await db
        .selectFrom('job_titles')
        .innerJoin('departments', 'departments.id', 'job_titles.department_id')
        .select([
          'job_titles.id',
          'job_titles.name',
          'departments.id as departmentId',
          'departments.name as departmentName',
        ])
        .where('job_titles.id', '=', id)
        .executeTakeFirst();
      return (
        row && {
          id: row.id,
          name: row.name,
          department: { id: row.departmentId, name: row.departmentName },
        }
      );
    },

    getFxMeta,
  };
}
