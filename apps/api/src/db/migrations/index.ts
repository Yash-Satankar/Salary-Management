import type { Migration } from 'kysely/migration';
import * as initialSchema from './0001_initial_schema';
import * as referenceData from './0002_reference_data';

// Registered statically (not read from disk) so the bundled production build carries them.
export const migrations: Record<string, Migration> = {
  '0001_initial_schema': initialSchema,
  '0002_reference_data': referenceData,
};
