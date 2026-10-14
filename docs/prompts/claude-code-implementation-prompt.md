# Claude Code — Implementation Prompt: ACME Salary Management

## Role
You are a senior full-stack engineer and software craftsperson. You will build a complete, production-quality salary management application end to end: a TypeScript monorepo with an Express + PostgreSQL API and a Next.js web app. You work **test-first**, in small, verifiable increments, and you leave a commit history that shows how the solution evolved.

## Context
- **Project root:** `D:/Salary Management`. This folder is empty except for `REQUIREMENTS.md` and `SPEC.md`. It is **not** a git repository yet, and no GitHub repository exists. You create everything: git repo, monorepo, apps, docs.
- **Environment:** Windows. The path contains a space, so always quote paths in shell commands. All npm scripts must be cross-platform: no `rm -rf`, no `export VAR=`, no bash-only syntax. Use Node scripts, `rimraf` or `cross-env` where needed.
- **Source of truth:** `docs/REQUIREMENTS.md` (product scope) and `docs/SPEC.md` (technical spec). Step 0 moves both into `docs/`. Read both fully before writing any code. When this prompt and the SPEC disagree, the SPEC wins. When the SPEC is silent, choose the simplest option consistent with it and record the choice in `docs/TRADEOFFS.md`.
- The repository is evaluated by Incubyte, a company that values TDD, clean code, small meaningful commits and clear reasoning. Reviewers will read the commit history, the tests and the docs, not just the running app.

## Step 0 — Inspect and initialise
1. **Check tooling.** Report the installed versions of Node, pnpm (enable it via `corepack` if missing), git, Docker Desktop (it must be running, because Testcontainers and docker compose need it) and the GitHub CLI `gh`, if present. If Node, git or Docker is missing or not running, stop and tell me exactly what to install.
2. **Check git identity.** Confirm that `git config user.name` and `git config user.email` are set. If either is missing, stop and ask me for the values. Do not invent them.
3. **If `D:/Salary Management/.git` does not exist:**
   - Run `git init -b main`.
   - Add `.gitattributes` (`* text=auto eol=lf`) and a Node/Next/env `.gitignore`.
   - Move `REQUIREMENTS.md` and `SPEC.md` into `docs/` unchanged.
   - Make the first commit, `docs: add requirements and technical specification`, containing only those files.

   This commit must come before any code, because it shows that the thinking came first.
4. **If `.git` already exists,** you are resuming. Skip the step above.
5. Never modify `docs/REQUIREMENTS.md` or `docs/SPEC.md` after that commit. Record deviations in `docs/TRADEOFFS.md` instead.
6. Create `docs/PROGRESS.md`: a checklist of every phase below, ticked as you complete each one. If this session is interrupted, a new session must be able to resume from `PROGRESS.md` plus `git log`. **Always read `docs/PROGRESS.md` first if it already exists, and continue from the first unticked item.**

## Working rules (apply to every phase)

### TDD loop
For every behaviour in domain or service code, the CSV modules, shared money utilities, HTTP handlers and SQL repositories:
1. Write the test(s) for one behaviour slice. Run them and **confirm they fail for the expected reason**.
2. Commit: `test(<scope>): <behaviour>`.
3. Write the minimum implementation to pass. Run the suite.
4. Commit: `feat(<scope>): <behaviour>`.
5. Refactor if useful, keep it green, and commit: `refactor(<scope>): ...`.

A "slice" is one coherent behaviour, e.g. "create employee derives currency from country", not a whole module. Scaffolding, configuration, UI layout and docs do not need a red commit.

### Commits
- Use Conventional Commits (`feat`, `test`, `refactor`, `fix`, `chore`, `docs`, `ci`, `perf`) with scopes `shared`, `api`, `db`, `web`, `csv`, `insights`, `auth`, `docs`, `ci`.
- Make many small commits. Expect roughly 60–100 over the whole build.
- Never make a commit that mixes unrelated changes.
- Never commit secrets or `.env` files.
- Except for intentional red-test commits, every commit must pass lint and typecheck.

### Quality gates
Run these at the end of every phase. Do not move on while anything is red, unless it is an intentional red test inside a TDD loop.
- `pnpm lint`
- `pnpm typecheck`
- the relevant test suites

### Code standards
- TypeScript strict, with no `any` (use `unknown` and narrow).
- No dead code and no commented-out code.
- Small functions and descriptive names.
- Comments explain *why*, not *what*.
- Never use floats for money.
- Dependencies are injected; "today" comes from an injected `clock`.

