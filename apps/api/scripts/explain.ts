import { employeeListQuerySchema } from '@acme/shared';
import { type CompiledQuery, Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from '../src/db/schema';
import { registerTypeParsers } from '../src/db/type-parsers';
import { createEmployeeRepository } from '../src/modules/employees/repository';
import { createInsightsRepository } from '../src/modules/insights/repository';

// Prints EXPLAIN (ANALYZE, BUFFERS) for the exact SQL the repositories send, for docs/PERFORMANCE.md.
// Usage: pnpm --filter api explain   (against the seeded local database)

registerTypeParsers();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const captured: CompiledQuery[] = [];
const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
  log: (event) => {
    if (event.level === 'query') {
      captured.push(event.query);
    }
  },
});

async function explain(title: string, run: () => Promise<unknown>, pick = 0): Promise<void> {
  captured.length = 0;
  await run();
  const query = captured[pick];
  if (!query) {
    throw new Error(`No query captured for ${title}`);
  }
  const plan = await pool.query(`EXPLAIN (ANALYZE, BUFFERS) ${query.sql}`, [...query.parameters]);
  console.log(`\n### ${title}\n\n\`\`\`text`);
  for (const row of plan.rows as { 'QUERY PLAN': string }[]) {
    console.log(row['QUERY PLAN']);
  }
  console.log('```');
}

const employees = createEmployeeRepository(db);
const insights = createInsightsRepository(db);

try {
  // list() issues the page query first and the count second.
  await explain('Employee list, default sort (full name)', () =>
    employees.list(employeeListQuerySchema.parse({})),
  );
  await explain('Employee list, sorted by USD salary (desc)', () =>
    employees.list(employeeListQuerySchema.parse({ sort: 'salaryUsd', order: 'desc' })),
  );
  await explain(
    'Employee list total count (default filters)',
    () => employees.list(employeeListQuerySchema.parse({})),
    1,
  );
  await explain('Insights by country', () => insights.byCountry({}));
  await explain('Insights country drill-down (IN)', () => insights.countryDetail('IN', {}));
} finally {
  await db.destroy();
}
