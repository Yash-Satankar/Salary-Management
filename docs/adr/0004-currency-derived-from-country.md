# ADR 0004: Currency derived from country, enforced by a composite foreign key

- Status: Accepted
- Date: 2026-10-13

## Context

Mixing up currencies is one of the spreadsheet errors the product must eliminate: an Indian salary
typed in USD is off by two orders of magnitude. In ACME's model each country has exactly one
currency.

## Decision

- Clients never send a currency for employees. The service looks up the country's currency and
  stores it; request schemas are strict objects, so a stray `currency` field is rejected.
- The database enforces the pairing: `countries` has `UNIQUE (code, currency_code)` and
  `employees (country_code, currency_code)` references it.
- Changing an employee's country requires a new salary in the same request (422 otherwise), because
  the old amount would silently change meaning. The form mirrors this with a warning.
- CSV import keeps a `currency` column for human readability but rejects any row where it does not
  match the country.

## Consequences

- No code path, including direct SQL, can store a mismatched pair.
- The currency column is redundant with the country, a deliberate denormalisation that makes salary
  rows self-describing (history rows keep their own currency too).
- Countries with several currencies would need a different model; out of scope.

## Alternatives considered

- **Currency only on the country (no column on employees):** simpler, but salary history needs the
  currency at the time of each change, and every money read would need a join.
- **Validation in the service only:** imports, scripts or future code could bypass it.
