import { z } from 'zod';
import { createDatabase } from '../client';
import { seedDatabase } from './seed';

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    NODE_ENV: z.string().default('development'),
    SEED_CONFIRM: z.string().optional(),
  })
  .parse(process.env);

if (env.NODE_ENV === 'production' && env.SEED_CONFIRM !== 'yes') {
  process.stderr.write(
    'Refusing to seed: NODE_ENV=production replaces all employee data. Set SEED_CONFIRM=yes to proceed.\n',
  );
  process.exit(1);
}

const db = createDatabase({ connectionString: env.DATABASE_URL, maxConnections: 1 });
const startedAt = performance.now();
try {
  const result = await seedDatabase(db);
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(2);
  process.stdout.write(
    `Seeded ${result.employees} employees and ${result.salaryChanges} salary history rows in ${seconds}s\n`,
  );
} finally {
  await db.destroy();
}
