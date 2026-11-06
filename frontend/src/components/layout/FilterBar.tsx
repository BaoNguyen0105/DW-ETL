import { SlidersHorizontal, X } from 'lucide-react'
import { useFilterOptions, useFilters } from '@/hooks/use-dashboard'
import { SelectField } from '@/components/ui/select-field'
import { Button } from '@/components/ui/button'
import { categoryName, stateNames } from '@/lib/format'

export function FilterBar() {
  const { filters, setFilter, reset } = useFilters()
  const options = useFilterOptions()
  const count = Object.values(filters).filter(Boolean).length
  return (
    <div className="filter-bar">
      <span className="filter-label">
        <SlidersHorizontal className="size-4" />
        Bộ lọc
      </span>
      <SelectField
        aria-label="Năm mua hàng"
        value={filters.year ?? ''}
        onChange={(e) => setFilter('year', e.target.value)}
        disabled={!options.data}
      >
        <option value="">Tất cả năm</option>
        {options.data?.years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </SelectField>
      <SelectField
        aria-label="Bang khách hàng"
        value={filters.state ?? ''}
        onChange={(e) => setFilter('state', e.target.value)}
        disabled={!options.data}
      >
        <option value="">Tất cả bang</option>
        {options.data?.states.map((state) => (
          <option key={state} value={state}>
            {state} · {stateNames[state] ?? state}
          </option>
        ))}
      </SelectField>
      <SelectField
        className="category-filter"
        aria-label="Ngành hàng"
        value={filters.category ?? ''}
        onChange={(e) => setFilter('category', e.target.value)}
        disabled={!options.data}
      >
        <option value="">Tất cả ngành hàng</option>
        {options.data?.categories.map((category) => (
          <option key={category} value={category}>
            {categoryName(category)}
          </option>
        ))}
      </SelectField>
      {count > 0 ? (
        <Button variant="ghost" size="sm" onClick={reset}>
          <X />
          Xóa bộ lọc ({count})
        </Button>
      ) : (
        <span className="filter-note">Toàn bộ dữ liệu lịch sử</span>
      )}
      {options.error && (
        <button
          className="text-xs text-destructive underline"
          onClick={() => void options.refetch()}
        >
          Lỗi tải bộ lọc · Thử lại
        </button>
      )}
    </div>
  )
}
