import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowUpRight,
  Boxes,
  ChevronRight,
  CircleHelp,
  Database,
  LayoutDashboard,
  Menu,
  PackageCheck,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useFilterOptions } from '@/hooks/use-dashboard'

const navigation = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/olap', label: 'OLAP Analytics', icon: Boxes },
  { to: '/delivery-risk', label: 'Delivery Risk', icon: PackageCheck },
  { to: '/sales-forecast', label: 'Sales Forecast', icon: TrendingUp },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="sidebar-inner">
      <NavLink to="/" className="brand" onClick={onNavigate}>
        <span className="brand-symbol">
          <ShoppingBag size={23} strokeWidth={2.2} />
        </span>
        <span>
          olist<span className="brand-dot">.</span>
        </span>
        <span className="brand-tag">insight</span>
      </NavLink>
      <div className="workspace">
        <span className="workspace-icon">
          <Database size={17} />
        </span>
        <div>
          <strong>Olist E-commerce</strong>
          <span>Brazil · Analytics workspace</span>
        </div>
        <span className="workspace-indicator" />
      </div>
      <p className="nav-caption">WORKSPACE</p>
      <nav aria-label="Điều hướng chính">
        {navigation.map(({ to, label, icon: Icon }, index) => (
          <div key={to}>
            {index === 2 && <p className="nav-caption mt-7">DECISION SUPPORT</p>}
            <NavLink
              to={to}
              end={to === '/'}
              onClick={onNavigate}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
              <ChevronRight className="nav-arrow" size={14} />
            </NavLink>
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="insight-callout">
          <Sparkles size={19} />
          <strong>Dự báo 28 ngày</strong>
          <p>Số đơn, GMV và khoảng dự báo theo ngày.</p>
          <NavLink to="/sales-forecast" onClick={onNavigate}>
            Khám phá dự báo <ArrowUpRight size={14} />
          </NavLink>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <button className="help-link">
              <CircleHelp size={17} />
              Hướng dẫn sử dụng
              <ArrowUpRight size={14} />
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Chào mừng đến Olist Insight</DialogTitle>
              <DialogDescription>
                Không gian phân tích kho dữ liệu Olist và hỗ trợ quyết định.
              </DialogDescription>
            </DialogHeader>
            <div className="help-content">
              <p>
                <strong>Overview:</strong> lọc theo năm mua, bang khách hàng và ngành hàng. Bấm một
                bang hoặc ngành hàng để xem chi tiết.
              </p>
              <p>
                <strong>OLAP Analytics:</strong> tổng hợp theo năm, quý, tháng; chạy truy vấn mẫu
                Roll-up, Drill-down, Slice và Dice.
              </p>
              <p>
                <strong>Delivery Risk:</strong> nhập thông tin đơn hoặc tải mẫu để dự đoán. Kết quả
                là xác suất giao trễ theo model hiện tại.
              </p>
              <p>
                <strong>Sales Forecast:</strong> xem dự báo lịch sử 28 ngày, khoảng dự báo 80% và
                WAPE. Dữ liệu này không theo bộ lọc Overview.
              </p>
              <p>
                Đơn vị tiền tệ: real Brazil (BRL). Nguồn: Brazilian E-commerce Public Dataset by
                Olist.
              </p>
            </div>
          </DialogContent>
        </Dialog>
        <div className="workspace-footer">
          <span className="avatar">DW</span>
          <div>
            <strong>DW & DSS Project</strong>
            <span>CO4031 · Analytics</span>
          </div>
          <span className="version">v1.0</span>
        </div>
      </div>
    </div>
  )
}

export function AppLayout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const status = useFilterOptions()
  const page = navigation.find((item) => item.to === location.pathname)
  useEffect(() => {
    document.title = `${page?.label ?? 'Không tìm thấy'} · Olist Insight`
  }, [page?.label])
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Đến nội dung chính
      </a>
      <aside className="sidebar">
        <Sidebar />
      </aside>
      <div className="main-shell">
        <div className="topbar">
          <div className="breadcrumbs">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mobile-menu"
                  aria-label="Mở điều hướng"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="mobile-sidebar">
                <SheetTitle className="sr-only">Điều hướng</SheetTitle>
                <SheetDescription className="sr-only">
                  Chọn một trang trong Olist Insight.
                </SheetDescription>
                <Sidebar onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="hidden sm:inline">Workspace</span>
            <ChevronRight size={13} className="hidden sm:block" />
            <strong>{page?.label ?? '404'}</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`connection ${status.isError ? 'offline' : status.isPending ? 'pending' : ''}`}
            >
              <i />
              {status.isError
                ? 'Mất kết nối'
                : status.isPending
                  ? 'Đang kết nối'
                  : 'Đã kết nối dữ liệu'}
            </span>
            <span className="topbar-divider" />
            <span className="country-tag">
              <span className="brazil-dot" />
              BRL
            </span>
            <span className="avatar small">DW</span>
          </div>
        </div>
        <main id="main-content" className="main-content">
          <Outlet />
        </main>
        <footer className="page-footer">
          <span>
            Olist Insight <span className="text-muted-foreground/50">/</span> Data Warehouse &
            Decision Support
          </span>
          <span>Brazilian E-commerce Dataset</span>
        </footer>
      </div>
    </div>
  )
}
