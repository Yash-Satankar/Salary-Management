# ACME Salary Management — Requirements (v1)

## Goal
Replace ACME's spreadsheet-based salary management with a web application in which the HR Manager can maintain salary data for ~10,000 employees across multiple countries and answer questions about how the organisation pays people — accurately, quickly, and without spreadsheet errors.

## Persona
**HR Manager, ACME.** Comfortable with Excel, not technical. Needs to (1) keep employee salary records correct, (2) answer pay questions from leadership ("What do we pay engineers in India vs the US?", "What is our salary range in Germany?"), and (3) move existing Excel data in and out without friction.

## Problems with today's process
- Data lives in many spreadsheets: no single source of truth, no validation, easy to mistype a salary or currency.
- No history: a changed salary overwrites the old value.
- Answering a pay question means manual filtering and pivot tables, often mixing currencies incorrectly.

## In scope (v1)
1. **Employee records** — list, search, filter (country, department, job title, employment type, status), sort and paginate 10,000+ employees; create, edit and terminate an employee. Validation enforces correct country↔currency pairing, unique emails and sensible salaries.
2. **Salary history** — every salary change is kept (previous value, new value, effective date, reason) and shown on the employee page.
3. **Pay insights** — per country: headcount, min / max / average / median salary in local currency; per job title within a country; salary distribution per country; the same role compared across countries; department breakdown; org-wide totals.
4. **Cross-currency comparison** — org-wide figures in USD using a static, dated reference exchange-rate table, always labelled "approximate, for comparison only". Local-currency figures remain the primary truth.
5. **CSV import & export** — export the (filtered) employee list; import a CSV to create or update employees, with a dry-run preview and row-level errors. All-or-nothing, so a bad file never half-applies. Export → edit in Excel → import works as a round trip.
6. **Single HR login** — one HR account; the app is unusable without signing in, because salary data is confidential.

## Deliberately out of scope (and why)
| Left out | Reason |
|---|---|
| Multiple users, roles, permissions | One persona is defined; RBAC adds significant surface with no v1 user need. The auth layer is isolated so it can be extended. |
| Live FX rates | Adds an external dependency and makes figures change daily without any data change. Static dated rates are reproducible and honest. |
| Payroll, tax, bonus, equity, allowances | This is salary *management and analysis*, not payroll. Base annual salary is the agreed unit. |
| Gender / demographic data & pay-equity analysis | Collecting sensitive personal data needs a privacy and legal basis; a superficial pay-gap metric is worse than none. A candidate for v2 with proper design. |
| Approval workflows for salary changes | No requirement for multi-step approval with a single HR user. |
| Native .xlsx import | Excel saves CSV natively; CSV keeps parsing simple and safe. |
| Hard delete | Terminated employees are retained (status + date) to preserve history and audit; they are excluded from insights. |
| Managing reference data (countries, job titles) in the UI | Controlled lists keep analytics groupings clean; changes ship via migration in v1. |

## Assumptions (pending confirmation from Incubyte)
- Salary = annual gross base salary, stored in the employee's local currency.
- Insights include **active** employees only; employment type can be filtered.
- One country has exactly one currency.

## Success criteria
- Any pay question listed above is answered in under 3 clicks and under 1 second.
- Seeded with 10,000 realistic employees across 8 countries; list and insight queries stay well under 200 ms.
- No invalid salary/currency combination can be saved, either through the UI or through import.
