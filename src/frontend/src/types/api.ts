export type Filters = { year?: number; state?: string; category?: string }
export type Granularity = 'month' | 'quarter' | 'year'
export type ForecastTarget = 'orders' | 'gmv'
export interface FilterOptions {
  years: number[]
  states: string[]
  categories: string[]
}
export interface Kpis {
  total_revenue: number
  total_orders: number
  total_items: number
  avg_review_score: number | null
  on_time_rate: number | null
}
export interface SalesPoint {
  period: string
  revenue: number
  orders: number
}
export interface CategorySales {
  category: string
  revenue: number
  total_items: number
  avg_review_score: number | null
}
export interface GeoSales {
  state: string | null
  revenue: number
  orders: number
  avg_freight: number | null
  avg_delay_days: number | null
}
export interface QueryResult {
  columns: string[]
  data: Record<string, unknown>[]
  row_count: number
}
export type QueryTemplates = Record<string, { description: string; sql: string }>
export interface DeliveryInput {
  purchase_date: string
  estimated_date: string
  seller_id: string
  category: string
  n_items: number
  total_price: number
  total_freight: number
  c_state: string
  s_state: string
  total_weight_g?: number | null
  total_volume_cm3?: number | null
  max_dim_cm?: number | null
  c_lat?: number | null
  c_lng?: number | null
  s_lat?: number | null
  s_lng?: number | null
}
export interface DeliveryResult {
  late_probability: number
  risk_tier: 'low' | 'medium' | 'high'
  thresholds: { medium: number; high: number }
}
export interface ExampleOrder extends DeliveryInput {
  _actual_late: boolean
}
export interface ForecastPoint {
  date: string
  forecast: number
  lo: number
  hi: number
  event: boolean
}
export interface SalesForecast {
  target: ForecastTarget
  horizon_days: number
  forecast: ForecastPoint[]
}
export interface BacktestScore {
  daily_wape: number
  weekly_wape: number
  bias_pct: number
  median_fold_wape: number
  n_folds: number
}
export interface ForecastMetrics {
  chosen: string
  backtest: Record<string, BacktestScore>
  interval_80: { lo: number; hi: number }
  event_uplift: Record<string, number>
}
export type SalesMetrics = Record<ForecastTarget, ForecastMetrics>
export interface ClassificationScore {
  n: number
  late_rate: number
  roc_auc: number
  pr_auc: number
}
export interface DeliveryMetrics {
  validation: ClassificationScore
  test: ClassificationScore
  baseline: ClassificationScore
  feature_importance: Record<string, number>
  backtest: {
    mean_auc: number
    baseline_mean: number
    by_month: { month: string; lgbm_auc: number; baseline_auc: number }[]
  }
  data_window: {
    orders: number
    purchase_from: string
    purchase_to: string
    review_lag_days: number
  }
}
