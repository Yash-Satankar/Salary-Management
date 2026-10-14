# Performance

All numbers below were measured on 2026-10-14 on the development machine (Windows 11, Node 24.19,
PostgreSQL 16 in Docker Desktop, data set from `pnpm db:seed`: 10,000 employees, 25,103 salary
history rows). The API ran as the production bundle (`node dist/server.js`, `LOG_LEVEL=warn`) and
was measured with `pnpm bench` (`scripts/bench.mjs`): one warm-up request, then 40 sequential
requests per scenario (5 for the CSV scenarios), timed end to end over HTTP on localhost.

Reproduce: `docker compose up -d && pnpm db:migrate && pnpm db:seed`, start the API, then
`pnpm bench`. Query plans: `pnpm db:explain`.

## Targets (SPEC §10) and results

| Target                                             | Measured                                               | Result |
| -------------------------------------------------- | ------------------------------------------------------ | ------ |
| Seed 10k employees < 15 s                          | 3.7–7.6 s across runs (`pnpm db:seed` prints the time) | ✅     |
| `GET /employees`, any filter or sort, p95 < 100 ms | worst p95 **54.9 ms** (deep page 200, hire-date sort)  | ✅     |
| Insights endpoints < 150 ms each                   | worst p95 **94.8 ms** (`by-department`)                | ✅     |
| Import dry-run of 10k rows < 5 s                   | p95 **0.48 s** for 9,706 rows (a full active export)   | ✅     |

### Full benchmark output

| Request                                                             | Samples | p50 (ms) | p95 (ms) | max (ms) |
| ------------------------------------------------------------------- | ------: | -------: | -------: | -------: |
| `GET /employees`                                                    |      40 |     27.0 |     40.5 |    116.6 |
| `GET /employees?sort=salaryUsd&order=desc`                          |      40 |     40.0 |     52.8 |     74.7 |
| `GET /employees?sort=hireDate&order=desc&page=200`                  |      40 |     43.9 |     54.9 |     55.6 |
| `GET /employees?sort=country`                                       |      40 |     23.5 |     32.1 |     35.2 |
| `GET /employees?sort=jobTitle&order=desc`                           |      40 |     21.1 |     32.9 |     34.6 |
| `GET /employees?search=sharma`                                      |      40 |     29.0 |     41.2 |     49.1 |
| `GET /employees?search=EMP-0042`                                    |      40 |     33.6 |     46.0 |     55.7 |
| `GET /employees?country=JP&employmentType=full_time&sort=salaryUsd` |      40 |     17.5 |     35.1 |     42.0 |
| `GET /employees?departmentId=1&status=all&pageSize=100`             |      40 |     21.6 |     37.8 |     46.6 |
| `GET /employees?status=terminated`                                  |      40 |     16.2 |     27.6 |     30.1 |
| `GET /insights/summary`                                             |      40 |     34.7 |     46.9 |     59.7 |
| `GET /insights/by-country`                                          |      40 |     43.0 |     57.0 |     60.9 |
| `GET /insights/by-country/IN`                                       |      40 |     27.8 |     41.5 |     44.3 |
| `GET /insights/by-job-title/1`                                      |      40 |     17.3 |     26.5 |     36.6 |
| `GET /insights/by-department`                                       |      40 |     53.7 |     94.8 |     99.9 |
| `GET /insights/by-country?employmentType=contract`                  |      40 |     16.0 |     23.8 |     25.1 |
| `POST import dry-run (9706 rows)`                                   |       5 |    416.9 |    475.8 |    475.8 |
| `GET export.csv (all statuses)`                                     |       5 |    762.4 |    873.7 |    873.7 |

`export.csv` has no SPEC target; it is listed for completeness.

### What we changed to hit the targets

The first benchmark run measured `GET /insights/by-country/IN` at **p95 198 ms**, over target.
`EXPLAIN (ANALYZE)` showed the query itself took ~30 ms, but its _estimated_ cost (~127,000) passed
PostgreSQL's `jit_above_cost` (100,000) and **JIT compilation took 70 ms of the 102 ms**. The cost
estimate was inflated by a correlated per-bucket `count(*)` for the salary distribution. Counting
buckets once with `GROUP BY` and left-joining the ten buckets brought execution to **15.5 ms** with no
JIT and p95 to **41.5 ms**; the hand-computed insights integration tests were unchanged and green.