### Tests
- Fast and deterministic: no real time, no randomness without a seed, no network.
- Test names describe behaviour.
- Unit tests use in-memory fakes, not mocking libraries, for repositories.

### Dependencies
- Install the latest stable versions at the time of the build.
- Pin them through the lockfile.
- Do not add libraries beyond SPEC §1 without recording the reason in `docs/TRADEOFFS.md`.

### Decisions
Never deviate silently from the SPEC. Record each deviation in `docs/TRADEOFFS.md`.

### Interruptions
Do not stop to ask questions about things the SPEC already decides. Only stop for genuine blockers, such as missing tooling or credentials you cannot create.

## Phases

### Phase 1 — Monorepo foundation
- pnpm workspace at the project root. The root package is named `acme-salary-management`, with `apps/api`, `apps/web` and `packages/shared` (scoped as `@acme/api`, `@acme/web`, `@acme/shared`). Scaffold Next.js non-interactively; never use prompts that wait for input.
- Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:integration`, `test:all`, `db:migrate`, `db:seed`, `format`.
- Shared tsconfig base, ESLint flat config, Prettier, `.editorconfig`, `.gitignore`, `.nvmrc`.
- `docker-compose.yml` with Postgres 16 (healthcheck, named volume) for local development.
- `.env.example` for api and web.
- `CLAUDE.md` at the root: project overview, commands, architecture map, TDD and commit conventions, and a pointer to the SPEC.
- Commit in logical chunks.

### Phase 2 — `packages/shared` (TDD)
- Money utilities:
  - `toMinor(majorString, minorUnit)` using exact string arithmetic, rejecting too many decimals, negatives and garbage.
  - `toMajorString(minor, minorUnit)`.
  - `formatMoney(money, minorUnit, locale)`.
  - USD conversion helper (for display) using string-decimal rates.
  - Cover JPY (minor unit 0).
- Enums and Zod schemas for every API request and response DTO in SPEC §5: employee create/update, list query, terminate, auth, money, error envelope.
- Export the types.

### Phase 3 — Database
- Kysely client.
- `BIGINT` → number parser with a safe-integer guard.
- Hand-written `Database` types.
- Migrator script.
- Migrations exactly as SPEC §3, plus the reference-data migration.
- Integration-test harness: a Testcontainers Postgres started once per test file or suite, migrations applied, and tables truncated between tests.
- Integration tests: migrations apply cleanly; the composite FK rejects a mismatched currency; email uniqueness is case-insensitive; the employee code is generated.

### Phase 4 — Seed (TDD for the pure parts)
- Unit-test `salary-model.ts`: country factors, noise bounds, rounding (including JPY), determinism.
- Implement the seed as specified in SPEC §4.
- Integration-test that two runs produce identical data (checksum) and exactly 10,000 employees.
- Run it locally and record the elapsed time.

### Phase 5 — API skeleton & auth (TDD)
- `createApp(deps)`.
- Env validation.
- Logger with redaction.
- Error handler and envelope.
- Zod validation middleware.
- Health route.
- Origin check.
- Auth service, login/logout/me routes, auth middleware, rate limiter.
- The `hash-password` script.
- Supertest tests: 401 on protected routes; login success sets an httpOnly cookie; a wrong password returns a generic 401; validation errors use the envelope; unknown routes return 404 in the envelope.

### Phase 6 — Reference & employees (TDD, slice by slice)
- Reference endpoint.
- Employee service rules from SPEC §2, one slice at a time:
  - currency derivation
  - salary bounds via the USD equivalent
  - duplicate email → CONFLICT
  - initial history row
  - salary change writes history; a no-op does not
  - country change without salary → 422
  - terminated is read-only
  - terminate validation
  - hire-date rule
- Repository with list filters, search, sorts (including `salaryUsd`) and pagination, verified by integration tests.
- Controllers and routes.
- Supertest tests for status codes.

### Phase 7 — Insights (TDD with fixtures)
- Build a small hand-crafted fixture (about 12 employees across 3 countries including JP, with known values) and compute the expected min/max/avg/median/USD values by hand in the test file, with comments.
- Implement each insights endpoint as a single SQL statement and assert exact values in integration tests.
- Include the distribution-bucket edge case: the max value lands in the last bucket.

### Phase 8 — CSV export & import (TDD)
- Pure parser and row validator, unit-tested, covering:
  - headers
  - each validation rule in SPEC §5
  - duplicate emails in the file
  - salary decimals per currency
  - formula escaping on export
- Import service: dry-run plan of create / update / unchanged, and all-or-nothing apply in a transaction with history rows. Integration-test both.
- Round-trip test: export → import gives all `unchanged`.
- Routes, with multer limits giving 413.

### Phase 9 — Web foundation
- Next.js app with Tailwind and shadcn/ui.
- Rewrites to `API_ORIGIN`.
- `middleware.ts` guard.
- TanStack Query provider.
- Typed api-client (shared schemas, envelope parsing, 401 → `/login`).
- Login page.
- App shell with sidebar and logout.
- Web test setup (Vitest + RTL + jsdom).

### Phase 10 — Web: employees
- List page with URL-synced filters, sort, pagination, debounced search, and USD column with tooltip.
- Loading, empty and error states.
- Create and edit forms (shared schemas, currency-aware salary input, country-change warning, salary change effective date and reason).
- Detail page with the history timeline and terminate dialog.
- Component tests per SPEC §9.

### Phase 11 — Web: import/export & insights
- Export button that respects the current filters.
- Import page: upload → dry-run summary and error table → apply, with a template CSV download.
- Insights page per SPEC §8, with charts, drill-downs, role comparison and the FX disclaimer.
- Component tests per SPEC §9.

### Phase 12 — CI, performance, deployment config
- GitHub Actions CI per SPEC §9.
- Measure the performance targets in SPEC §10 (a small `scripts/bench` using autocannon or timed requests is fine).
- Capture EXPLAIN ANALYZE output and write `docs/PERFORMANCE.md` with the real numbers.
- `render.yaml`, Vercel notes and `docs/DEPLOYMENT.md`.

### Phase 13 — Documentation & artifacts
- **`README.md`**:
  - what it is
  - screenshots placeholder section
  - live demo URL, video URL and demo credentials placeholders (marked `TODO`)
  - quick start
  - commands
  - project structure
  - testing
  - links to all docs
- **`docs/ARCHITECTURE.md`** with Mermaid diagrams:
  - system context (browser → Next.js → proxy → Express → Postgres)
  - API layering
  - ER diagram
  - login sequence
  - CSV import sequence
- **`docs/adr/0001-...md` … `0012-...md`**, one per decision in SPEC §12.
- **`docs/TRADEOFFS.md`**: key trade-offs plus every deviation recorded during the build.
- **`docs/AI_WORKFLOW.md`**:
  - how AI was used (planning in Claude chat → SPEC → this prompt → Claude Code)
  - how correctness was maintained (TDD, hand-computed fixtures, quality gates, human review)
  - where AI output was corrected (leave a section headed "Human review notes" for the author to fill in)
- **`docs/prompts/claude-code-implementation-prompt.md`**: this prompt, copied verbatim.
- **`docs/FUTURE.md`**: possible improvements (RBAC, audit log of all field changes, live FX with snapshotting, keyset pagination, pay-equity analysis with proper design, xlsx import, effective-dated future salary changes, E2E tests with Playwright).

### Phase 14 — Final verification
Run the clean-room check:
1. Fresh clone into a temp directory.
2. `docker compose up -d`, `pnpm install --frozen-lockfile`, `pnpm db:migrate`, `pnpm db:seed`.
3. `pnpm test:all`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
4. Start the app and smoke-test the main flows via HTTP.

Then walk the 15 acceptance criteria in SPEC §13 one by one and fix anything failing (with a `fix:` commit).

**Publishing to GitHub**

If `gh` is installed and `gh auth status` shows I am logged in:
1. Create a **public** repository named `acme-salary-management` under my account with `gh repo create acme-salary-management --public --source . --remote origin`.
2. Push `main` with the full history. Never squash or rewrite history.
3. Confirm the CI run starts.

Otherwise, do not try to authenticate. Give me the exact commands to create the repository and push.

## Final report
When finished, reply with:
1. Phase checklist with status.
2. Test counts per suite (passed/failed) and coverage of the targeted modules.
3. Measured performance numbers.
4. Acceptance criteria 1–15: pass/fail with one line of evidence each.
5. Every deviation from the SPEC and why.
6. Total commit count, the last 30 commits (`git log --oneline -30`) and the GitHub repository URL, if one was created.
7. Exactly what I still need to do manually (deployment accounts, env values, seeding production, video), as a numbered list.
