import {
  base,
  de,
  en,
  en_AU,
  en_CA,
  en_GB,
  en_IN,
  en_US,
  Faker,
  type LocaleDefinition,
} from '@faker-js/faker';
import type { EmploymentType } from '@acme/shared';
import { addDays, daysBetween } from '../../lib/dates';
import { createRng, type Rng } from './random';
import { generateSalaryMinor, randomNoiseBasisPoints, roundingStepFor } from './salary-model';

export interface SeedReference {
  countries: { code: string; currencyCode: string; minorUnit: number; usdPerUnit: string }[];
  jobTitles: { id: number; name: string }[];
}

export interface SeedOptions {
  seed: number;
  employeeCount: number;
  /** Fixed "today" for the data set, so the same seed yields the same rows on any day. */
  referenceDate: string;
}

export interface SeedHistoryEntry {
  previousSalaryMinor: number | null;
  newSalaryMinor: number;
  effectiveDate: string;
  reason: string;
}

export interface SeedEmployee {
  fullName: string;
  email: string;
  jobTitleId: number;
  countryCode: string;
  currencyCode: string;
  salaryMinor: number;
  employmentType: EmploymentType;
  hireDate: string;
  terminatedOn: string | null;
  /** Oldest first: the initial salary at hire, then each change. */
  history: SeedHistoryEntry[];
}

const COUNTRY_MIX_PERCENT: Record<string, number> = {
  IN: 35,
  US: 20,
  GB: 10,
  JP: 8,
  DE: 8,
  CA: 7,
  AU: 6,
  SG: 6,
};

const EMPLOYMENT_TYPE_WEIGHTS = [
  ['full_time', 85],
  ['part_time', 8],
  ['contract', 7],
] as const;

const TERMINATION_RATE = 0.03;
const MAX_HISTORY_CHANGES = 3;
const HIRE_WINDOW_DAYS = 12 * 365;
const CHANGE_REASONS = ['Annual review', 'Promotion', 'Market adjustment'];

// Faker's ja locale yields kana/kanji names, which cannot form the ASCII
// firstname.lastname emails the SPEC asks for, so Japan uses common romanised names.
const JAPANESE_GIVEN_NAMES = [
  'Haruto',
  'Yui',
  'Sota',
  'Aoi',
  'Ren',
  'Hina',
  'Yuto',
  'Sakura',
  'Kaito',
  'Mio',
  'Riku',
  'Akari',
  'Hiroshi',
  'Yuki',
  'Takumi',
  'Emi',
  'Kenta',
  'Naoko',
  'Daiki',
  'Ayaka',
];
const JAPANESE_FAMILY_NAMES = [
  'Sato',
  'Suzuki',
  'Takahashi',
  'Tanaka',
  'Watanabe',
  'Ito',
  'Yamamoto',
  'Nakamura',
  'Kobayashi',
  'Kato',
  'Yoshida',
  'Yamada',
  'Sasaki',
  'Yamaguchi',
  'Matsumoto',
  'Inoue',
  'Kimura',
  'Hayashi',
  'Shimizu',
  'Mori',
];

type NameSource = (rng: Rng) => { first: string; last: string };

function fakerNames(faker: Faker): NameSource {
  return () => ({ first: faker.person.firstName(), last: faker.person.lastName() });
}

function createNameSources(seed: number): Record<string, NameSource> {
  const fakerFor = (locale: LocaleDefinition) => {
    const faker = new Faker({ locale: [locale, en, base] });
    faker.seed(seed);
    return fakerNames(faker);
  };
  return {
    IN: fakerFor(en_IN),
    US: fakerFor(en_US),
    GB: fakerFor(en_GB),
    DE: fakerFor(de),
    CA: fakerFor(en_CA),
    AU: fakerFor(en_AU),
    SG: fakerFor(en),
    JP: (rng) => ({ first: rng.pick(JAPANESE_GIVEN_NAMES), last: rng.pick(JAPANESE_FAMILY_NAMES) }),
  };
}

