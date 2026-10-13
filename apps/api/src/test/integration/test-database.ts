import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { createDatabase, type Db } from '../../db/client';
import { resetEmployeeData } from '../../db/reset';

export interface TestDatabase {
  readonly db: Db;
  readonly url: string;
}

/** Connects to the shared test container and gives every test empty employee tables. */
export function useTestDatabase(): TestDatabase {
  let db: Db | undefined;
  const url = inject('databaseUrl');

  beforeAll(() => {
    db = createDatabase({ connectionString: url, maxConnections: 5 });
  });

  beforeEach(async () => {
    await resetEmployeeData(handle.db);
  });

  afterAll(async () => {
    await db?.destroy();
  });

  const handle: TestDatabase = {
    get db() {
      if (!db) {
        throw new Error('Test database is only available inside tests');
      }
      return db;
    },
    url,
  };
  return handle;
}
