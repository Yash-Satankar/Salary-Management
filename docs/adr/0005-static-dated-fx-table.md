# ADR 0005: A static, dated FX table instead of live rates

- Status: Accepted
- Date: 2026-10-13

## Context

Leadership questions compare pay across countries ("engineers in India vs the US"), which needs a
common currency. Local-currency amounts are the truth; USD is only for comparison.

## Decision

Store one rate per currency in `fx_rates (usd_per_unit NUMERIC, as_of DATE, source TEXT)`, loaded by
a migration. Every API response with USD figures carries `meta.fx = { asOf, source }`, and every USD
figure in the UI is shown as `≈` with a disclaimer naming the date.

## Consequences

- Figures are reproducible: the same data always gives the same USD numbers, and tests can assert
  exact values.
- No external dependency, API key or outage mode.
- Rates go stale; updating them is a migration (or a future admin feature), and the `as_of` date makes
  staleness visible rather than hidden.

## Alternatives considered

- **Live rates from an FX API:** numbers would change daily without any data change, which confuses
  pay discussions, and it adds a failure mode.
- **Rates snapshotted per salary change:** the right tool for historical accuracy, but heavier than
  v1 needs; listed in docs/FUTURE.md.