## Query plans (`EXPLAIN (ANALYZE, BUFFERS)`)

Captured with `pnpm db:explain`, which records the exact SQL Kysely sends from the repositories.

### Employee list, default sort (full name)

```text
Limit  (cost=1.08..12.88 rows=25 width=226) (actual time=0.147..0.269 rows=25 loops=1)
  Buffers: shared hit=115
  ->  Nested Loop  (cost=1.08..3569.40 rows=7559 width=226) (actual time=0.146..0.267 rows=25 loops=1)
        Buffers: shared hit=115
        ->  Nested Loop  (cost=0.92..3227.81 rows=7559 width=208) (actual time=0.120..0.214 rows=25 loops=1)
              Buffers: shared hit=113
              ->  Nested Loop  (cost=0.77..1657.42 rows=7559 width=176) (actual time=0.106..0.179 rows=25 loops=1)
                    Buffers: shared hit=63
                    ->  Nested Loop  (cost=0.61..1463.82 rows=7559 width=142) (actual time=0.092..0.140 rows=25 loops=1)
                          Buffers: shared hit=31
                          ->  Nested Loop  (cost=0.45..1219.73 rows=9706 width=156) (actual time=0.077..0.116 rows=25 loops=1)
                                Buffers: shared hit=29
                                ->  Index Scan using employees_status_name_idx on employees e  (cost=0.29..975.72 rows=9706 width=120) (actual time=0.042..0.068 rows=25 loops=1)
                                      Index Cond: (status = 'active'::text)
                                      Buffers: shared hit=27
                                ->  Memoize  (cost=0.16..0.18 rows=1 width=36) (actual time=0.001..0.001 rows=1 loops=25)
                                      Cache Key: e.currency_code
                                      Cache Mode: logical
                                      Hits: 24  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                                      Buffers: shared hit=2
                                      ->  Index Scan using fx_rates_pkey on fx_rates fx  (cost=0.15..0.17 rows=1 width=36) (actual time=0.027..0.027 rows=1 loops=1)
                                            Index Cond: (currency_code = e.currency_code)
                                            Buffers: shared hit=2
                          ->  Memoize  (cost=0.16..0.18 rows=1 width=18) (actual time=0.001..0.001 rows=1 loops=25)
                                Cache Key: e.currency_code
                                Cache Mode: logical
                                Hits: 24  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                                Buffers: shared hit=2
                                ->  Index Scan using currencies_pkey on currencies cur  (cost=0.15..0.17 rows=1 width=18) (actual time=0.014..0.014 rows=1 loops=1)
                                      Index Cond: (code = e.currency_code)
                                      Buffers: shared hit=2
                    ->  Memoize  (cost=0.16..0.18 rows=1 width=36) (actual time=0.001..0.001 rows=1 loops=25)
                          Cache Key: e.job_title_id
                          Cache Mode: logical
                          Hits: 9  Misses: 16  Evictions: 0  Overflows: 0  Memory Usage: 2kB
                          Buffers: shared hit=32
                          ->  Index Scan using job_titles_pkey on job_titles jt  (cost=0.15..0.17 rows=1 width=36) (actual time=0.001..0.001 rows=1 loops=16)
                                Index Cond: (id = e.job_title_id)
                                Buffers: shared hit=32
              ->  Index Scan using departments_pkey on departments d  (cost=0.15..0.21 rows=1 width=34) (actual time=0.001..0.001 rows=1 loops=25)
                    Index Cond: (id = jt.department_id)
                    Buffers: shared hit=50
        ->  Memoize  (cost=0.16..0.18 rows=1 width=44) (actual time=0.001..0.001 rows=1 loops=25)
              Cache Key: e.country_code
              Cache Mode: logical
              Hits: 24  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
              Buffers: shared hit=2
              ->  Index Scan using countries_code_currency_code_key on countries c  (cost=0.15..0.17 rows=1 width=44) (actual time=0.017..0.017 rows=1 loops=1)
                    Index Cond: (code = e.country_code)
                    Buffers: shared hit=2
Planning:
  Buffers: shared hit=75
Planning Time: 5.431 ms
Execution Time: 0.525 ms
```

