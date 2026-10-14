# ADR 0009: Offset pagination (keyset noted for scale)

- Status: Accepted
- Date: 2026-10-13

## Context

The employee list must page through ~10,000 rows with any combination of filters and five sort
orders, show "page X of Y" and the total, and keep shareable URLs (`?page=12`).

## Decision

Use `LIMIT/OFFSET` with a separate `count(*)` over the same filters. Every sort appends `id` as a
tie-breaker so rows never repeat or disappear between pages.

## Consequences

- Simple URLs and arbitrary page jumps, which an HR user expects from a spreadsheet-like table.
- Measured worst case at 10k rows: p95 55 ms for page 200 (docs/PERFORMANCE.md).
- Offset cost grows with page depth; at 1M rows deep pages would be slow.

## Alternatives considered

- **Keyset (cursor) pagination:** constant cost per page, but no page jumps or "page X of Y", and
  the cursor must encode every sort column including the computed USD salary. Recommended once the
  table grows by orders of magnitude.
- **Loading everything client-side:** 10k rows of salary data in the browser for every view.
