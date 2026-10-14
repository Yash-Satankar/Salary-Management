# ADR 0007: Soft termination instead of delete

- Status: Accepted
- Date: 2026-10-13

## Context

Employees leave. Their salary history is still needed for audits and for questions about past pay,
and deleting rows would cascade away that history.

## Decision

- `employees.status` is `active` or `terminated`, with `terminated_on` set exactly when terminated
  (a CHECK constraint enforces both directions and `terminated_on >= hire_date`).
- `POST /employees/:id/terminate` validates the date (not before hire, not in the future).
- Terminated employees are read-only (edits return 409) and excluded from all insights. The list
  shows active employees by default, with `terminated` and `all` filters.
- There is no delete endpoint.

## Consequences

- History and audit are preserved; insights reflect the current workforce.
- Reversing a termination is not supported in v1 (it would be a deliberate, audited operation).
- Personal data of leavers is retained; a retention policy would be needed for production use.

## Alternatives considered

- **Hard delete:** loses history.
- **An `archived_at` timestamp only:** loses the business date of the termination.
