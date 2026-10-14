# ACME Salary Management

A web application that replaces ACME's salary spreadsheets. An HR manager can maintain salary
records for ~10,000 employees in 8 countries, keep a full salary history, move data in and out of
Excel as CSV, and answer pay questions ("What do we pay engineers in India vs the US?") in a couple
of clicks: in local currency first, with approximate USD comparisons from a static, dated FX table.

- **Employees:** search, filter, sort and paginate 10k+ records; create, edit and terminate, with
  validation that makes a wrong country/currency pair impossible.
- **Salary history:** every change (previous → new, effective date, reason) on the employee page.
- **Pay insights:** per-country statistics (min, max, average, median), job titles within a country,
  salary distributions, the same role across countries, departments and org-wide totals.
- **CSV import & export:** dry-run preview with row-level errors, all-or-nothing apply, and a clean
  export → Excel → import round trip.
- **Single HR login:** the app is unusable without signing in.

Built as a TypeScript monorepo: Express 5 + PostgreSQL (Kysely) API, Next.js 16 web app, and a shared
Zod contract package. Developed test-first; see the commit history.

## Screenshots

_TODO: add screenshots of the employee list, employee detail with salary history, insights and the
import preview._

## Live demo

|                   |                                                       |
| ----------------- | ----------------------------------------------------- |
| Web app           | TODO: `https://<your-app>.vercel.app`                 |
| API health        | TODO: `https://<your-api>.onrender.com/api/v1/health` |
| Walkthrough video | TODO                                                  |
| Demo credentials  | TODO: email / password for reviewers                  |

The demo runs on free tiers; the first request after a period of inactivity can take 30–60 seconds
while the API wakes up ([details](docs/DEPLOYMENT.md#notes-for-reviewers)).

## Quick start

Prerequisites: **Node.js 22.12+** (24 recommended, see `.nvmrc`), **pnpm 10** (`corepack enable`), and
**Docker Desktop** running.

```bash
docker compose up -d   # PostgreSQL 16 on localhost:5434
pnpm install
pnpm db:migrate        # schema + reference data (countries, currencies, FX, titles)
pnpm db:seed           # 10,000 deterministic employees with salary history
pnpm dev               # API on http://localhost:4000, web on http://localhost:3000
```

Open <http://localhost:3000> and sign in with the local demo account:

- Email: `hr@acme.test`
- Password: `acme-demo-2026`

No `.env` file is needed locally: the API loads `apps/api/.env.example` (local-only values) and then
`apps/api/.env` if you create one to override anything. The web app defaults `API_ORIGIN` to
`http://localhost:4000`. To use your own password: `pnpm --filter api hash-password '<password>'` and
put the hash in `apps/api/.env` as `HR_PASSWORD_HASH`.

If port 5434 is taken, set `ACME_DB_PORT` before `docker compose up` and point `DATABASE_URL` at it.

## Commands

Run from the repository root.

| Command                                  | What it does                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`                               | API (watch mode) and web app together                                     |
| `pnpm build`                             | Production builds of the API (tsup) and web (Next.js)                     |
| `pnpm lint`                              | ESLint (typescript-eslint strict, Next.js and React hooks rules)          |
| `pnpm typecheck`                         | `tsc --noEmit` in every package                                           |
| `pnpm format` / `pnpm format:check`      | Prettier                                                                  |
| `pnpm test`                              | All unit suites: shared, API (no database), web                           |
| `pnpm test:integration`                  | API integration tests against PostgreSQL in Testcontainers (needs Docker) |
| `pnpm test:all`                          | Unit + integration                                                        |
| `pnpm db:migrate` / `pnpm db:seed`       | Apply migrations / reseed the demo data                                   |
| `pnpm bench`                             | Latency benchmark against a running API (see PERFORMANCE.md)              |
| `pnpm db:explain`                        | `EXPLAIN (ANALYZE, BUFFERS)` for the key queries                          |
| `pnpm --filter api hash-password '<pw>'` | bcrypt hash for `HR_PASSWORD_HASH`                                        |
| `pnpm --filter api test:coverage`        | API unit coverage (85% line threshold on services and CSV)                |

## Project structure

```
apps/
  api/                      Express 5 REST API (/api/v1)
    src/app.ts              createApp(deps): pure wiring, used by tests
    src/server.ts           env, dependencies, listen, graceful shutdown
    src/db/                 Kysely client, schema types, migrations, deterministic seed
    src/middleware/         session guard, CSRF origin check, validation, error envelope
    src/modules/            auth, reference, employees, insights, csv (routes → controller → service → repository)
    scripts/                hash-password, explain
  web/                      Next.js 16 App Router
    src/app/                routes: login, employees (list/new/detail), insights, import
    src/features/           feature modules: api hooks, components, tests
    src/lib/                typed API client, money formatting, query client
    src/proxy.ts            redirects to /login without a session cookie
packages/
  shared/                   Zod schemas, DTO types, enums, exact money utilities
docs/                       requirements, spec, architecture, ADRs, trade-offs, performance, deployment
scripts/bench.mjs           latency benchmark
```

## Testing

The build is test-first: most features arrive as a failing `test(...)` commit followed by the
`feat(...)` commit that makes it pass.

| Suite           | Command                              | Covers                                                                                                                                                          |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared unit     | `pnpm --filter shared test`          | money parsing/formatting incl. JPY and float traps, Zod schemas                                                                                                 |
| API unit        | `pnpm --filter api test`             | services with in-memory fakes (all SPEC §2 rules), CSV parser and validator, export escaping, auth, seed salary model, HTTP layer via supertest                 |
| API integration | `pnpm --filter api test:integration` | migrations and constraints, repository filters/sorts/pagination, insights against a hand-computed fixture, import transactions and round trip, seed determinism |
| Web unit        | `pnpm --filter web test`             | API client (401 → login), login, list filters ↔ URL, employee form validation and currency label, detail/history/terminate, import preview, insights            |

Integration tests start PostgreSQL 16 in Docker via Testcontainers. CI (GitHub Actions) runs format,
lint, typecheck, unit tests, integration tests and builds on every push and pull request.

## Documentation

- [Requirements](docs/REQUIREMENTS.md): product scope and what is deliberately out of scope
- [Technical specification](docs/SPEC.md): the source of truth for the build
- [Architecture](docs/ARCHITECTURE.md): system context, layering, data model, login and import flows
- [Architecture decision records](docs/adr/): twelve ADRs, one per major decision
- [Trade-offs and deviations](docs/TRADEOFFS.md): key trade-offs and every deviation from the SPEC
- [Performance](docs/PERFORMANCE.md): measured latencies, query plans, scaling notes
- [Deployment](docs/DEPLOYMENT.md): Neon, Render and Vercel, step by step
- [AI workflow](docs/AI_WORKFLOW.md): how AI was used and how correctness was kept
- [Implementation prompt](docs/prompts/claude-code-implementation-prompt.md): the prompt used with Claude Code
- [Future improvements](docs/FUTURE.md)
- [Build progress](docs/PROGRESS.md)
