import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

// Read-only integration check. Requires existing warehouse/model artifacts and a running API.
const base = (process.env.API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '')
const results = []
async function call(path, body, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const data = await response.json()
  assert.equal(response.status, expectedStatus, `${path}: ${JSON.stringify(data)}`)
  results.push({ path, status: response.status })
  return data
}
const filters = await call('/olap/filters')
assert(filters.years.length > 0 && filters.states.length > 0 && filters.categories.length > 0)
const kpis = await call('/olap/kpis')
assert(kpis.total_orders > 0 && kpis.total_items >= kpis.total_orders)
for (const granularity of ['year', 'quarter', 'month']) {
  const points = await call(`/olap/sales-trend?granularity=${granularity}`)
  assert(points.length > 0 && points.every((point) => typeof point.period === 'string'))
  assert(Math.abs(points.reduce((sum, point) => sum + point.revenue, 0) - kpis.total_revenue) < 1)
}
for (const by of ['revenue', 'volume']) {
  const rows = await call(`/olap/top-categories?by=${by}&limit=50`)
  assert(rows.length > 0)
  const key = by === 'revenue' ? 'revenue' : 'total_items'
  assert(rows.slice(1).every((row, i) => row[key] <= rows[i][key]))
}
await call('/olap/geo-distribution')
const slice = new URLSearchParams({
  year: String(filters.years.at(-1)),
  state: 'SP',
  category: 'health_beauty',
})
for (const endpoint of ['kpis', 'sales-trend', 'top-categories', 'geo-distribution']) {
  await call(`/olap/${endpoint}?${slice}`)
  const empty = await call(`/olap/${endpoint}?year=2099`)
  if (endpoint === 'kpis') {
    assert.equal(empty.total_orders, 0)
    assert.equal(empty.on_time_rate, null)
  } else assert.equal(empty.length, 0)
}
const templates = await call('/olap/sample-queries')
for (const name of ['Roll-Up', 'Drill-Down', 'Slice', 'Dice']) {
  const result = await call('/olap/execute-query', { query: templates[name].sql })
  assert(result.columns.length > 0 && result.row_count === result.data.length)
}
const examples = await call('/dss/example-orders')
assert.equal(examples.count, examples.examples.length)
assert(examples.count > 0)
for (const example of examples.examples) {
  const { _actual_late, ...input } = example
  assert.equal(typeof _actual_late, 'boolean')
  const prediction = await call('/dss/predict-late-delivery', input)
  assert(prediction.late_probability >= 0 && prediction.late_probability <= 1)
  assert(['low', 'medium', 'high'].includes(prediction.risk_tier))
  assert(prediction.thresholds.high >= prediction.thresholds.medium)
}
const invalid = await call(
  '/dss/predict-late-delivery',
  { ...examples.examples[0], n_items: 0 },
  422,
)
assert(invalid.detail.some((issue) => issue.loc.at(-1) === 'n_items'))
await call('/dss/late-delivery-metrics')
const salesMetrics = await call('/dss/sales-metrics')
for (const target of ['orders', 'gmv']) {
  const result = await call(`/dss/sales-forecast?target=${target}`)
  assert.equal(result.target, target)
  assert.equal(result.horizon_days, result.forecast.length)
  assert.equal(result.horizon_days, 28)
  assert(result.forecast.every((point) => point.lo <= point.forecast && point.forecast <= point.hi))
  assert(salesMetrics[target].backtest[salesMetrics[target].chosen])
}
await mkdir(new URL('../.qa/', import.meta.url), { recursive: true })
await writeFile(
  new URL('../.qa/api-smoke.json', import.meta.url),
  JSON.stringify({ base, count: results.length, results, kpis }, null, 2),
)
console.log(`PASS: ${results.length} HTTP checks against ${base}`)
console.log(
  `Warehouse: ${kpis.total_orders} orders / ${kpis.total_items} items / R$ ${kpis.total_revenue}`,
)
