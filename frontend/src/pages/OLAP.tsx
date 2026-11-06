import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Braces,
  Check,
  Code2,
  Filter,
  Layers3,
  Play,
  RotateCcw,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QueryState, ErrorState, LoadingState } from '@/components/ui/async-state'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/layout/PageHeader'
import { FilterBar } from '@/components/layout/FilterBar'
import { RevenueChart } from '@/components/charts/RevenueChart'
import { useFilters, useTrend } from '@/hooks/use-dashboard'
import { olap } from '@/services/olap'
import { money, number } from '@/lib/format'
import type { Granularity } from '@/types/api'

const operations = [
  {
    name: 'Roll-Up',
    icon: ArrowUpWideNarrow,
    label: 'Tổng hợp dữ liệu',
    description: 'Từ sản phẩm đến doanh thu từng năm.',
  },
  {
    name: 'Drill-Down',
    icon: ArrowDownWideNarrow,
    label: 'Đi sâu chi tiết',
    description: 'Doanh thu từng tháng trong năm 2017.',
  },
  {
    name: 'Slice',
    icon: Filter,
    label: 'Lọc một chiều',
    description: 'Khám phá thị trường São Paulo.',
  },
  {
    name: 'Dice',
    icon: Layers3,
    label: 'Lọc nhiều chiều',
    description: 'Health & Beauty · Rio de Janeiro · 2018.',
  },
]
export default function OLAP() {
  const { filters } = useFilters()
  const [granularity, setGranularity] = useState<Granularity>('year')
  const trend = useTrend(filters, granularity)
  const templates = useQuery({
    queryKey: ['olap', 'templates'],
    queryFn: ({ signal }) => olap.templates(signal),
  })
  const [operation, setOperation] = useState('Roll-Up')
  const [customSql, setCustomSql] = useState<string | null>(null)
  const [view, setView] = useState('chart')
  const sql = customSql ?? templates.data?.[operation]?.sql ?? ''
  const execution = useMutation({ mutationFn: olap.execute })
  const [submittedSql, setSubmittedSql] = useState('')
  const stale = execution.data && submittedSql !== sql
  function selectOperation(name: string) {
    setOperation(name)
    setCustomSql(null)
    execution.reset()
    setSubmittedSql('')
  }
  function runQuery() {
    setSubmittedSql(sql)
    execution.mutate(sql)
  }
  return (
    <div className="page-stack">
      <PageHeader
        title="Phân tích OLAP"
        description="Khám phá dữ liệu theo nhiều chiều. Từ bức tranh lớn đến từng chi tiết."
      />
      <FilterBar />
      <Card className="panel">
        <div className="panel-heading">
          <div>
            <h2>Phân tích theo thời gian</h2>
            <p>Bộ lọc phía trên áp dụng cho biểu đồ và bảng này.</p>
          </div>
          <Tabs value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
            <TabsList>
              <TabsTrigger value="year">Năm</TabsTrigger>
              <TabsTrigger value="quarter">Quý</TabsTrigger>
              <TabsTrigger value="month">Tháng</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="olap-summary">
          <div>
            <span>Doanh thu trong phạm vi chọn</span>
            <strong>{money(trend.data?.reduce((sum, point) => sum + point.revenue, 0))}</strong>
          </div>
          <div className="olap-breadcrumb">
            <span className={granularity === 'year' ? 'selected' : ''}>Năm</span>
            <span>→</span>
            <span className={granularity === 'quarter' ? 'selected' : ''}>Quý</span>
            <span>→</span>
            <span className={granularity === 'month' ? 'selected' : ''}>Tháng</span>
          </div>
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="chart">Biểu đồ</TabsTrigger>
              <TabsTrigger value="table">Bảng dữ liệu</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <QueryState query={trend} empty={!trend.data?.length}>
          {view === 'chart' ? (
            <RevenueChart data={trend.data ?? []} />
          ) : (
            <DataTable
              columns={['period', 'revenue', 'orders']}
              rows={(trend.data ?? []).map((row) => ({ ...row }))}
              filename="olist-time-analysis"
            />
          )}
        </QueryState>
      </Card>
      <div className="section-title">
        <div>
          <h2>Bốn thao tác OLAP cơ bản</h2>
        </div>
      </div>
      <div className="operation-grid">
        {operations.map(({ name, icon: Icon, label, description }) => (
          <button
            key={name}
            aria-pressed={operation === name}
            className={`operation-card ${operation === name ? 'selected' : ''}`}
            onClick={() => selectOperation(name)}
            disabled={execution.isPending}
          >
            <span className="operation-icon">
              <Icon size={20} />
            </span>
            <span className="operation-name">
              {name}
              {operation === name && <Check size={15} />}
            </span>
            <strong>{label}</strong>
            <p>{description}</p>
          </button>
        ))}
      </div>
      <Card className="panel query-panel">
        <div className="panel-heading">
          <div>
            <h2 className="flex items-center gap-2">
              <Code2 size={18} />
              SQL workspace
            </h2>
            <p>Truy vấn mẫu có điều kiện riêng; bộ lọc biểu đồ không thay đổi câu SQL.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!templates.data || execution.isPending}
            onClick={() => {
              setCustomSql(null)
              execution.reset()
            }}
          >
            <RotateCcw />
            Khôi phục mẫu
          </Button>
        </div>
        <QueryState query={templates}>
          <label className="sr-only" htmlFor="sql-editor">
            Câu truy vấn SQL
          </label>
          <div className="editor-toolbar">
            <span className="flex items-center gap-2">
              <span className="status-dot" />
              {operation.toLowerCase()}.sql
            </span>
            <span>DuckDB SQL</span>
          </div>
          <textarea
            id="sql-editor"
            className="sql-editor"
            value={sql}
            spellCheck={false}
            onChange={(e) => setCustomSql(e.target.value)}
            onKeyDown={(e) => {
              if (
                (e.ctrlKey || e.metaKey) &&
                e.key === 'Enter' &&
                sql.trim() &&
                !execution.isPending
              ) {
                e.preventDefault()
                runQuery()
              }
            }}
          />
          <div className="editor-footer">
            <span>Ctrl / ⌘ + Enter để chạy · Dùng truy vấn SELECT</span>
            <Button disabled={!sql.trim() || execution.isPending} onClick={runQuery}>
              <Play size={14} />
              {execution.isPending ? 'Đang truy vấn…' : 'Chạy truy vấn'}
            </Button>
          </div>
        </QueryState>
        {execution.isPending ? (
          <LoadingState label="Đang thực thi truy vấn…" />
        ) : execution.error ? (
          <ErrorState error={execution.error} retry={runQuery} />
        ) : execution.data ? (
          <div className="query-results">
            <div className="result-heading">
              <strong>Kết quả truy vấn</strong>
              <span className={stale ? 'text-amber-700' : 'text-emerald-700'}>
                {stale
                  ? 'SQL đã thay đổi · Chạy lại để cập nhật'
                  : `${number(execution.data.row_count)} bản ghi trả về`}
              </span>
            </div>
            <DataTable
              key={submittedSql}
              columns={execution.data.columns}
              rows={execution.data.data}
              filename={`olist-${operation.toLowerCase()}`}
            />
          </div>
        ) : (
          <div className="query-placeholder">
            <Braces size={24} />
            <p>Chọn thao tác và chạy truy vấn để khám phá dữ liệu.</p>
          </div>
        )}
      </Card>
    </div>
  )
}
