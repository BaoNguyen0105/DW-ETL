import type { ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SelectField({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('select-wrap', className)}>
      <select {...props}>{children}</select>
      <ChevronDown aria-hidden="true" className="size-3.5" />
    </div>
  )
}
