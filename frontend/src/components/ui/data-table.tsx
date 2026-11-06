import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/async-state'
import { downloadCsv, number } from '@/lib/format'

export function DataTable({
  columns,
  rows,
  filename = 'olist-data',
}: {
  columns: string[]
  rows: Record<string, unknown>[]
  filename?: string
}) {
  const [page, setPage] = useState(0)
  const lastPage = Math.max(0, Math.ceil(rows.length / 10) - 1)
  const currentPage = Math.min(page, lastPage)
  if (!rows.length)
    return (
      <EmptyState
        title="Truy vấn không trả về bản ghi"
        description="Điều chỉnh điều kiện truy vấn và chạy lại."
      />
    )
  return (
    <>
      <div className="table-toolbar">
        <span>{number(rows.length)} bản ghi</span>
        <Button variant="outline" size="sm" onClick={() => downloadCsv(filename, columns, rows)}>
          <Download />
          Xuất CSV
        </Button>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(currentPage * 10, (currentPage + 1) * 10).map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column}>
                    {row[column] == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : typeof row[column] === 'number' ? (
                      number(row[column], 2)
                    ) : typeof row[column] === 'object' ? (
                      JSON.stringify(row[column])
                    ) : (
                      String(row[column])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-pagination">
        <span>
          Trang {currentPage + 1} / {lastPage + 1}
        </span>
        <div>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Trang trước"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Trang sau"
            disabled={currentPage === lastPage}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </>
  )
}
