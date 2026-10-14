# Build progress

Resume rule: read this file and `git log --oneline` first, then continue from the first unticked item.

- [x] Step 0 — Inspect tooling, init git, commit requirements + spec
- [x] Phase 1 — Monorepo foundation
- [x] Phase 2 — `packages/shared` (money utilities, enums, Zod DTO schemas)
- [x] Phase 3 — Database (Kysely client, schema types, migrations, integration harness)
- [x] Phase 4 — Seed (salary model, deterministic 10k seed, determinism test)
- [x] Phase 5 — API skeleton & auth
- [x] Phase 6 — Reference & employees
- [x] Phase 7 — Insights
- [x] Phase 8 — CSV export & import
- [x] Phase 9 — Web foundation
- [x] Phase 10 — Web: employees
- [x] Phase 11 — Web: import/export & insights
- [x] Phase 12 — CI, performance, deployment config
- [x] Phase 13 — Documentation & artifacts
- [x] Phase 14 — Final verification (clean-room check passed; GitHub publishing pending: `gh` not installed)

## Notes

- Tooling at start: Node 24.19.0, pnpm 10.34.6, git 2.55.0, Docker 29.7.2 (Compose v5.5.0). GitHub CLI `gh` not installed.
- Phase 4: local seed of 10,000 employees + 25,103 history rows took 3.68–3.94 s (target < 15 s).
- Phase 8: full 10k export 0.69 s; dry-run re-import of the same file 0.34 s, 10,000 unchanged.
- Phase 12: all SPEC §10 targets met (worst list p95 54.9 ms, worst insight p95 94.8 ms, 10k dry-run import 0.48 s); see PERFORMANCE.md.
- Phase 14 (2026-10-14): fresh clone + fresh database → frozen install, migrate, seed (4.97 s), format, lint, typecheck, `test:all` (shared 81, API unit 174, web 51, integration 46 — all passing), build; `pnpm dev` HTTP smoke test 14/14 acceptance checks passed.
