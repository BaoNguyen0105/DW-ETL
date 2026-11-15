import { describe, expect, it, vi } from 'vitest'
import { ApiError, queryString, request } from '@/services/api'
import { deliverySchema, parseOptionalNumber } from '@/lib/delivery-schema'
import { csvContent } from '@/lib/format'

const valid = {
  purchase_date: '2018-08-15',
  estimated_date: '2018-08-20',
  seller_id: 'seller-1',
  category: 'health_beauty',
  n_items: 1,
  total_price: 0,
  total_freight: 0,
  c_state: 'SP',
  s_state: 'RJ',
}
describe('API contract and export', () => {
  it('omits All filters and preserves/encodes values correctly', () => {
    expect(queryString({ year: undefined, state: '', category: null })).toBe('')
    const params = new URLSearchParams(
      queryString({ year: 2018, state: 'SP', category: "kid's toys & games" }).slice(1),
    )
    expect(Object.fromEntries(params)).toEqual({
      year: '2018',
      state: 'SP',
      category: "kid's toys & games",
    })
  })
  it('preserves 422 field locations for inline errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: [{ loc: ['body', 'estimated_date'], msg: 'Ngày hẹn không hợp lệ' }],
          }),
          { status: 422 },
        ),
      ),
    )
    await expect(request('/dss/predict-late-delivery')).rejects.toMatchObject({
      status: 422,
      issues: [{ loc: ['body', 'estimated_date'], msg: 'Ngày hẹn không hợp lệ' }],
    })
  })
  it('explains absent model artifacts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })))
    await expect(request('/dss/sales-forecast')).rejects.toThrow('python -m dss')
  })
  it('handles an offline backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(request('/olap/kpis')).rejects.toThrow('Không kết nối được API')
  })
  it('rejects HTML masquerading as a successful API response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>SPA</html>')))
    await expect(request('/olap/kpis')).rejects.toBeInstanceOf(ApiError)
  })
  it('exports nulls, quoted text and numbers without CSV formula injection', () => {
    const csv = csvContent(
      ['name', 'value', 'missing'],
      [{ name: '=HYPERLINK("x")', value: -3.2, missing: null }],
    )
    expect(csv).toContain('"\'=HYPERLINK(""x"")"')
    expect(csv).toContain('"-3.2",""')
    expect(csv.startsWith('\uFEFF')).toBe(true)
  })
})
describe('delivery validation', () => {
  it('accepts leap dates, same-day delivery, zero prices and missing optional values', () => {
    expect(
      deliverySchema.safeParse({
        ...valid,
        purchase_date: '2024-02-29',
        estimated_date: '2024-02-29',
        total_weight_g: null,
      }).success,
    ).toBe(true)
    expect(parseOptionalNumber('')).toBeUndefined()
    expect(parseOptionalNumber('0')).toBe(0)
  })
  it.each([
    { purchase_date: '2018-02-29' },
    { purchase_date: '2018-08-15T00:00:00' },
    { estimated_date: '2018-08-14' },
    { purchase_date: '1677-09-22', estimated_date: '2262-04-11' },
    { n_items: 1.5 },
    { n_items: 0 },
    { n_items: '1' },
    { total_price: -1 },
    { total_freight: Infinity },
    { c_lat: 91 },
    { s_lng: -181 },
    { seller_id: '  ' },
  ])('rejects unsupported input %j', (change) => {
    expect(deliverySchema.safeParse({ ...valid, ...change }).success).toBe(false)
  })
})
