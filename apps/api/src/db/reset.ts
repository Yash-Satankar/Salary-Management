import { sql } from 'kysely';
import type { Db } from './client';

/** Empties employee data and restarts generated ids and codes; reference data is untouched. */
export async function resetEmployeeData(db: Db): Promise<void> {
  await sql`TRUNCATE salary_changes, employees RESTART IDENTITY`.execute(db);
  await sql`ALTER SEQUENCE employee_code_seq RESTART WITH 1`.execute(db);
}
