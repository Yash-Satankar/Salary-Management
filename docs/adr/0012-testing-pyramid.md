# ADR 0012: Testing pyramid with fakes for services and Testcontainers for SQL

- Status: Accepted
- Date: 2026-10-13

## Context

The rules that matter (currency pairing, salary bounds, history writing, import validation, insight
arithmetic) must be proven, and the build was developed test-first. Tests must stay fast enough to
run on every change, yet SQL behaviour (constraints, medians, transactions) can only be trusted
against a real PostgreSQL.

## Decision

- **Shared unit tests:** money parsing and formatting (incl. JPY) and Zod schemas.
- **API unit tests (no database):** services run against hand-written in-memory fakes, not a
  mocking library. The employee fake mirrors the unique email index and restores a snapshot when a
  transaction fails, so all-or-nothing behaviour is observable. HTTP behaviour is tested with
  supertest against `createApp(deps)` with fakes. Time comes from an injected `clock`.
- **API integration tests:** repositories, migrations, constraints, the seed, imports and every
  insight query run against PostgreSQL 16 in Testcontainers, migrated once per run, with tables
  truncated before each test. Insight numbers are asserted against a hand-computed fixture whose
  derivations are written in the test file.
- **Web unit tests:** Vitest, React Testing Library and jsdom, with `fetch` stubbed at the network
  boundary.
- Coverage threshold of 85% lines only where it matters: services, the CSV modules and the shared
  package.

## Consequences

- Unit suites run in seconds; the integration suite needs Docker (available on GitHub runners).
- Fakes must be kept faithful (for example, returning copies rather than shared objects); a few
  integration tests re-check the same behaviour against real SQL.
- No browser end-to-end tests in v1 (docs/FUTURE.md).

## Alternatives considered

- **Mocking libraries for repositories:** tests end up asserting calls instead of outcomes and break
  on refactors.
- **SQLite or pg-mem in tests:** no `percentile_cont`, `width_bucket` or identical constraint
  behaviour.
- **A shared, long-lived test database:** order-dependent tests and manual setup.
