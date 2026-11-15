import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { olap } from '@/services/olap'
import type { Filters, Granularity } from '@/types/api'

export function useFilters() {
  const [params, setParams] = useSearchParams()
  const year = Number(params.get('year'))
  const filters: Filters = {
    year: Number.isInteger(year) && year > 0 && year <= 9999 ? year : undefined,
    state: params.get('state') || undefined,
    category: params.get('category') || undefined,
  }
  function setFilter(name: keyof Filters, value: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value) next.set(name, value)
      else next.delete(name)
      return next
    })
  }
  function reset() {
    setParams({})
  }
  return { filters, setFilter, reset }
}

export const useFilterOptions = () =>
  useQuery({
    queryKey: ['olap', 'filters'],
    queryFn: ({ signal }) => olap.filters(signal),
    staleTime: 300_000,
  })
export const useKpis = (filters: Filters) =>
  useQuery({
    queryKey: ['olap', 'kpis', filters],
    queryFn: ({ signal }) => olap.kpis(filters, signal),
  })
export const useTrend = (filters: Filters, granularity: Granularity) =>
  useQuery({
    queryKey: ['olap', 'trend', filters, granularity],
    queryFn: ({ signal }) => olap.trend(filters, granularity, signal),
  })