export function generateSeedData(reference: SeedReference, options: SeedOptions): SeedEmployee[] {
  const rng = createRng(options.seed);
  const nameSources = createNameSources(options.seed);
  const titleWeights = reference.jobTitles.map(
    (title) => [title, titleWeight(title.name)] as const,
  );
  const countries = new Map(reference.countries.map((country) => [country.code, country]));

  return shuffledCountryCodes(options.employeeCount, rng).map((countryCode, index) => {
    const country = countries.get(countryCode);
    const nameSource = nameSources[countryCode];
    if (!country || !nameSource) {
      throw new Error(`Missing reference data for country ${countryCode}`);
    }
    const title = rng.weighted(titleWeights);
    const { first, last } = nameSource(rng);
    const hireDate = addDays(options.referenceDate, -rng.int(0, HIRE_WINDOW_DAYS));
    const terminatedOn =
      rng.next() < TERMINATION_RATE
        ? addDays(hireDate, rng.int(0, daysBetween(hireDate, options.referenceDate)))
        : null;
    const salaryMinor = generateSalaryMinor(
      title.name,
      countryCode,
      country,
      randomNoiseBasisPoints(rng),
    );

    return {
      fullName: `${first} ${last}`,
      email: `${slug(first)}.${slug(last)}.${index + 1}@acme.test`,
      jobTitleId: title.id,
      countryCode,
      currencyCode: country.currencyCode,
      salaryMinor,
      employmentType: rng.weighted(EMPLOYMENT_TYPE_WEIGHTS),
      hireDate,
      terminatedOn,
      history: buildHistory(rng, {
        salaryMinor,
        hireDate,
        lastDate: terminatedOn ?? options.referenceDate,
        stepMinor: roundingStepFor(country.minorUnit) * 10 ** country.minorUnit,
      }),
    };
  });
}

/** Individual-contributor titles are more common than senior and management ones. */
function titleWeight(title: string): number {
  return /Manager|Staff|Senior/.test(title) ? 1 : 3;
}

/** Exact per-country counts (largest remainder), shuffled so codes interleave countries. */
function shuffledCountryCodes(total: number, rng: Rng): string[] {
  const entries = Object.entries(COUNTRY_MIX_PERCENT);
  const quotas = entries.map(([code, percent]) => {
    const exact = (total * percent) / 100;
    return { code, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let missing = total - quotas.reduce((sum, quota) => sum + quota.count, 0);
  for (const quota of [...quotas].sort((a, b) => b.remainder - a.remainder)) {
    if (missing === 0) break;
    quota.count += 1;
    missing -= 1;
  }
  const codes = quotas.flatMap((quota) => Array<string>(quota.count).fill(quota.code));
  for (let index = codes.length - 1; index > 0; index -= 1) {
    const swapWith = rng.int(0, index);
    [codes[index], codes[swapWith]] = [codes[swapWith] as string, codes[index] as string];
  }
  return codes;
}

interface HistoryInput {
  salaryMinor: number;
  hireDate: string;
  lastDate: string;
  stepMinor: number;
}

/** Works backwards from today's salary so the newest history row always equals it. */
function buildHistory(rng: Rng, input: HistoryInput): SeedHistoryEntry[] {
  const span = daysBetween(input.hireDate, input.lastDate);
  const changeCount = Math.min(rng.int(0, MAX_HISTORY_CHANGES), span);
  const offsets = distinctSortedOffsets(rng, changeCount, span);

  const salaries = [input.salaryMinor];
  for (let index = 0; index < changeCount; index += 1) {
    const later = salaries[0] as number;
    const raisePercent = rng.int(3, 15);
    const earlier =
      Math.round((later * 100) / (100 + raisePercent) / input.stepMinor) * input.stepMinor;
    salaries.unshift(
      earlier > 0 && earlier < later ? earlier : Math.max(later - input.stepMinor, input.stepMinor),
    );
  }

  return salaries.map((newSalaryMinor, index) => ({
    previousSalaryMinor: index === 0 ? null : (salaries[index - 1] as number),
    newSalaryMinor,
    effectiveDate:
      index === 0 ? input.hireDate : addDays(input.hireDate, offsets[index - 1] as number),
    reason: index === 0 ? 'Initial salary' : rng.pick(CHANGE_REASONS),
  }));
}

function distinctSortedOffsets(rng: Rng, count: number, span: number): number[] {
  const offsets = new Set<number>();
  while (offsets.size < count) {
    offsets.add(rng.int(1, span));
  }
  return [...offsets].sort((a, b) => a - b);
}

function slug(name: string): string {
  const ascii = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return ascii || 'employee';
}
