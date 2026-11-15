import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { compact, money, number } from '@/lib/format'
import type { SalesPoint } from '@/types/api'

export function RevenueChart({ data }: { data: SalesPoint[] }) {
  const maximum = Math.max(...data.map((point) => point.revenue))
  return (
    <div
      className="chart-container"
      role="img"
      aria-label={`Doanh thu theo thời gian, ${data.length} kỳ. Có thể xem số liệu trong bảng hoặc xuất CSV.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 12, right: 8, left: -18, bottom: 0 }}
          barCategoryGap="28%"
        >
          <defs>
            <linearGradient id="revenue-bar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6860ed" />
              <stop offset="100%" stopColor="#b5afff" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 5" stroke="#ececf1" />
          <XAxis
            dataKey="period"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#858591', fontSize: 10 }}
            tickMargin={12}
            minTickGap={15}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickFormatter={compact}
            tick={{ fill: '#858591', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: '#f5f4ff', radius: 6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const point = payload[0].payload as SalesPoint
              return (
                <div className="chart-tooltip">
                  <strong>{point.period}</strong>
                  <span>
                    Doanh thu <b>{money(point.revenue)}</b>
                  </span>
                  <span>
                    Đơn hàng <b>{number(point.orders)}</b>
                  </span>
                </div>
              )
            }}
          />
          <Bar dataKey="revenue" radius={[5, 5, 0, 0]} maxBarSize={54}>
            {data.map((point) => (
              <Cell
                key={point.period}
                fill={point.revenue === maximum ? 'url(#revenue-bar)' : '#e1e0e9'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
