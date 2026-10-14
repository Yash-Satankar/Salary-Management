# Architecture

ACME Salary Management is a TypeScript monorepo: an Express 5 + PostgreSQL API, a Next.js App Router
web app, and a shared package that holds the API contract. Product scope is in
[REQUIREMENTS.md](REQUIREMENTS.md), the technical specification in [SPEC.md](SPEC.md), and the
reasoning behind each major choice in [adr/](adr/).

```
packages/shared   Zod schemas, DTO types, enums, money utilities (imported as TS source by both apps)
apps/api          Express 5, Kysely + pg, pino, jose, bcryptjs, multer, csv-parse / csv-stringify
apps/web          Next.js 16 (App Router), React 19, Tailwind + shadcn/ui, TanStack Query/Table, nuqs, Recharts
```

## System context

The browser only ever talks to the Next.js origin. Next.js rewrites `/api/*` to the API, so the
session cookie is first-party and no CORS is needed ([ADR 0008](adr/0008-single-user-jwt-cookie-same-origin-proxy.md)).

```mermaid
flowchart LR
  user([HR manager]) --> browser[Browser]
  subgraph web["Next.js web app (Vercel)"]
    pages[App Router pages<br/>client components]
    guard[proxy.ts<br/>cookie guard]
    rewrite["rewrites /api/* → API_ORIGIN"]
  end
  subgraph api["Express API (Render)"]
    express[createApp<br/>/api/v1]
  end
  db[(PostgreSQL 16<br/>Neon / docker compose)]

  browser -->|HTML, JS| pages
  browser -->|every page request| guard
  browser -->|fetch /api/v1/... + acme_session cookie| rewrite
  rewrite -->|HTTP proxy| express
  express -->|pg pool, SSL in prod| db
```

## API layering

Every module follows routes → controller → service → repository. Dependencies are passed in through
factory functions; `createApp(deps)` only wires them, so tests build the same app with fakes.

```mermaid
flowchart TB
  subgraph http["HTTP layer"]
    mw["helmet · pino-http · express.json(100kb)<br/>originCheck (CSRF) · requireSession"]
    routes[routes]
    ctrl["controllers<br/>validate(schemas, handler) with shared Zod schemas<br/>sendData envelope"]
  end
  subgraph domain["Domain layer"]
    svc["services<br/>employee rules · import planning<br/>transaction(work)"]
    rules["employees/rules.ts<br/>salary limit · hire-date limit"]
    pure["csv/import-parser.ts (pure)<br/>csv/export.ts (pure + stream)"]
  end
  subgraph data["Data layer"]
    repo["repositories (SQL only)<br/>employees · reference · insights"]
    kysely[Kysely + pg<br/>BIGINT→number guard, DATE→string]
  end
  err["error handler<br/>AppError · Zod · multer · body-parser → error envelope"]

  mw --> routes --> ctrl --> svc --> repo --> kysely
  svc --> rules
  svc --> pure
  pure --> rules
  ctrl -. "insights & reference: no domain rules" .-> repo
  ctrl -. throws .-> err
  svc -. throws .-> err
```

