// Measures the SPEC §10 latency targets against a running API (default http://localhost:4000).
// Usage: node scripts/bench.mjs [apiOrigin]   (seeded database, API started separately)
// Plain timed requests rather than a load tester: the targets are single-user latencies.

const origin = process.argv[2] ?? 'http://localhost:4000';
const SAMPLES = 40;
const credentials = { email: 'hr@acme.test', password: 'acme-demo-2026' };

async function login() {
  const response = await fetch(`${origin}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  if (response.status !== 204) {
    throw new Error(`Login failed with ${response.status}`);
  }
  return response.headers.get('set-cookie').split(';')[0];
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

async function measure(label, request, samples = SAMPLES) {
  await request(); // warm-up: connection pool and query plans
  const timings = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    const response = await request();
    await response.arrayBuffer();
    if (!response.ok) {
      throw new Error(`${label}: HTTP ${response.status}`);
    }
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  return {
    label,
    samples,
    p50: percentile(timings, 0.5).toFixed(1),
    p95: percentile(timings, 0.95).toFixed(1),
    max: timings.at(-1).toFixed(1),
  };
}

const cookie = await login();
const get = (path) => () => fetch(`${origin}/api/v1${path}`, { headers: { cookie } });

const listScenarios = [
  '/employees',
  '/employees?sort=salaryUsd&order=desc',
  '/employees?sort=hireDate&order=desc&page=200',
  '/employees?sort=country',
  '/employees?sort=jobTitle&order=desc',
  '/employees?search=sharma',
  '/employees?search=EMP-0042',
  '/employees?country=JP&employmentType=full_time&sort=salaryUsd',
  '/employees?departmentId=1&status=all&pageSize=100',
  '/employees?status=terminated',
];
const insightScenarios = [
  '/insights/summary',
  '/insights/by-country',
  '/insights/by-country/IN',
  '/insights/by-job-title/1',
  '/insights/by-department',
  '/insights/by-country?employmentType=contract',
];

const results = [];
for (const path of [...listScenarios, ...insightScenarios]) {
  results.push(await measure(`GET ${path}`, get(path)));
}

// Import dry-run of the full 10,000-row export (the realistic worst case: every row is checked).
const exportResponse = await get('/employees/export.csv?status=active')();
const csv = await exportResponse.text();
const importDryRun = () => {
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'employees.csv');
  return fetch(`${origin}/api/v1/employees/import?dryRun=true`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
};
results.push(
  await measure(`POST import dry-run (${csv.trim().split('\n').length - 1} rows)`, importDryRun, 5),
);
results.push(
  await measure('GET export.csv (all statuses)', get('/employees/export.csv?status=all'), 5),
);

console.log('| Request | Samples | p50 (ms) | p95 (ms) | max (ms) |');
console.log('|---|---:|---:|---:|---:|');
for (const row of results) {
  console.log(`| \`${row.label}\` | ${row.samples} | ${row.p50} | ${row.p95} | ${row.max} |`);
}
