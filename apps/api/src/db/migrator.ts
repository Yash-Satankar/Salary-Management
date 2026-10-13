import { type MigrationResult, Migrator } from 'kysely/migration';
import type { Db } from './client';
import { migrations } from './migrations';

export async function migrateToLatest(db: Db): Promise<MigrationResult[]> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });
  const { error, results = [] } = await migrator.migrateToLatest();
  if (error) {
    const failed = results.find((result) => result.status === 'Error');
    throw new Error(`Migration ${failed?.migrationName ?? '(unknown)'} failed`, { cause: error });
  }
  return results;
}
