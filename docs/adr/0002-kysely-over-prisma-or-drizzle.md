# ADR 0002: Kysely over Prisma or Drizzle

- Status: Accepted
- Date: 2026-10-13

## Context

The application's hardest queries are analytical: medians with `percentile_cont`, `width_bucket`
distributions, USD conversion over NUMERIC rates, all as single statements. It also needs explicit
transactions (employee + salary history, all-or-nothing imports) and full control over types such as
BIGINT money and DATE columns.

## Decision

Use Kysely with `pg`. The `Database` interface is written by hand (`apps/api/src/db/schema.ts`),
migrations are Kysely migrations containing the SQL from the SPEC, and complex aggregates use
Kysely's `sql` template with bound parameters.

## Consequences

- Queries read as SQL, so the insight statements in the repository match what `EXPLAIN` shows.
- Type safety for ordinary queries without a code-generation step or query engine binary.
- The schema types must be kept in sync with migrations by hand; integration tests against a real
  Postgres catch drift.
- `pg` type parsers are configured explicitly: BIGINT → safe number (throws otherwise), DATE → string.

## Alternatives considered

- **Prisma:** strong DX for CRUD, but aggregates like medians and buckets fall back to raw SQL, and
  it adds a generated client and engine.
- **Drizzle:** close to Kysely; Kysely's builder and transaction API were a slightly better fit for
  composing filters and passing transaction-bound repositories.
- **Raw `pg`:** maximum control but no typed query building for the CRUD paths.
