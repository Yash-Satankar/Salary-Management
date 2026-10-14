# ADR 0011: CSV import is all-or-nothing with a dry run, upserting by employee code

- Status: Accepted
- Date: 2026-10-13

## Context

HR lives in Excel today. The import must let them export, edit and re-import safely. A half-applied
file is worse than a rejected one: the data would no longer match the file or the previous state.

## Decision

- `POST /employees/import?dryRun=true|false` with a multipart CSV (≤ 5 MB, ≤ 10,000 rows).
- Parsing and per-row validation are **pure functions** (unit-tested without a database): headers,
  title/department, country/currency pairing, decimals per currency, dates, duplicates within the
  file, and the same salary and hire-date rules as the API.
- Database checks (unknown codes, edits to terminated employees, emails owned by others) run next.
- A blank `employee_code` creates; an existing one updates; unchanged rows are counted, not written.
- If any row has an error, nothing is written. Otherwise everything is applied in **one
  transaction**, with history rows (reason `"CSV import"`) for salary changes.
- The response always lists `{ row, field, message }` errors with 1-based line numbers; the UI shows
  them and enables "Apply" only when there are none. `dryRun` defaults to `true`.
- Export uses the same columns, escapes formula-injection characters, and the importer reverses that
  escaping, so export → import reports every row unchanged.

## Consequences

- A bad file never changes data; the user fixes rows in Excel and retries.
- A 10,000-row dry run takes about 0.5 s; apply writes row by row inside one transaction, which is
  acceptable at this size (batched writes are noted for scale).
- Emails that swap between two employees in one file are rejected rather than ordered.

## Alternatives considered

- **Best-effort import (apply valid rows, report the rest):** leaves data in a state matching
  neither the file nor the previous data.
- **Matching by email:** emails change; the immutable employee code is the stable key.
- **Native .xlsx:** heavier parsing and attack surface; Excel saves CSV natively.
