import type { FxMeta, ReferenceData } from '@acme/shared';
import type {
  CountryInfo,
  JobTitleInfo,
  ReferenceRepository,
} from '../../modules/reference/repository';

export const FAKE_FX_META: FxMeta = {
  asOf: '2026-10-01',
  source: 'Illustrative static reference rates (approximate)',
};

const COUNTRIES: CountryInfo[] = [
  ['IN', 'India', 'INR', 'Indian Rupee', 2, '0.0115'],
  ['US', 'United States', 'USD', 'US Dollar', 2, '1'],
  ['GB', 'United Kingdom', 'GBP', 'Pound Sterling', 2, '1.3'],
  ['DE', 'Germany', 'EUR', 'Euro', 2, '1.1'],
  ['CA', 'Canada', 'CAD', 'Canadian Dollar', 2, '0.73'],
  ['AU', 'Australia', 'AUD', 'Australian Dollar', 2, '0.66'],
  ['SG', 'Singapore', 'SGD', 'Singapore Dollar', 2, '0.76'],
  ['JP', 'Japan', 'JPY', 'Japanese Yen', 0, '0.0067'],
].map(([code, name, currencyCode, currencyName, minorUnit, usdPerUnit]) => ({
  code: String(code),
  name: String(name),
  currency: {
    code: String(currencyCode),
    name: String(currencyName),
    minorUnit: Number(minorUnit),
  },
  usdPerUnit: String(usdPerUnit),
}));

export const DEPARTMENTS = {
  engineering: { id: 1, name: 'Engineering' },
  people: { id: 2, name: 'People' },
};

export const JOB_TITLES: Record<'engineer' | 'manager' | 'recruiter', JobTitleInfo> = {
  engineer: { id: 1, name: 'Software Engineer', department: DEPARTMENTS.engineering },
  manager: { id: 2, name: 'Engineering Manager', department: DEPARTMENTS.engineering },
  recruiter: { id: 3, name: 'Recruiter', department: DEPARTMENTS.people },
};

/** Static, in-memory reference data mirroring the real migration for the codes tests use. */
export function fakeReferenceRepository(): ReferenceRepository {
  const titles = Object.values(JOB_TITLES);
  const data: ReferenceData = {
    countries: COUNTRIES.map(({ code, name, currency }) => ({ code, name, currency })),
    departments: Object.values(DEPARTMENTS),
    jobTitles: titles.map((title) => ({
      id: title.id,
      name: title.name,
      departmentId: title.department.id,
    })),
    fx: {
      ...FAKE_FX_META,
      rates: Object.fromEntries(
        COUNTRIES.map((country) => [country.currency.code, country.usdPerUnit]),
      ),
    },
  };
  return {
    getReferenceData: async () => data,
    findCountry: async (code) => COUNTRIES.find((country) => country.code === code),
    findJobTitle: async (id) => titles.find((title) => title.id === id),
    getFxMeta: async () => FAKE_FX_META,
  };
}
