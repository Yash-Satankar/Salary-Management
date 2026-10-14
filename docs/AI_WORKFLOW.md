# AI workflow

This project was built with AI assistance on purpose, and with guard rails on purpose. This page
explains how the AI was used, how correctness was kept under human control, and where AI output had
to be corrected.

## How AI was used

1. **Planning in Claude chat.** The problem statement was worked through in conversation: the HR
   persona, what is in and out of scope and why, and the domain risks (currency mix-ups, float
   money, lost salary history, half-applied imports). The result is
   [REQUIREMENTS.md](REQUIREMENTS.md).
2. **Specification.** The technical decisions were then written down as [SPEC.md](SPEC.md): stack,
   domain rules, exact schema, API contract, testing strategy, performance targets and acceptance
   criteria. Both documents were committed before any code (see the first commit).
3. **Implementation prompt.** A detailed prompt for Claude Code
   ([prompts/claude-code-implementation-prompt.md](prompts/claude-code-implementation-prompt.md))
   turned the SPEC into a phased, test-first build plan with working rules: TDD loop, conventional
   commits, quality gates, "never deviate silently".
4. **Claude Code** executed the plan phase by phase in this repository, tracking progress in
   [PROGRESS.md](PROGRESS.md) so an interrupted session could resume from the checklist and
   `git log`.

The SPEC was the contract: when the agent had to fill a gap or deviate, the decision went into
[TRADEOFFS.md](TRADEOFFS.md) instead of silently into code.

## How correctness was maintained

- **Test-first, visible in history.** Domain rules, money utilities, CSV parsing, HTTP handlers and
  repositories were developed as red → green (→ refactor) commits. `git log` shows a `test(...)`
  commit that fails before each `feat(...)` commit that makes it pass.
- **Hand-computed fixtures.** Insight numbers are not "whatever the query returned": the fixture in
  `apps/api/src/modules/insights/repository.int.test.ts` derives every expected min, max, average,
  median, USD conversion and distribution bucket by hand in comments, including JPY and half-up
  rounding cases.
- **Real database semantics.** Constraints, medians, `width_bucket`, transactions and the seed are
  tested against PostgreSQL 16 in Testcontainers, not a lookalike.
- **Exactness checks.** Money parsing is tested against float traps (`0.29`, values beyond 2^53);
  the seed is checked for determinism with an MD5 checksum across two runs.
- **Quality gates on every phase and in CI.** Format, lint (typescript-eslint strict), typecheck,
  unit and integration suites, and production builds.
- **Measured, not assumed, performance.** [PERFORMANCE.md](PERFORMANCE.md) records real numbers and
  query plans; one endpoint missed its target and was fixed because it was measured.
- **Running the real app.** Beyond tests, the stack was run end to end (login through the proxy,
  export → re-import of all 10,000 rows) and the UI was rendered in a headless browser and
  inspected, which caught chart and favicon issues that unit tests could not.
- **Human review.** The SPEC, the commit history, tests and docs are written to be reviewed; the
  section below is where the author records what they checked and changed.

## Where AI output was corrected during the build

These came up while the agent was working and were caught by a failing test, a type error, a lint
gate or a measurement, then fixed in a separate commit or noted in TRADEOFFS:

- **Toolchain choice.** The newest TypeScript (7.x) is not supported by typescript-eslint, which the
  SPEC requires; the build pins TypeScript 6.0 (TRADEOFFS D1).
- **Reading the SPEC literally.** A test expected the "~25" job titles the SPEC mentions; the SPEC's
  own list has 26. The test was corrected, not the data (D4).
- **Library behaviour.** Integration tests expected `count(*)` as strings; the configured BIGINT
  parser correctly returns numbers. Kysely 0.29 moved its migrator to `kysely/migration`. TanStack
  Table v9 changed its column API. Zod keeps `undefined` keys after preprocessing. Each was found by a
  failing check, not assumed.
- **A faulty test double.** The in-memory employee repository returned shared object references,
  so an update mutated the service's "before" snapshot and a history test failed. The fake was fixed
  to return copies, like a real database.
- **A CSV test bug.** A test put an unquoted `12,50,000` in a CSV line, which splits into extra
  columns; the test data was quoted.
- **Performance.** The country drill-down first measured p95 198 ms (target 150). `EXPLAIN ANALYZE`
  showed PostgreSQL spending 70 ms on JIT compilation triggered by an inflated cost estimate; the
  query was restructured (D32) and verified against the same hand-computed fixtures.
- **Process slips.** Twice a commit landed with a lint error (a literal BOM byte in a test) or a
  failing assertion; each was corrected with a follow-up `fix(...)` commit rather than by rewriting
  history, and the commit helper was hardened to lint before committing.

## Human review notes

_To be completed by the author: what you reviewed, what you changed by hand, and what you would push
back on in the AI's output._

-