### Employee list, sorted by USD salary (desc)

```text
Aggregate  (cost=625.18..625.19 rows=1 width=8) (actual time=12.046..12.057 rows=1 loops=1)
  Buffers: shared hit=205
  ->  Hash Join  (cost=170.38..606.28 rows=7559 width=0) (actual time=0.143..11.597 rows=9706 loops=1)
        Hash Cond: (e.country_code = c.code)
        Buffers: shared hit=205
        ->  Hash Join  (cost=139.68..555.65 rows=7559 width=3) (actual time=0.103..9.686 rows=9706 loops=1)
              Hash Cond: (jt.department_id = d.id)
              Buffers: shared hit=204
              ->  Hash Join  (cost=100.20..496.27 rows=7559 width=5) (actual time=0.077..8.420 rows=9706 loops=1)
                    Hash Cond: (e.job_title_id = jt.id)
                    Buffers: shared hit=203
                    ->  Hash Join  (cost=61.62..437.78 rows=7559 width=5) (actual time=0.048..6.835 rows=9706 loops=1)
                          Hash Cond: (cur.code = fx.currency_code)
                          Buffers: shared hit=202
                          ->  Hash Join  (cost=33.40..383.98 rows=9706 width=25) (actual time=0.024..5.043 rows=9706 loops=1)
                                Hash Cond: (e.currency_code = cur.code)
                                Buffers: shared hit=201
                                ->  Seq Scan on employees e  (cost=0.00..325.00 rows=9706 width=9) (actual time=0.004..3.298 rows=9706 loops=1)
                                      Filter: (status = 'active'::text)
                                      Rows Removed by Filter: 294
                                      Buffers: shared hit=200
                                ->  Hash  (cost=20.40..20.40 rows=1040 width=16) (actual time=0.009..0.012 rows=8 loops=1)
                                      Buckets: 2048  Batches: 1  Memory Usage: 17kB
                                      Buffers: shared hit=1
                                      ->  Seq Scan on currencies cur  (cost=0.00..20.40 rows=1040 width=16) (actual time=0.002..0.003 rows=8 loops=1)
                                            Buffers: shared hit=1
                          ->  Hash  (cost=18.10..18.10 rows=810 width=16) (actual time=0.010..0.011 rows=8 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=1
                                ->  Seq Scan on fx_rates fx  (cost=0.00..18.10 rows=810 width=16) (actual time=0.003..0.004 rows=8 loops=1)
                                      Buffers: shared hit=1
                    ->  Hash  (cost=22.70..22.70 rows=1270 width=4) (actual time=0.015..0.016 rows=26 loops=1)
                          Buckets: 2048  Batches: 1  Memory Usage: 17kB
                          Buffers: shared hit=1
                          ->  Seq Scan on job_titles jt  (cost=0.00..22.70 rows=1270 width=4) (actual time=0.005..0.007 rows=26 loops=1)
                                Buffers: shared hit=1
              ->  Hash  (cost=23.10..23.10 rows=1310 width=2) (actual time=0.010..0.011 rows=9 loops=1)
                    Buckets: 2048  Batches: 1  Memory Usage: 17kB
                    Buffers: shared hit=1
                    ->  Seq Scan on departments d  (cost=0.00..23.10 rows=1310 width=2) (actual time=0.003..0.004 rows=9 loops=1)
                          Buffers: shared hit=1
        ->  Hash  (cost=19.20..19.20 rows=920 width=12) (actual time=0.029..0.029 rows=8 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 9kB
              Buffers: shared hit=1
              ->  Seq Scan on countries c  (cost=0.00..19.20 rows=920 width=12) (actual time=0.016..0.017 rows=8 loops=1)
                    Buffers: shared hit=1
Planning Time: 0.896 ms
Execution Time: 12.302 ms
```

### Insights by country

