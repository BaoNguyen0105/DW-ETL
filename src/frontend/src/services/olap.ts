import { post, queryString, request } from './api'
import type {
  CategorySales,
  FilterOptions,
  Filters,
  GeoSales,
  Granularity,
  Kpis,
  QueryResult,
  QueryTemplates,
  SalesPoint,
} from '@/types/api'

export const olap = {
  filters: (signal?: AbortSignal) => request<FilterOptions>('/olap/filters', { signal }),
  kpis: (filters: Filters, signal?: AbortSignal) =>
    request<Kpis>(`/olap/kpis${queryString(filters)}`, { signal }),
  trend: (filters: Filters, granularity: Granularity, signal?: AbortSignal) =>
    request<SalesPoint[]>(`/olap/sales-trend${queryString({ ...filters, granularity })}`, {
      signal,
    }),
  categories: (filters: Filters, by: 'revenue' | 'volume' = 'revenue', signal?: AbortSignal) =>
    request<CategorySales[]>(`/olap/top-categories${queryString({ ...filters, by, limit: 50 })}`, {
      signal,
    }),
  geo: (filters: Filters, signal?: AbortSignal) =>
    request<GeoSales[]>(`/olap/geo-distribution${queryString(filters)}`, { signal }),
  templates: (signal?: AbortSignal) => request<QueryTemplates>('/olap/sample-queries', { signal }),
  execute: (query: string) => post<QueryResult>('/olap/execute-query', { query }),
}
