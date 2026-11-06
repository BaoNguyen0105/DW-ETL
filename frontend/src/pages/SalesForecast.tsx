import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowDownToLine,
  CalendarDays,
  Check,
  Info,
  Target,
  TrendingUp,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QueryState } from '@/components/ui/async-state'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/layout/PageHeader'
import { ForecastChart } from '@/components/charts/ForecastChart'
import { dss } from '@/services/dss'
import { dateLabel, downloadCsv, money, number, percent } from '@/lib/format'
import type { ForecastTarget } from '@/types/api'

export default function SalesForecast() {
  const [target, setTarget] = useState<ForecastTarget>('orders')
  const [showInterval, setShowInterval] = useState(true)
  const forecast = useQuery({
    queryKey: ['dss', 'forecast', target],
    queryFn: ({ signal }) => dss.forecast(target, signal),
  })
  const metrics = useQuery({
    queryKey: ['dss', 'salesMetrics'],
    queryFn: ({ signal }) => dss.salesMetrics(signal),
  })
  const points = forecast.data?.forecast ?? []
  const current = metrics.data?.[target]
  const selected = current?.backtest?.[current.chosen]
  const total = points.reduce((sum, point) => sum + point.forecast, 0)
  const range = points.length
    ? `${dateLabel(points[0].date)} – ${dateLabel(points.at(-1)!.date)}`
    : 'Đang tải kỳ dự báo'
  const cutoff = points.length
    ? new Date(new Date(`${points[0].date}T00:00:00Z`).getTime() - 86_400_000)
        .toISOString()
        .slice(0, 10)
    : null
  const titles: Record<string, string> = {
    level_dow: 'Level + Day of Week',
    seasonal_naive: 'Seasonal Naive',
    lgbm_ratio: 'LightGBM Ratio',
  }
  return (
    <div className="page-stack">
      <PageHeader
        title="Dự báo doanh số"
        description="Từ xu hướng lịch sử đến kế hoạch bán hàng cho 28 ngày tiếp theo của bộ dữ liệu."
        actions={
          <Button
            size="sm"
            disabled={!points.length || !!forecast.error}
            onClick={() =>
              downloadCsv(
                `olist-forecast-${target}`,
                ['date', 'forecast', 'lo', 'hi', 'event'],
                points,
              )
            }
          >
            <ArrowDownToLine />
            Xuất dự báo
          </Button>
        }
      />
      <div className="forecast-toolbar">
        <Tabs value={target} onValueChange={(v) => setTarget(v as ForecastTarget)}>
          <TabsList>
            <TabsTrigger value="orders">Số đơn hàng</TabsTrigger>
            <TabsTrigger value="gmv">Giá trị hàng hóa (GMV)</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="date-range">
          <CalendarDays size={15} />
          {range}
        </span>
      </div>
      <QueryState query={forecast} empty={!points.length}>
        <div className="kpi-grid forecast-kpis">
          {[
            {
              label: target === 'orders' ? 'Tổng số đơn dự báo' : 'Tổng GMV dự báo',
              value: target === 'orders' ? number(total, 1) : money(total),
              note: `Trong ${forecast.data?.horizon_days ?? 28} ngày`,
              icon: TrendingUp,
              tone: 'purple',
            },
            {
              label: 'Trung bình mỗi ngày',
              value:
                target === 'orders'
                  ? number(total / (points.length || 1), 1)
                  : money(total / (points.length || 1)),
              note: target === 'orders' ? 'Đơn hàng / ngày' : 'Giá trị hàng hóa / ngày',
              icon: Activity,
              tone: 'blue',
            },
            {
              label: 'Khoảng dự báo',
              value: '80%',
              note: 'Từ phân vị sai số backtest',
              icon: Target,
              tone: 'green',
            },
            {
              label: 'Ngày có sự kiện',
              value: String(points.filter((point) => point.event).length),
              note: 'Trong cửa sổ Black Friday',
              icon: CalendarDays,
              tone: 'orange',
            },
          ].map(({ label, value, note, icon: Icon, tone }) => (
            <Card className="kpi-card" key={label}>
              <div className="kpi-top">
                <span className={`metric-icon ${tone}`}>
                  <Icon size={18} />
                </span>
              </div>
              <p className="kpi-label">{label}</p>
              <div className="kpi-value">{value}</div>
              <p className="kpi-note">{note}</p>
            </Card>
          ))}
        </div>
        <Card className="panel">
          <div className="panel-heading">
            <div>
              <h2>{target === 'orders' ? 'Xu hướng số đơn hàng' : 'Xu hướng giá trị hàng hóa'}</h2>
              <p>
                Dự báo theo ngày ·{' '}
                {target === 'gmv'
                  ? 'BRL, không gồm phí vận chuyển'
                  : 'Số đơn kỳ vọng, có thể là số thập phân'}
              </p>
            </div>
            <label className="interval-toggle">
              <input
                type="checkbox"
                checked={showInterval}
                onChange={(e) => setShowInterval(e.target.checked)}
              />
              Khoảng dự báo 80%
            </label>
          </div>
          <ForecastChart data={points} target={target} showInterval={showInterval} />
          <div className="forecast-legend">
            <span>
              <i className="legend-line" />
              Giá trị dự báo
            </span>
            {showInterval && (
              <span>
                <i className="legend-area" />
                Khoảng dự báo 80%
              </span>
            )}
            <span>
              <i className="legend-dot bg-amber-400" />
              Sự kiện
            </span>
          </div>
          <div className="model-footnote">
            <Info size={16} />
            <p>
              Dự báo trên dữ liệu lịch sử{cutoff ? ` đến ${dateLabel(cutoff)}` : ''}. Khoảng dự báo
              áp dụng cho từng ngày; không thể cộng các cận để suy ra khoảng dự báo của tổng 28
              ngày.
            </p>
          </div>
        </Card>
      </QueryState>
      <Card className="panel">
        <div className="panel-heading">
          <div>
            <h2>Hiệu quả mô hình</h2>
            <p>So sánh các ứng viên qua backtest theo thời gian</p>
          </div>
          {current && (
            <span className="soft-badge">
              <Check size={13} />
              {titles[current.chosen] ?? current.chosen}
            </span>
          )}
        </div>
        <QueryState query={metrics} empty={!current || !selected}>
          <div className="model-metrics">
            <div>
              <span>Daily WAPE</span>
              <strong>{percent(selected ? selected.daily_wape * 100 : null)}</strong>
              <small>Sai số theo ngày</small>
            </div>
            <div>
              <span>Weekly WAPE</span>
              <strong>{percent(selected ? selected.weekly_wape * 100 : null)}</strong>
              <small>Sai số theo tuần</small>
            </div>
            <div>
              <span>Bias</span>
              <strong>{percent(selected?.bias_pct)}</strong>
              <small>Độ lệch dự báo</small>
            </div>
            <div>
              <span>Backtest folds</span>
              <strong>{number(selected?.n_folds)}</strong>
              <small>Số lần đánh giá</small>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mô hình</th>
                  <th>Daily WAPE</th>
                  <th>Weekly WAPE</th>
                  <th>Bias</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(current?.backtest ?? {}).map(([name, score]) => (
                  <tr key={name} className={name === current?.chosen ? 'chosen-model' : ''}>
                    <td className="font-medium">{titles[name] ?? name}</td>
                    <td>{percent(score.daily_wape * 100)}</td>
                    <td>{percent(score.weekly_wape * 100)}</td>
                    <td>{percent(score.bias_pct)}</td>
                    <td>
                      {name === current?.chosen ? (
                        <span className="soft-badge">
                          <Check size={12} />
                          Được chọn
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Ứng viên</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="model-footnote">
            <Info size={16} />
            <p>
              WAPE càng thấp càng tốt; đây là sai số, không phải accuracy. Khoảng 80% được ước lượng
              từ residual ratio trong backtest, chưa xác nhận coverage trên tập giữ riêng. GMV loại
              đơn canceled/unavailable và không gồm phí vận chuyển.
            </p>
          </div>
        </QueryState>
      </Card>
      <Card className="panel">
        <div className="panel-heading">
          <div>
            <h2>Chi tiết từng ngày</h2>
            <p>Giá trị dự báo, cận dưới, cận trên và ngày sự kiện</p>
          </div>
          <span className="soft-badge">{points.length} ngày</span>
        </div>
        <QueryState query={forecast} empty={!points.length}>
          <DataTable
            key={target}
            columns={['date', 'forecast', 'lo', 'hi', 'event']}
            rows={points.map((point) => ({ ...point }))}
            filename={`olist-forecast-${target}`}
          />
        </QueryState>
      </Card>
    </div>
  )
}
