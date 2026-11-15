import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import Overview from '@/pages/Overview'
import OLAP from '@/pages/OLAP'
import DeliveryRisk from '@/pages/DeliveryRisk'
import SalesForecast from '@/pages/SalesForecast'
import { AppRoutes } from '@/App'

const example = {
  purchase_date: '2018-08-15',
  estimated_date: '2018-08-20',
  seller_id: 'seller-1',
  category: 'health_beauty',
  n_items: 2,
  total_price: 120,
  total_freight: 0,
  c_state: 'SP',
  s_state: 'RJ',
  total_weight_g: null,
  _actual_late: false,
}
const sampleQueries = Object.fromEntries(
  ['Roll-Up', 'Drill-Down', 'Slice', 'Dice'].map((name, i) => [
    name,
    { description: name, sql: `SELECT ${i + 1} AS value;` },
  ]),
)
const score = {
  daily_wape: 0.202,
  weekly_wape: 0.178,
  bias_pct: -2.1,
  median_fold_wape: 0.131,
  n_folds: 13,
}
const metrics = {
  chosen: 'level_dow',
  backtest: { level_dow: score },
  interval_80: { lo: 0.708, hi: 1.319 },
  event_uplift: {},
}
let calls: { path: string; init?: RequestInit }[]
let predictionStatus: number

function mount(page: ReactNode, route = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{page}</MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  calls = []
  predictionStatus = 200
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, init })
      const url = new URL(path, 'http://localhost')
      let body: unknown = {}
      let status = 200
      switch (url.pathname) {
        case '/api/olap/filters':
          body = {
            years: [2017, 2018],
            states: ['RJ', 'SP'],
            categories: ['health_beauty', 'toys'],
          }
          break
        case '/api/olap/kpis':
          body = {
            total_revenue: 1500,
            total_orders: 20,
            total_items: 25,
            avg_review_score: null,
            on_time_rate: null,
          }
          break
        case '/api/olap/sales-trend':
          body = [{ period: '2018-Q1', revenue: 1500, orders: 20 }]
          break
        case '/api/olap/top-categories':
          body = [
            { category: 'health_beauty', revenue: 1500, total_items: 25, avg_review_score: 4 },
          ]
          break
        case '/api/olap/geo-distribution':
          body = [{ state: 'SP', revenue: 1500, orders: 20, avg_freight: 10, avg_delay_days: -2 }]
          break
        case '/api/olap/sample-queries':
          body = sampleQueries
          break
        case '/api/olap/execute-query':
          body = { columns: ['value'], data: [{ value: 4 }], row_count: 1 }
          break
        case '/api/dss/example-orders':
          body = { examples: [example], count: 1 }
          break
        case '/api/dss/predict-late-delivery':
          status = predictionStatus
          body =
            status === 422
              ? {
                  detail: [
                    { loc: ['body', 'estimated_date'], msg: 'Ngày bị từ chối bởi backend.' },
                  ],
                }
              : {
                  late_probability: 0.08,
                  risk_tier: 'high',
                  thresholds: { medium: 0.03, high: 0.07 },
                }
          break
        case '/api/dss/late-delivery-metrics':
          body = {
            validation: { roc_auc: 0.8 },
            test: { roc_auc: 0.6, pr_auc: 0.07 },
            baseline: { roc_auc: 0.68 },
            feature_importance: { promised_days: 25 },
            data_window: {
              orders: 1000,
              purchase_from: '2017-01-01',
              purchase_to: '2018-08-29',
              review_lag_days: 7,
            },
          }
          break
        case '/api/dss/sales-metrics':
          body = {
            orders: metrics,
            gmv: { ...metrics, backtest: { level_dow: { ...score, daily_wape: 0.221 } } },
          }
          break
        case '/api/dss/sales-forecast': {
          const target = url.searchParams.get('target') ?? 'orders'
          body = {
            target,
            horizon_days: 28,
            forecast: Array.from({ length: 28 }, (_, i) => ({
              date: new Date(Date.UTC(2018, 8, 4 + i)).toISOString().slice(0, 10),
              forecast: target === 'orders' ? 100 : 2000,
              lo: 80,
              hi: 2500,
              event: false,
            })),
          }
          break
        }
        default:
          status = 404
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
})

