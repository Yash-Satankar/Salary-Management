import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { createDatabase } from '../../db/client';
import { migrateToLatest } from '../../db/migrator';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/** One container per integration run; each test file truncates mutable tables between tests. */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();
  const db = createDatabase({ connectionString: databaseUrl, maxConnections: 1 });
  try {
    await migrateToLatest(db);
  } finally {
    await db.destroy();
  }
  project.provide('databaseUrl', databaseUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
