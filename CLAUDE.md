# CLAUDE.md

Guidance for AI coding agents (and humans) working in this repository.

## Project

ACME Salary Management replaces spreadsheet-based salary records for ~10,000 employees in 8 countries.
An HR manager maintains employees and salary history, imports/exports CSV and reads pay insights
(local currency first; USD figures are approximate, from a static dated FX table).

- Product scope: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- **Technical source of truth: [docs/SPEC.md](docs/SPEC.md).** Never edit REQUIREMENTS or SPEC; record any
  deviation in [docs/TRADEOFFS.md](docs/TRADEOFFS.md).
- Build progress / resume point: [docs/PROGRESS.md](docs/PROGRESS.md)

## Commands (run from the repo root)

| Command                                        | What it does                                           |
| ---------------------------------------------- | ------------------------------------------------------ |
| `docker compose up -d`                         | Local Postgres 16 on `localhost:5434`                  |
| `pnpm install`                                 | Install all workspaces                                 |
| `pnpm db:migrate` / `pnpm db:seed`             | Apply migrations / seed 10,000 deterministic employees |
| `pnpm dev`                                     | API on :4000 and web on :3000                          |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Quality gates                                          |
| `pnpm test`                                    | All unit suites (no Docker needed)                     |
| `pnpm test:integration`                        | API integration tests (Testcontainers, needs Docker)   |
| `pnpm test:all`                                | Unit + integration                                     |
| `pnpm --filter api hash-password '<pw>'`       | bcrypt hash for `HR_PASSWORD_HASH`                     |

## Architecture map

```
packages/shared   Zod schemas, DTO types, enums, money utilities (consumed as TS source)
apps/api          Express 5 + Kysely + pg
  src/app.ts            createApp(deps): wiring only, used by tests
  src/server.ts         env, deps, listen, graceful shutdown
  src/db/               client, hand-written schema types, migrations, seed
  src/middleware/       auth, error handler, validation, origin check
  src/modules/<name>/   routes -> controller (HTTP) -> service (rules, transactions) -> repository (SQL)
apps/web          Next.js App Router; browser talks only to Next, which rewrites /api/* to the API
```

## Conventions

- **TDD.** For domain/service code, CSV modules, money utilities, HTTP handlers and repositories:
  write a failing test (commit `test(scope): ...`), make it pass (`feat(scope): ...`), then refactor.
- **Conventional Commits** with scopes `shared, api, db, web, csv, insights, auth, docs, ci`. Small,
  single-purpose commits; every non-red commit passes lint and typecheck.
- TypeScript strict, no `any`. Money is integer minor units (never floats); currency exponent comes
  from the `currencies` table (JPY = 0).
- Dependencies are injected via factory functions; "today" comes from an injected `clock`.
- Unit tests use hand-written in-memory fakes, not mocking libraries. Integration tests use
  Testcontainers and files named `*.int.test.ts`.
- Comments explain _why_, not _what_. Cross-platform npm scripts only (Windows dev machine).
