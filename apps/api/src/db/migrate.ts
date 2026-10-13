import { z } from 'zod';
import { createDatabase } from './client';
import { migrateToLatest } from './migrator';

const { DATABASE_URL } = z.object({ DATABASE_URL: z.string().min(1) }).parse(process.env);

const db = createDatabase({ connectionString: DATABASE_URL, maxConnections: 1 });
try {
  const results = await migrateToLatest(db);
  const applied = results.map((result) => result.migrationName);
  process.stdout.write(
    applied.length > 0
      ? `Applied migrations: ${applied.join(', ')}\n`
      : 'Database schema is already up to date\n',
  );
} finally {
  await db.destroy();
}
