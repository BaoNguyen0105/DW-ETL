import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions?: ReactNode
}) {
  const client = useQueryClient()
  const fetching = useIsFetching()
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">
        <Button
          variant="outline"
          size="sm"
          disabled={fetching > 0}
          onClick={() => void client.invalidateQueries()}
        >
          <RefreshCw className={fetching ? 'animate-spin' : ''} />
          Làm mới
        </Button>
        {actions}
      </div>
    </header>
  )
}
