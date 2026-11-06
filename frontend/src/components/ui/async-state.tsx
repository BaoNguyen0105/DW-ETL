import type { ReactNode } from 'react'
import { AlertCircle, BarChart3, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function LoadingState({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return (
    <div className="async-state" role="status">
      <LoaderCircle className="size-6 animate-spin text-primary" />
      <p>{label}</p>
    </div>
  )
}
export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="async-state error-state" role="alert">
      <AlertCircle className="size-6" />
      <p className="font-medium">Chưa thể tải dữ liệu</p>
      <p className="max-w-lg text-xs leading-6">{error.message}</p>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          Thử lại
        </Button>
      )}
    </div>
  )
}
export function EmptyState({
  title = 'Không có dữ liệu phù hợp',
  description = 'Thử thay đổi hoặc xóa bộ lọc để xem thêm dữ liệu.',
  children,
}: {
  title?: string
  description?: string
  children?: ReactNode
}) {
  return (
    <div className="async-state">
      <BarChart3 className="size-8 text-muted-foreground/50" />
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-xs">{description}</p>
      {children}
    </div>
  )
}
export function QueryState({
  query,
  empty,
  children,
}: {
  query: { isPending: boolean; error: Error | null; refetch: () => unknown }
  empty?: boolean
  children: ReactNode
}) {
  if (query.isPending) return <LoadingState />
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  if (empty) return <EmptyState />
  return children
}
