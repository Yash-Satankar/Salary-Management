import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema';
import { registerTypeParsers } from './type-parsers';

export type Db = Kysely<Database>;

export interface DatabaseOptions {
  connectionString: string;
  maxConnections?: number;
}

/** `db.destroy()` also ends the underlying pool, which graceful shutdown relies on. */
export function createDatabase({ connectionString, maxConnections = 10 }: DatabaseOptions): Db {
  registerTypeParsers();
  const pool = new pg.Pool({ connectionString, max: maxConnections });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
