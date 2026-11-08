import { post, request } from './api'
import type {
  DeliveryInput,
  DeliveryMetrics,
  DeliveryResult,
  ExampleOrder,
  ForecastTarget,
  SalesForecast,
  SalesMetrics,
} from '@/types/api'

export const dss = {
  predict: (input: DeliveryInput) => post<DeliveryResult>('/dss/predict-late-delivery', input),
  examples: (signal?: AbortSignal) =>
    request<{ examples: ExampleOrder[]; count: number }>('/dss/example-orders', { signal }),
  deliveryMetrics: (signal?: AbortSignal) =>
    request<DeliveryMetrics>('/dss/late-delivery-metrics', { signal }),
  forecast: (target: ForecastTarget, signal?: AbortSignal) =>
    request<SalesForecast>(`/dss/sales-forecast?target=${target}`, { signal }),
  salesMetrics: (signal?: AbortSignal) => request<SalesMetrics>('/dss/sales-metrics', { signal }),
}
