import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { compact, dateLabel, money, number, shortDate } from '@/lib/format'
import type { ForecastPoint, ForecastTarget } from '@/types/api'

export function ForecastChart({
  data,
  target,
  showInterval,
}: {
  data: ForecastPoint[]
  target: ForecastTarget
  showInterval: boolean
}) {
  const points = data.map((point) => ({ ...point, interval: [point.lo, point.hi] }))
  const format = target === 'gmv' ? money : (value: number) => number(value, 1)
  return (
    <div
      className="forecast-chart"
      role="img"
      aria-label={`Dự báo ${data.length} ngày${showInterval ? ', có khoảng dự báo 80%' : ''}. Bảng số liệu chi tiết ở bên dưới.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 15, right: 12, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="forecast-band" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8174ed" stopOpacity={0.24} />
              <stop offset="100%" stopColor="#8174ed" stopOpacity={0.08} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 5" stroke="#ececf1" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#858591', fontSize: 11 }}
            tickMargin={12}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={compact}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#858591', fontSize: 11 }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const point = payload[0].payload as ForecastPoint
              return (
                <div className="chart-tooltip">
                  <strong>{dateLabel(point.date)}</strong>
                  <span>
                    Dự báo <b>{format(point.forecast)}</b>
                  </span>
                  <span>
                    Cận dưới <b>{format(point.lo)}</b>
                  </span>
                  <span>
                    Cận trên <b>{format(point.hi)}</b>
                  </span>
                  {point.event && <span>Ngày trong cửa sổ sự kiện</span>}
                </div>
              )
            }}
          />
          {showInterval && (
            <Area
              dataKey="interval"
              type="monotone"
              fill="url(#forecast-band)"
              stroke="none"
              name="Khoảng dự báo 80%"
            />
          )}
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#7161e8"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: '#7161e8', stroke: '#fff', strokeWidth: 3 }}
          />
          {points
            .filter((point) => point.event)
            .map((point) => (
              <ReferenceDot
                key={point.date}
                x={point.date}
                y={point.forecast}
                r={4}
                fill="#f5b747"
                stroke="#fff"
              />
            ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
