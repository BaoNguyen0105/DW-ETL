import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ArrowUpRight } from 'lucide-react'
import { money, number, percent, stateNames } from '@/lib/format'
import type { GeoSales } from '@/types/api'

const colors = ['#6358e8', '#a69bf5', '#f6b84e', '#fc8d69', '#e5e3ee']
export function GeoChart({
  data,
  onSelect,
}: {
  data: GeoSales[]
  onSelect: (state: string) => void
}) {
  const total = data.reduce((sum, point) => sum + point.revenue, 0)
  const slices = [
    ...data
      .slice(0, 4)
      .map((point) => ({ name: point.state ?? 'Không xác định', value: point.revenue })),
    ...(data.length > 4
      ? [
          {
            name: 'Các bang khác',
            value: data.slice(4).reduce((sum, point) => sum + point.revenue, 0),
          },
        ]
      : []),
  ]
  return (
    <>
      <div className="geo-donut">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="67%"
              outerRadius="93%"
              paddingAngle={3}
              cornerRadius={5}
              stroke="none"
            >
              {slices.map((slice, i) => (
                <Cell key={slice.name} fill={colors[i]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => money(Number(value))}
              contentStyle={{ borderRadius: 10, borderColor: '#ecebf2', fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <span>Phủ sóng</span>
          <strong>{number(data.filter((point) => point.state).length)}</strong>
          <span>bang Brazil</span>
        </div>
      </div>
      <div className="geo-legend">
        {slices.map((slice, i) => (
          <div key={slice.name}>
            <span className="legend-name">
              <i style={{ background: colors[i] }} />
              {slice.name in stateNames ? stateNames[slice.name] : slice.name}
            </span>
            <strong>{percent(total ? (slice.value / total) * 100 : 0)}</strong>
          </div>
        ))}
      </div>
      {data[0]?.state && (
        <button className="geo-highlight" onClick={() => onSelect(data[0].state!)}>
          <span>
            <span className="text-muted-foreground">Thị trường dẫn đầu</span>
            <strong>{stateNames[data[0].state] ?? data[0].state}</strong>
          </span>
          <ArrowUpRight size={17} />
        </button>
      )}
    </>
  )
}
