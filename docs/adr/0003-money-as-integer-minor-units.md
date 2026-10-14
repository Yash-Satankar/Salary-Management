# ADR 0003: Money as integer minor units with a currency exponent table

- Status: Accepted
- Date: 2026-10-13

## Context

Salaries are stored in eight currencies. Binary floating point cannot represent most decimal
amounts exactly (`0.29 * 100 = 28.999…`), and currencies differ in decimals: JPY has none, the
others have two.

## Decision

- Store salaries as `BIGINT` integer **minor units** with the currency code.
- Keep each currency's exponent in `currencies.minor_unit` (JPY = 0) and use it for all parsing and
  formatting.
- Convert user input with `toMinor(majorString, minorUnit)`, exact string/BigInt arithmetic that
  rejects too many decimals, signs and garbage; render with `toMajorString` and `formatMoney`
  (Intl formats the decimal string directly, so no float is involved).
- FX rates are `NUMERIC` and travel as decimal strings; USD conversion uses BigInt in TypeScript and
  NUMERIC in SQL, rounding half-up to cents.
- The API's money shape is `{ amountMinor, currency }`.

## Consequences

- No rounding errors in storage, arithmetic, CSV round trips or display; JPY never shows decimals.
- Every money boundary (forms, CSV, API) must know the currency exponent, which is why the reference
  endpoint returns it with each country.
- BIGINT values are parsed to JS numbers with a guard that throws beyond 2^53, far above any salary.

## Alternatives considered

- **NUMERIC in the database and decimal strings everywhere:** exact, but every client would need a
  decimal library for comparison and arithmetic.
- **Floats with rounding at the edges:** the class of bug this application exists to remove.
