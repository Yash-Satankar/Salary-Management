# ADR 0006: Salary history as an append-only table written transactionally

- Status: Accepted
- Date: 2026-10-13

## Context

Today a changed salary overwrites the old value in a spreadsheet. HR needs to see every change:
previous value, new value, effective date and reason.

## Decision

- `salary_changes` stores previous amount and currency (null for the initial row), new amount and
  currency, effective date, optional reason and a creation timestamp. Rows are never updated.
- Creating an employee writes the initial row; any change to salary or country writes a row **in the
  same transaction** as the employee update. A no-op salary writes nothing.
- CSV imports write rows with reason `"CSV import"`.
- The service receives a transaction runner that hands it a transaction-bound repository, so the
  employee update and history insert commit or roll back together.

## Consequences

- History cannot drift from the current salary; an integration test asserts the latest history row
  equals the employee's salary for all seeded employees.
- The current salary is denormalised on `employees` for fast lists and insights; history is for
  audit and the timeline.
- Only salary changes are audited; a full field-level audit log is future work.

## Alternatives considered

- **Event sourcing** (derive the salary from history): more powerful, but every list and insight
  query would need to resolve the latest event.
- **Database triggers** writing history: invisible in the application code and harder to test with
  reasons and effective dates supplied by the user.
