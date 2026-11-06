import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Info,
  Package,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QueryState, EmptyState } from '@/components/ui/async-state'
import { SelectField } from '@/components/ui/select-field'
import { DataTable } from '@/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { FilterBar } from '@/components/layout/FilterBar'
import { RevenueChart } from '@/components/charts/RevenueChart'
import { GeoChart } from '@/components/charts/GeoChart'
import { useFilters, useKpis, useTrend } from '@/hooks/use-dashboard'
import { olap } from '@/services/olap'
import { categoryName, downloadCsv, money, number, percent } from '@/lib/format'
import type { Granularity } from '@/types/api'

export default function Overview() {
  const location = useLocation()
  const { filters, setFilter } = useFilters()
  const [granularity, setGranularity] = useState<Granularity>('quarter')
  const [rankBy, setRankBy] = useState<'revenue' | 'volume'>('revenue')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const kpis = useKpis(filters)
  const trend = useTrend(filters, granularity)
  const categories = useQuery({
    queryKey: ['olap', 'categories', filters, rankBy],
    queryFn: ({ signal }) => olap.categories(filters, rankBy, signal),
  })
  const geo = useQuery({
    queryKey: ['olap', 'geo', filters],
    queryFn: ({ signal }) => olap.geo(filters, signal),
  })
  const cards = [
    {
      label: 'Tổng doanh thu',
      value: money(kpis.data?.total_revenue),
      note: 'Giá sản phẩm + phí vận chuyển',
      icon: Banknote,
      tone: 'purple',
    },
    {
      label: 'Tổng đơn hàng',
      value: number(kpis.data?.total_orders),
      note: `${number(kpis.data?.total_items)} sản phẩm được đặt`,
      icon: ShoppingBag,
      tone: 'blue',
    },
    {
      label: 'Giao hàng đúng hạn',
      value: percent(kpis.data?.on_time_rate, 2),
      note: 'Tỷ lệ theo từng sản phẩm',
      icon: Truck,
      tone: 'green',
    },
    {
      label: 'Đánh giá trung bình',
      value: number(kpis.data?.avg_review_score, 2),
      note: 'Điểm đánh giá trên thang 5',
      icon: Star,
      tone: 'orange',
    },
  ]
  const filtered = (categories.data ?? []).filter((row) =>
    categoryName(row.category).toLowerCase().includes(search.toLowerCase()),
  )
  const lastPage = Math.max(0, Math.ceil(filtered.length / 6) - 1)
  const currentPage = Math.min(page, lastPage)
  return (
    <div className="page-stack">
      <PageHeader
        title="Tổng quan kinh doanh"
        description="Một góc nhìn toàn diện về hoạt động thương mại điện tử Olist."
        actions={
          <Button
            size="sm"
            disabled={!kpis.data || !!kpis.error}
            onClick={() => downloadCsv('olist-overview', Object.keys(kpis.data!), [kpis.data!])}
          >
            <ArrowDownToLine />
            Xuất báo cáo
          </Button>
        }
      />
      <FilterBar />
      <QueryState query={kpis}>
        <div className="kpi-grid">
          {cards.map(({ label, value, note, icon: Icon, tone }) => (
            <Card className="kpi-card" key={label}>
              <div className="kpi-top">
                <span className={`metric-icon ${tone}`}>
                  <Icon size={18} />
                </span>
              </div>
              <p className="kpi-label">{label}</p>
              <div className="kpi-value">
                {value}
                {label === 'Đánh giá trung bình' && kpis.data?.avg_review_score != null && (
                  <span className="kpi-suffix">/ 5</span>
                )}
              </div>
              <p className="kpi-note">{note}</p>
            </Card>
          ))}
        </div>
      </QueryState>
      <div className="overview-charts">
        <Card className="panel revenue-panel">
          <div className="panel-heading">
            <div>
              <h2>Xu hướng doanh thu</h2>
              <p>Revenue trend · BRL</p>
            </div>
            <Tabs
              value={granularity}
              onValueChange={(value) => setGranularity(value as Granularity)}
            >
              <TabsList>
                <TabsTrigger value="month">Tháng</TabsTrigger>
                <TabsTrigger value="quarter">Quý</TabsTrigger>
                <TabsTrigger value="year">Năm</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <QueryState query={trend} empty={trend.data?.length === 0}>
            <div className="revenue-summary">
              <strong>{money(trend.data?.reduce((sum, point) => sum + point.revenue, 0))}</strong>
              <span className="soft-badge">
                <span className="status-dot" />
                {trend.data?.length ?? 0} kỳ dữ liệu
              </span>
            </div>
            <p className="chart-subtitle">Tổng giá trị giao dịch trong phạm vi đã chọn</p>
            <RevenueChart data={trend.data ?? []} />
            <div className="chart-footer">
              <span>
                <i className="legend-dot purple-bg" />
                Kỳ có doanh thu cao nhất
              </span>
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/olap${location.search}`}>
                  Phân tích chi tiết
                  <ArrowUpRight />
                </Link>
              </Button>
            </div>
          </QueryState>
        </Card>
        <Card className="panel geo-panel">
          <div className="panel-heading">
            <div>
              <h2>Phân bố địa lý</h2>
              <p>Tỷ trọng doanh thu theo bang</p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Xem chi tiết các bang">
                  <Globe2 size={18} />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Phân bố theo bang khách hàng</DialogTitle>
                  <DialogDescription>
                    Tiền tệ BRL. avg_delay_days âm nghĩa là giao sớm hơn ngày hẹn. Dữ liệu theo bộ
                    lọc hiện tại.
                  </DialogDescription>
                </DialogHeader>
                <QueryState query={geo} empty={!geo.data?.length}>
                  <DataTable
                    columns={['state', 'revenue', 'orders', 'avg_freight', 'avg_delay_days']}
                    rows={(geo.data ?? []).map((row) => ({ ...row }))}
                    filename="olist-geographic-distribution"
                  />
                </QueryState>
              </DialogContent>
            </Dialog>
          </div>
          <QueryState
            query={geo}
            empty={!geo.data?.length || !geo.data.some((row) => row.revenue > 0)}
          >
            <GeoChart data={geo.data ?? []} onSelect={(state) => setFilter('state', state)} />
          </QueryState>
        </Card>
      </div>
      <Card className="panel categories-panel">
        <div className="panel-heading">
          <div>
            <h2>Ngành hàng nổi bật</h2>
            <p>Xếp hạng theo doanh thu hoặc sản lượng</p>
          </div>
          <div className="table-controls">
            <div className="search-input">
              <Search size={15} />
              <Input
                aria-label="Tìm ngành hàng"
                placeholder="Tìm ngành hàng…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(0)
                }}
              />
            </div>
            <SelectField
              aria-label="Xếp hạng theo"
              value={rankBy}
              onChange={(e) => {
                setRankBy(e.target.value as 'revenue' | 'volume')
                setPage(0)
              }}
            >
              <option value="revenue">Theo doanh thu</option>
              <option value="volume">Theo sản lượng</option>
            </SelectField>
            <Button
              variant="outline"
              size="icon"
              aria-label="Xuất ngành hàng CSV"
              disabled={!filtered.length || !!categories.error}
              onClick={() =>
                downloadCsv(
                  'olist-categories',
                  ['category', 'revenue', 'total_items', 'avg_review_score'],
                  filtered,
                )
              }
            >
              <ArrowDownToLine />
            </Button>
          </div>
        </div>
        <QueryState query={categories} empty={!categories.data?.length}>
          {filtered.length === 0 ? (
            <EmptyState title="Không tìm thấy ngành hàng" description="Thử một từ khóa khác." />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data-table category-table">
                  <thead>
                    <tr>
                      <th className="w-12">#</th>
                      <th>Ngành hàng</th>
                      <th>Doanh thu</th>
                      <th>Sản phẩm</th>
                      <th>Đánh giá</th>
                      <th>Tỷ trọng doanh thu</th>
                      <th>
                        <span className="sr-only">Xem chi tiết</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(currentPage * 6, (currentPage + 1) * 6).map((row, index) => (
                      <tr key={row.category}>
                        <td className="text-muted-foreground">
                          {String(currentPage * 6 + index + 1).padStart(2, '0')}
                        </td>
                        <td>
                          <button
                            className="category-cell"
                            onClick={() => setFilter('category', row.category)}
                          >
                            <span className={`category-icon tone-${index % 4}`}>
                              <Package size={18} />
                            </span>
                            <span>{categoryName(row.category)}</span>
                          </button>
                        </td>
                        <td className="font-semibold">{money(row.revenue)}</td>
                        <td>{number(row.total_items)}</td>
                        <td>
                          <span className="rating">
                            <Star size={12} />
                            {number(row.avg_review_score, 2)}
                          </span>
                        </td>
                        <td>
                          <span className="share-cell">
                            <span className="share-track">
                              <i
                                style={{
                                  width: `${Math.min(100, kpis.data?.total_revenue ? (row.revenue / kpis.data.total_revenue) * 100 : 0)}%`,
                                }}
                              />
                            </span>
                            {percent(
                              kpis.data?.total_revenue
                                ? (row.revenue / kpis.data.total_revenue) * 100
                                : 0,
                            )}
                          </span>
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Lọc ${categoryName(row.category)}`}
                            onClick={() => setFilter('category', row.category)}
                          >
                            <ArrowUpRight />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-pagination">
                <span>
                  {filtered.length} ngành hàng trong top {categories.data?.length} · Trang{' '}
                  {currentPage + 1}/{lastPage + 1}
                </span>
                <div>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Ngành hàng trang trước"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Ngành hàng trang sau"
                    disabled={currentPage >= lastPage}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </>
          )}
        </QueryState>
      </Card>
      <div className="insight-banner">
        <span className="banner-symbol">
          <Sparkles size={24} />
        </span>
        <div>
          <strong>Dự đoán rủi ro giao hàng</strong>
          <p>Đánh giá từng đơn hàng và xem gợi ý xử lý.</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/delivery-risk">
            Khám phá DSS
            <ArrowRight />
          </Link>
        </Button>
      </div>
      <p className="data-note">
        <Info size={14} />
        Doanh thu gồm giá sản phẩm và phí vận chuyển, trên mọi trạng thái đơn. Đánh giá và tỷ lệ
        đúng hạn được tính theo sản phẩm.
      </p>
    </div>
  )
}