| Module      | Routes                                                                                         | Notes                                                     |
| ----------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `health`    | `GET /health`                                                                                  | public; checks the database                               |
| `auth`      | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`                                        | login rate-limited 5/min                                  |
| `reference` | `GET /reference`                                                                               | countries with currency exponent, departments, titles, FX |
| `employees` | `GET/POST /employees`, `GET/PATCH /employees/:id`, `POST /employees/:id/terminate`             | service enforces SPEC §2                                  |
| `csv`       | `GET /employees/export.csv`, `POST /employees/import`                                          | registered before `/employees/:id`                        |
| `insights`  | `/insights/summary`, `/by-country`, `/by-country/:code`, `/by-job-title/:id`, `/by-department` | one SQL statement each                                    |

## Data model

Reference tables are filled by a migration, so every environment has them. Employee currency is
pinned to the country by a composite foreign key ([ADR 0004](adr/0004-currency-derived-from-country.md));
salary history is append-only ([ADR 0006](adr/0006-append-only-salary-history.md)).

```mermaid
erDiagram
  currencies ||--|| fx_rates : "has rate"
  currencies ||--o{ countries : "is used by"
  departments ||--o{ job_titles : contains
  countries ||--o{ employees : "employs (code + currency)"
  job_titles ||--o{ employees : "holds"
  employees ||--o{ salary_changes : "has history"
  currencies ||--o{ salary_changes : "previous / new currency"

  currencies {
    char3 code PK
    text name
    smallint minor_unit "0 for JPY"
  }
  fx_rates {
    char3 currency_code PK, FK
    numeric usd_per_unit "NUMERIC(20,10)"
    date as_of
    text source
  }
  countries {
    char2 code PK
    text name UK
    char3 currency_code FK "UNIQUE (code, currency_code)"
  }
  departments {
    smallint id PK
    text name UK
  }
  job_titles {
    smallint id PK
    text name UK
    smallint department_id FK
  }
  employees {
    bigint id PK
    text employee_code UK "EMP-000001, from a sequence"
    text full_name
    text email "unique on lower(email)"
    smallint job_title_id FK
    char2 country_code FK "composite FK with currency_code"
    char3 currency_code FK
    bigint salary_minor "minor units, > 0"
    text employment_type "full_time | part_time | contract"
    date hire_date
    text status "active | terminated"
    date terminated_on "set iff terminated"
  }
  salary_changes {
    bigint id PK
    bigint employee_id FK
    bigint previous_salary_minor "null for the initial row"
    char3 previous_currency_code
    bigint new_salary_minor
    char3 new_currency_code
    date effective_date
    text reason "<= 200 chars"
  }
```

## Login sequence

```mermaid
sequenceDiagram
  autonumber
  actor HR as HR manager
  participant B as Browser
  participant N as Next.js (proxy.ts + rewrites)
  participant A as Express API
  HR->>B: open /employees
  B->>N: GET /employees (no cookie)
  N-->>B: 307 → /login?next=/employees
  HR->>B: submit email + password
  B->>N: POST /api/v1/auth/login (JSON)
  N->>A: proxied request
  A->>A: originCheck, rate limit (5/min), Zod validation
  A->>A: bcrypt.compare (dummy hash if email unknown)
  alt valid
    A-->>N: 204 + Set-Cookie acme_session (HttpOnly, SameSite=Lax, Secure in prod, 8h JWT)
    N-->>B: 204 + first-party cookie
    B->>N: router.replace(next)
    N->>A: GET /api/v1/... with cookie
    A->>A: requireSession verifies HS256 JWT
    A-->>B: data
  else invalid
    A-->>B: 401 "Invalid email or password"
  end
  Note over B,A: any later 401 makes the API client redirect to /login?next=…
```

## CSV import sequence

```mermaid
sequenceDiagram
  autonumber
  actor HR as HR manager
  participant W as Import page
  participant A as API (csv routes)
  participant P as import-parser (pure)
  participant S as import-service
  participant DB as PostgreSQL
  HR->>W: choose employees.csv
  W->>A: POST /employees/import?dryRun=true (multipart, ≤ 5 MB)
  A->>P: parseImportFile(text)
  alt missing headers / not CSV / > 10,000 rows
    P-->>W: 400 VALIDATION_ERROR (file-level)
  end
  A->>S: run(text, dryRun)
  S->>P: validateImportRows(rows, reference data)
  S->>DB: findByCodes, findByEmails
  S->>S: plan create / update / unchanged + DB-level row errors
  S-->>W: 200 { toCreate, toUpdate, unchanged, errors[] }
  W->>HR: summary + error table; Apply enabled only with 0 errors
  HR->>W: Apply import
  W->>A: POST /employees/import?dryRun=false
  A->>S: run again (re-validates the same file)
  S->>DB: BEGIN
  S->>DB: insert / update employees, insert salary_changes ("CSV import")
  S->>DB: COMMIT (or ROLLBACK on any failure)
  S-->>W: 200 result
  W->>W: invalidate employee and insights queries, toast
```

## Web app structure

```
apps/web/src/
  proxy.ts                         cookie guard → /login (Next 16 name for middleware)
  app/(auth)/login                 sign-in
  app/(app)/layout.tsx             sidebar + header (AppShell)
  app/(app)/employees              list, new, [id] (detail + edit + history + terminate)
  app/(app)/insights, import
  features/<feature>/              api/hooks, components, tests
  lib/api-client.ts                typed fetch: envelope parsing, response schemas, 401 → /login
  lib/money.ts                     formatting via the shared money utilities
```

Server state lives in TanStack Query; list filters, sort, page and insight drill-downs live in the
URL (nuqs) so views can be shared. Forms use react-hook-form with the shared Zod rules.

## Cross-cutting concerns

- **Money:** integer minor units, exponent from `currencies`, exact string/BigInt conversion
  ([ADR 0003](adr/0003-money-as-integer-minor-units.md)).
- **USD:** static dated FX ([ADR 0005](adr/0005-static-dated-fx-table.md)); every USD response carries
  `meta.fx` and every USD figure in the UI is shown with `≈` and the as-of date.
- **Errors:** one envelope `{ error: { code, message, details? } }`; field-level errors use Zod's
  `{ formErrors, fieldErrors }` shape so forms map them to inputs.
- **Logging:** pino with redaction of passwords, cookies and authorization headers.
- **Time:** an injected `clock` provides "today" to services, so tests are deterministic.
