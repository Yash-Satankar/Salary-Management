# Future improvements

Ordered roughly by value to ACME. None of these is needed for v1 (see REQUIREMENTS "out of scope").

1. **Multiple users and RBAC.** Replace the env-based HR account with a users table (hashed
   passwords or SSO via OIDC), roles such as HR admin, HR viewer and finance read-only, and
   per-country scoping. The session cookie, `requireSession` middleware and same-origin proxy stay.
2. **Audit log of all field changes.** Salary history already records salary changes; extend it to
   an append-only audit of every field change, termination and import, with who and when.
3. **Live FX with snapshotting.** Fetch daily rates from a provider, keep every dated rate, and
   snapshot the rate used with each salary change, so historical USD figures stay reproducible while
   current figures stay fresh.
4. **Keyset pagination and scale work.** Cursor pagination for deep pages, a stored/indexed USD
   value for sorting, pre-aggregated insight tables and a read replica (see PERFORMANCE.md).
5. **Pay-equity analysis, designed properly.** Only with a privacy and legal basis for collecting
   demographic data, access controls, minimum group sizes and statistically sound controls for role,
   level, location and tenure. A superficial gap metric is worse than none.
6. **Native .xlsx import.** Parse workbooks directly (with strict limits) for users who cannot save
   CSV, reusing the same pure row validator.
7. **Effective-dated future salary changes.** Allow scheduling a raise for a future date, with the
   current salary switching automatically on the effective date and history reflecting both.
8. **End-to-end tests with Playwright.** Cover login, list filtering, create/edit/terminate, import
   and insights in a real browser in CI, in addition to the existing unit and integration suites.
9. **Operational polish.** Structured request IDs across Next.js and the API, error tracking
   (e.g. Sentry), a data-retention policy for terminated employees, and batched import writes.
10. **Approval workflow** for salary changes once more than one HR user exists.