```text
Sort  (cost=2232.82..2251.22 rows=7360 width=104) (actual time=31.369..31.378 rows=8 loops=1)
  Sort Key: (count(*)) DESC, c.name
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=203
  ->  GroupAggregate  (cost=975.36..1760.10 rows=7360 width=104) (actual time=13.633..31.333 rows=8 loops=1)
        Group Key: c.code, e.currency_code
        Buffers: shared hit=203
        ->  Sort  (cost=975.36..994.26 rows=7559 width=78) (actual time=12.582..13.807 rows=9706 loops=1)
              Sort Key: c.code, e.currency_code
              Sort Method: quicksort  Memory: 961kB
              Buffers: shared hit=203
              ->  Hash Join  (cost=92.33..488.41 rows=7559 width=78) (actual time=0.100..8.980 rows=9706 loops=1)
                    Hash Cond: (e.country_code = c.code)
                    Buffers: shared hit=203
                    ->  Hash Join  (cost=61.62..437.78 rows=7559 width=37) (actual time=0.059..7.040 rows=9706 loops=1)
                          Hash Cond: (cur.code = fx.currency_code)
                          Buffers: shared hit=202
                          ->  Hash Join  (cost=33.40..383.98 rows=9706 width=33) (actual time=0.035..5.081 rows=9706 loops=1)
                                Hash Cond: (e.currency_code = cur.code)
                                Buffers: shared hit=201
                                ->  Seq Scan on employees e  (cost=0.00..325.00 rows=9706 width=15) (actual time=0.006..3.145 rows=9706 loops=1)
                                      Filter: (status = 'active'::text)
                                      Rows Removed by Filter: 294
                                      Buffers: shared hit=200
                                ->  Hash  (cost=20.40..20.40 rows=1040 width=18) (actual time=0.011..0.013 rows=8 loops=1)
                                      Buckets: 2048  Batches: 1  Memory Usage: 17kB
                                      Buffers: shared hit=1
                                      ->  Seq Scan on currencies cur  (cost=0.00..20.40 rows=1040 width=18) (actual time=0.004..0.004 rows=8 loops=1)
                                            Buffers: shared hit=1
                          ->  Hash  (cost=18.10..18.10 rows=810 width=36) (actual time=0.012..0.013 rows=8 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=1
                                ->  Seq Scan on fx_rates fx  (cost=0.00..18.10 rows=810 width=36) (actual time=0.004..0.005 rows=8 loops=1)
                                      Buffers: shared hit=1
                    ->  Hash  (cost=19.20..19.20 rows=920 width=44) (actual time=0.024..0.025 rows=8 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on countries c  (cost=0.00..19.20 rows=920 width=44) (actual time=0.012..0.014 rows=8 loops=1)
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=2
Planning Time: 0.569 ms
Execution Time: 31.807 ms
```

Reading the plans:

- **Default list sort** walks `employees_status_name_idx (status, full_name, id)` in order and stops
  after 25 rows: sub-millisecond, independent of table size.
- **USD sort** must compute the USD value for every active employee and top-N sort them (~12 ms):
  the value depends on the FX table, so it cannot be indexed on `employees` alone. Fine at 10k.
- **By country** is one pass over the active rows with hash joins to the tiny reference tables, then
  a group per country computing min/max/avg and two `percentile_cont` medians (~30 ms).

## Why there is no caching or pre-aggregation

At 10,000 employees every query is a single indexed or sequential pass over a few MB that fits in
shared buffers; the slowest endpoint is under 100 ms at p95. A cache would add invalidation on every
salary change, import and termination (correctness risk on salary data) to save tens of
milliseconds. Materialized views would add refresh scheduling and could show stale pay figures right
after an import. Plain SQL over live data keeps every number exact and current (see ADR 0010).

## What would change at 1M employees

- **Keyset pagination** for the list (`WHERE (full_name, id) > ($1, $2)`): offset pagination reads
  and discards every skipped row, which grows linearly with the page number (ADR 0009).
- **Pre-aggregated tables** for insights (per country/title/department/employment type), maintained
  transactionally or by a job, so dashboards read hundreds of rows rather than scanning millions.
- **A stored USD value** (or a generated column refreshed when FX rates change) with an index, so
  the USD sort becomes an index walk instead of a full sort.
- **Trigram search** is already indexed (`employees_full_name_trgm_idx`); email-prefix search would
  need a `text_pattern_ops` index on `lower(email)`.
- **A read replica** for insights and exports, keeping analytical load off the primary that serves
  writes.
- Export via a server-side cursor instead of offset paging, and import writes batched with
  `INSERT … SELECT FROM unnest(...)` rather than row by row.
