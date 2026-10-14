# ADR 0010: Plain SQL aggregates instead of pre-aggregation or caching

- Status: Accepted
- Date: 2026-10-13

## Context

Insights (headcount, min/max/average/median per country, job title and department, distribution
buckets, USD comparisons) must answer in under a second and always reflect the latest edits and
imports.

## Decision

Each insights endpoint is a **single SQL statement** over live data. A CTE selects active employees
with their unrounded USD value (`salary_minor / 10^minor_unit * usd_per_unit * 100`); aggregates and
`percentile_cont(0.5)` medians run on it and are rounded once at the end. No aggregation happens in
JavaScript over employee lists.

## Consequences

- Numbers are always current and exact; the hand-computed fixture tests assert every endpoint.
- Measured p95 under 100 ms for every endpoint at 10k employees (docs/PERFORMANCE.md).
- Query cost grows with the table; at around 1M rows pre-aggregated tables and a read replica would
  be needed.
- One lesson from measurement: a correlated subquery pushed the plan cost over PostgreSQL's JIT
  threshold; plan cost, not only plan shape, matters.

## Alternatives considered

- **Materialized views:** fast reads, but need a refresh schedule and can show stale pay right after
  an import.
- **An application cache:** invalidation on every write path (edit, terminate, import) is a
  correctness risk for salary data, to save tens of milliseconds.
- **Aggregating in Node:** moves 10k rows over the wire per request and duplicates SQL's statistics.