describe('Overview', () => {
  it('opens the complete geographic data table', async () => {
    mount(<Overview />)
    await screen.findByText('Health Beauty')
    await userEvent.click(screen.getByRole('button', { name: 'Xem chi tiết các bang' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('avg_delay_days')).toBeInTheDocument()
    expect(within(dialog).getByText('-2')).toBeInTheDocument()
  })
  it('sends shared filters to all four dashboard endpoints and clears them', async () => {
    mount(<Overview />)
    const year = await screen.findByRole('combobox', { name: 'Năm mua hàng' })
    await waitFor(() => expect(year).not.toBeDisabled())
    await userEvent.selectOptions(year, '2018')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Bang khách hàng' }), 'SP')
    await waitFor(() => {
      for (const endpoint of ['kpis', 'sales-trend', 'top-categories', 'geo-distribution'])
        expect(
          calls.some(
            ({ path }) =>
              path.includes(`/olap/${endpoint}?`) &&
              path.includes('year=2018') &&
              path.includes('state=SP'),
          ),
        ).toBe(true)
    })
    await userEvent.click(screen.getByRole('button', { name: /Xóa bộ lọc/ }))
    expect(year).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Bang khách hàng' })).toHaveValue('')
  })
  it('renders nullable rates as unavailable and supports category search', async () => {
    mount(<Overview />)
    await screen.findByText('Health Beauty')
    expect(screen.getAllByText('—')).toHaveLength(2)
    await userEvent.type(screen.getByPlaceholderText('Tìm ngành hàng…'), 'missing')
    expect(screen.getByText('Không tìm thấy ngành hàng')).toBeInTheDocument()
  })
})

describe('OLAP', () => {
  it('executes the chosen operation and marks results stale after an edit', async () => {
    mount(<OLAP />)
    await waitFor(() =>
      expect(screen.getByLabelText('Câu truy vấn SQL')).toHaveValue(sampleQueries['Roll-Up'].sql),
    )
    await userEvent.click(screen.getByRole('button', { name: /^Dice/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Chạy truy vấn' }))
    await screen.findByText('1 bản ghi trả về')
    expect(
      JSON.parse(calls.find(({ path }) => path.endsWith('/execute-query'))!.init!.body as string),
    ).toEqual({ query: sampleQueries.Dice.sql })
    fireEvent.change(screen.getByLabelText('Câu truy vấn SQL'), {
      target: { value: 'SELECT 5 AS value;' },
    })
    expect(screen.getByText(/SQL đã thay đổi/)).toBeInTheDocument()
  })
})

describe('Delivery Risk', () => {
  it('loads an example, sends numeric values without labels, uses server risk tiers, and clears stale results', async () => {
    mount(<DeliveryRisk />)
    const sample = screen.getByRole('combobox', { name: 'Tải đơn hàng mẫu' })
    await waitFor(() => expect(sample).not.toBeDisabled())
    await userEvent.selectOptions(sample, '1')
    await userEvent.click(screen.getByRole('button', { name: 'Dự đoán rủi ro' }))
    await screen.findByText('Rủi ro cao')
    const payload = JSON.parse(
      calls.find(({ path }) => path.endsWith('/predict-late-delivery'))!.init!.body as string,
    )
    expect(payload.n_items).toBe(2)
    expect(payload.total_freight).toBe(0)
    expect(payload).not.toHaveProperty('_actual_late')
    expect(screen.getByText('8%')).toBeInTheDocument()
    expect(screen.getByText('≥ 7%')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Mã người bán *'), 'x')
    expect(screen.queryByText('Rủi ro cao')).not.toBeInTheDocument()
  })
  it('prevents invalid delivery windows from reaching the model', async () => {
    mount(<DeliveryRisk />)
    const sample = screen.getByRole('combobox', { name: 'Tải đơn hàng mẫu' })
    await waitFor(() => expect(sample).not.toBeDisabled())
    await userEvent.selectOptions(sample, '1')
    fireEvent.change(screen.getByLabelText('Ngày hẹn giao *'), { target: { value: '2018-08-01' } })
    await userEvent.click(screen.getByRole('button', { name: 'Dự đoán rủi ro' }))
    await screen.findByText('Ngày hẹn giao phải bằng hoặc sau ngày mua.')
    expect(calls.some(({ path }) => path.endsWith('/predict-late-delivery'))).toBe(false)
  })
  it('maps HTTP 422 errors to the responsible field', async () => {
    predictionStatus = 422
    mount(<DeliveryRisk />)
    const sample = screen.getByRole('combobox', { name: 'Tải đơn hàng mẫu' })
    await waitFor(() => expect(sample).not.toBeDisabled())
    await userEvent.selectOptions(sample, '1')
    await userEvent.click(screen.getByRole('button', { name: 'Dự đoán rủi ro' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Ngày hẹn giao *')).toHaveAttribute('aria-invalid', 'true'),
    )
    expect(screen.getByText('Ngày bị từ chối bởi backend.')).toBeInTheDocument()
  })
})

describe('Sales Forecast', () => {
  it('shows the artifact dates and switches target with the correct WAPE', async () => {
    mount(<SalesForecast />)
    await screen.findByText('04/09/2018 – 01/10/2018')
    await userEvent.click(screen.getByRole('tab', { name: 'Giá trị hàng hóa (GMV)' }))
    await screen.findByText('Tổng GMV dự báo')
    expect(calls.some(({ path }) => path.endsWith('/sales-forecast?target=gmv'))).toBe(true)
    expect(screen.getAllByText('22,1%').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Khoảng dự báo 80%' }))
    expect(screen.getByRole('checkbox', { name: 'Khoảng dự báo 80%' })).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
    expect(screen.getByText('Trang 2 / 3')).toBeInTheDocument()
  })
})

describe('Workspace navigation', () => {
  it('navigates all four routes and provides help', async () => {
    mount(<AppRoutes />)
    await screen.findByRole('heading', { name: 'Tổng quan kinh doanh' })
    for (const [link, title] of [
      ['OLAP Analytics', 'Phân tích OLAP'],
      ['Delivery Risk', 'Dự đoán rủi ro giao hàng'],
      ['Sales Forecast', 'Dự báo doanh số'],
    ]) {
      await userEvent.click(screen.getByRole('link', { name: link }))
      await screen.findByRole('heading', { name: title, level: 1 })
    }
    await userEvent.click(screen.getByRole('button', { name: 'Hướng dẫn sử dụng' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Chào mừng đến Olist Insight')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('closes the mobile drawer after choosing a page', async () => {
    mount(<AppRoutes />)
    await screen.findByRole('heading', { name: 'Tổng quan kinh doanh' })
    await userEvent.click(screen.getByRole('button', { name: 'Mở điều hướng' }))
    const drawer = screen.getByRole('dialog', { name: 'Điều hướng' })
    await userEvent.click(within(drawer).getByRole('link', { name: 'Delivery Risk' }))
    await screen.findByRole('heading', { name: 'Dự đoán rủi ro giao hàng', level: 1 })
    expect(screen.queryByRole('dialog', { name: 'Điều hướng' })).not.toBeInTheDocument()
  })
  it('handles unknown routes with a working return link', async () => {
    mount(<AppRoutes />, '/missing-page')
    await userEvent.click(await screen.findByRole('link', { name: 'Về trang tổng quan' }))
    await screen.findByRole('heading', { name: 'Tổng quan kinh doanh', level: 1 })
  })
})
