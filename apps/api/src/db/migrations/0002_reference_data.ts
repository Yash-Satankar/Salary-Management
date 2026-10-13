import type { Kysely } from 'kysely';
import type { Database } from '../schema';

// Reference data ships as a migration (not in the seed) so every environment, including
// production, has it. Values are inlined on purpose: a migration is a frozen snapshot.

const CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee', minor_unit: 2 },
  { code: 'USD', name: 'US Dollar', minor_unit: 2 },
  { code: 'GBP', name: 'Pound Sterling', minor_unit: 2 },
  { code: 'EUR', name: 'Euro', minor_unit: 2 },
  { code: 'CAD', name: 'Canadian Dollar', minor_unit: 2 },
  { code: 'AUD', name: 'Australian Dollar', minor_unit: 2 },
  { code: 'SGD', name: 'Singapore Dollar', minor_unit: 2 },
  { code: 'JPY', name: 'Japanese Yen', minor_unit: 0 },
];

const FX_AS_OF = '2026-10-01';
const FX_SOURCE = 'Illustrative static reference rates (approximate)';
const USD_PER_UNIT: Record<string, string> = {
  USD: '1',
  EUR: '1.10',
  GBP: '1.30',
  INR: '0.0115',
  CAD: '0.73',
  AUD: '0.66',
  SGD: '0.76',
  JPY: '0.0067',
};

const COUNTRIES = [
  { code: 'IN', name: 'India', currency_code: 'INR' },
  { code: 'US', name: 'United States', currency_code: 'USD' },
  { code: 'GB', name: 'United Kingdom', currency_code: 'GBP' },
  { code: 'DE', name: 'Germany', currency_code: 'EUR' },
  { code: 'CA', name: 'Canada', currency_code: 'CAD' },
  { code: 'AU', name: 'Australia', currency_code: 'AUD' },
  { code: 'SG', name: 'Singapore', currency_code: 'SGD' },
  { code: 'JP', name: 'Japan', currency_code: 'JPY' },
];

const JOB_TITLES_BY_DEPARTMENT: Record<string, string[]> = {
  Engineering: [
    'Software Engineer',
    'Senior Software Engineer',
    'Staff Engineer',
    'Engineering Manager',
    'QA Engineer',
    'DevOps Engineer',
  ],
  Product: ['Product Manager', 'Senior Product Manager', 'Product Designer'],
  Data: ['Data Analyst', 'Data Scientist'],
  Sales: ['Sales Development Rep', 'Account Executive', 'Sales Manager'],
  Marketing: ['Marketing Specialist', 'Marketing Manager'],
  'Customer Success': ['Support Specialist', 'Customer Success Manager'],
  Finance: ['Accountant', 'Financial Analyst', 'Finance Manager'],
  People: ['HR Generalist', 'Recruiter', 'HR Manager'],
  Operations: ['Operations Analyst', 'Office Manager'],
};

export async function up(db: Kysely<Database>): Promise<void> {
  await db.insertInto('currencies').values(CURRENCIES).execute();
  await db
    .insertInto('fx_rates')
    .values(
      Object.entries(USD_PER_UNIT).map(([currency_code, usd_per_unit]) => ({
        currency_code,
        usd_per_unit,
        as_of: FX_AS_OF,
        source: FX_SOURCE,
      })),
    )
    .execute();
  await db.insertInto('countries').values(COUNTRIES).execute();

  for (const [department, titles] of Object.entries(JOB_TITLES_BY_DEPARTMENT)) {
    const { id } = await db
      .insertInto('departments')
      .values({ name: department })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db
      .insertInto('job_titles')
      .values(titles.map((name) => ({ name, department_id: id })))
      .execute();
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.deleteFrom('job_titles').execute();
  await db.deleteFrom('departments').execute();
  await db.deleteFrom('countries').execute();
  await db.deleteFrom('fx_rates').execute();
  await db.deleteFrom('currencies').execute();
}
