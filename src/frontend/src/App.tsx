import { Component, lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoadingState } from '@/components/ui/async-state'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/services/api'

const Overview = lazy(() => import('@/pages/Overview'))
const OLAP = lazy(() => import('@/pages/OLAP'))
const DeliveryRisk = lazy(() => import('@/pages/DeliveryRisk'))
const SalesForecast = lazy(() => import('@/pages/SalesForecast'))
const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (count, error) =>
        count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
})

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <div className="async-state min-h-screen">
          <h1 className="text-xl font-semibold">Giao diện gặp sự cố</h1>
          <p>Hãy tải lại trang để khởi tạo lại phiên làm việc.</p>
          <Button onClick={() => window.location.reload()}>Tải lại trang</Button>
        </div>
      )
    return this.props.children
  }
}

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState label="Đang mở không gian phân tích…" />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Overview />} />
          <Route path="olap" element={<OLAP />} />
          <Route path="delivery-risk" element={<DeliveryRisk />} />
          <Route path="sales-forecast" element={<SalesForecast />} />
          <Route
            path="*"
            element={
              <div className="async-state min-h-[60vh]">
                <span className="text-6xl font-semibold text-primary/30">404</span>
                <h1 className="text-xl font-semibold">Không tìm thấy trang</h1>
                <p>Đường dẫn này không có trong workspace.</p>
                <Button asChild>
                  <Link to="/">Về trang tổng quan</Link>
                </Button>
              </div>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
