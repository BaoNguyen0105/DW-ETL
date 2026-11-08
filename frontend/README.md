# Olist Insight — Frontend

Ứng dụng React + Vite + TypeScript cho kho dữ liệu Olist, dùng Tailwind CSS v4, shadcn/ui (Radix), React Router, Recharts, TanStack Query và React Hook Form + Zod. Trang `/` là dashboard landing page, lấy cảm hứng bố cục từ [thiết kế của Digcy](https://dribbble.com/shots/27237292-E-Commerce-Dashboard-SaaS-Analytics-Sales-Management).

## Chạy ứng dụng

Yêu cầu Node.js `^20.19.0 || >=22.12.0`; phiên bản đã dùng để kiểm tra: Node 24.16.0. Warehouse và DSS artifacts cần được tạo theo README ở thư mục gốc.

Terminal thứ nhất, từ thư mục gốc `DW-ETL`:

```powershell
.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Terminal thứ hai:

```powershell
cd frontend
npm ci
npm run dev
```

Mở **http://127.0.0.1:5173**. Vite chuyển tiếp `/api/*` tới `http://127.0.0.1:8000`. Nếu PowerShell chặn `npm.ps1`, dùng `npm.cmd ci` và `npm.cmd run dev`; không cần thay đổi execution policy.

Dùng API ở địa chỉ khác bằng cách sao chép `.env.example` thành `.env.local`:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

Địa chỉ này phải bao gồm `/api`. Khởi động lại Vite sau khi sửa env. Biến `VITE_*` công khai trong bundle, không chứa secret. `VITE_API_BASE_URL` được gắn vào bundle lúc build; proxy trong `vite.config.ts` chỉ dành cho dev/preview. Khi phục vụ `dist/`, cấu hình reverse proxy `/api` hoặc build với địa chỉ API phù hợp, và cấu hình SPA fallback về `index.html` cho các route frontend.

## Các trang

| Route             | Chức năng                                                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`               | KPI doanh thu, số đơn/sản phẩm, giao đúng hạn, review; revenue theo tháng/quý/năm; donut tỷ trọng các bang; bảng địa lý đầy đủ trong hộp thoại; bảng top ngành hàng có tìm kiếm, phân trang, chọn tiêu chí xếp hạng và CSV. |
| `/olap`           | Chuyển năm/quý/tháng cho Roll-up/Drill-down; bộ lọc năm/bang/ngành; bốn query template từ API; SQL editor, Ctrl/⌘+Enter, bảng kết quả và CSV.                                                                               |
| `/delivery-risk`  | Form có validation ngày, số lượng, giá và tọa độ; tải đơn mẫu; dự đoán thật; hiển thị xác suất, tier và ngưỡng từ model; metrics và feature importance.                                                                     |
| `/sales-forecast` | Chọn orders/GMV; dự báo 28 ngày và khoảng 80%; bật/tắt khoảng dự báo; model comparison, WAPE/bias, bảng theo ngày và CSV.                                                                                                   |

Sidebar chuyển thành drawer trên màn hình nhỏ. Bảng rộng cuộn ngang. Có trạng thái tải, rỗng, lỗi, nút thử lại, 404, error boundary và hướng dẫn trong sidebar. Font Inter được đóng gói cục bộ.

Không có số liệu demo tự động thay thế khi backend lỗi. Số liệu hiển thị lấy trực tiếp từ API. Test dùng fixtures riêng trong `tests/`.

## Cấu trúc

```text
src/
├── components/
│   ├── ui/           # shadcn components, async state, bảng, select
│   ├── charts/       # RevenueChart, GeoChart, ForecastChart
│   └── layout/       # Sidebar, PageHeader, FilterBar
├── pages/            # Overview, OLAP, DeliveryRisk, SalesForecast
├── services/         # Fetch client và API OLAP/DSS
├── hooks/            # URL filters, query hooks
├── types/            # Contract backend
├── lib/              # Format BRL/CSV, schema validation, cn
├── App.tsx           # Routes lazy loaded, QueryClient, error boundary
└── index.css         # Tailwind theme và responsive styles
scripts/smoke-api.mjs  # Kiểm tra HTTP trên backend thật
tests/                # Test validation, API errors và tương tác các trang
```

Alias `@/` được cấu hình trong Vite, TypeScript và Vitest. TypeScript 7 dùng `paths` với đường dẫn tương đối; không thêm `baseUrl` đã bị loại bỏ ở phiên bản này. Cấu hình Tailwind/alias được tạo trước khi chạy shadcn init, theo [hướng dẫn Vite chính thức](https://ui.shadcn.com/docs/installation/vite). `components.json` giữ cấu hình để tiếp tục thêm component:

```powershell
npx shadcn@latest add tooltip
```

## Quy ước dữ liệu

- `year` là năm mua hàng; `state` là bang khách hàng; `category` là tên API. Các bộ lọc kết hợp AND và được lưu trên URL. Chọn “Tất cả” sẽ bỏ tham số tương ứng.
- Bộ lọc Overview áp dụng đồng bộ cho KPI, sales trend, categories, geo. Không áp dụng cho DSS. Query SQL có điều kiện riêng, không bị bộ lọc biểu đồ viết lại.
- `total_revenue`/`revenue` cộng **price + freight**, trên mọi trạng thái đơn, chưa phải doanh thu thực thu. `total_items` là số dòng sản phẩm. Điểm review và tỷ lệ đúng hạn tính theo item. Giá trị thiếu được hiển thị `—`, không đổi thành 0.
- GMV forecast chỉ tính **price**, loại canceled/unavailable. Không so trực tiếp với doanh thu Overview.
- Ngày dự báo lấy từ artifact trả về, không lấy ngày hiện tại. Artifact hiện dự báo **04/09/2018–01/10/2018**, sau dữ liệu đến 03/09/2018.
- Khoảng 80% hiển thị trực tiếp `[lo, hi]` cho từng ngày. Không cộng các cận ngày thành một khoảng cho tổng 28 ngày. Coverage chưa được xác minh trên tập giữ riêng.
- WAPE là sai số; ROC-AUC không phải accuracy. UI hiển thị baseline và hạn chế khi model giao trễ không vượt baseline.
- Tier `low/medium/high` và thresholds lấy từ response; không gắn ngưỡng 50% hay hard-code ngưỡng minh họa. `_actual_late` chỉ để đối chiếu đơn mẫu, không gửi tới model.
- Form gửi số JSON, ngày ISO, giá/phí 0 hợp lệ. Thông tin tùy chọn có thể để trống hoặc null. Lỗi 422 được gắn vào trường; 503 hướng dẫn tạo DSS artifacts. Sửa form sẽ xóa kết quả dự đoán cũ.
- CSV có UTF-8 BOM, escape dấu nháy và bảo vệ chuỗi bắt đầu bằng ký tự công thức bảng tính.

## Kiểm tra

```powershell
npm test             # Vitest + Testing Library, không cần backend
npm run build        # TypeScript strict + production build
npm run format       # Prettier
npm run test:api      # Backend phải chạy ở 127.0.0.1:8000
```

Kiểm tra cả Vite proxy khi dev server đang chạy:

```powershell
$env:API_BASE_URL = 'http://127.0.0.1:5173/api'
npm run test:api
```

`test:api` chỉ đọc dữ liệu, chạy các SELECT mẫu và gọi inference; không train hay sửa warehouse. Kết quả lưu trong `.qa/api-smoke.json` (Git ignore).

Các test giao diện chạy trong jsdom, kiểm tra gọi API, điều hướng, drawer, validation, xử lý kết quả cũ, chuyển target, khoảng dự báo và phân trang. Kích thước biểu đồ được cố định trong test vì jsdom không có layout engine. Chúng không thay thế kiểm tra hình ảnh trên trình duyệt desktop/mobile.

## Phạm vi đã khảo sát và giới hạn

Đã đọc mã ứng dụng ETL, DSS, backend; các test ở gốc; các script kiểm tra trong `review/`; README, requirements, cấu hình, schema Mermaid và nội dung PDF đề bài. Đã đối chiếu các JSON artifact hiện tại, API và số liệu warehouse. Không coi thư viện trong `.venv/`, Java/Hadoop trong `tools/`, bản sao audit, cache hoặc hàng triệu dòng CSV là mã nguồn cần sửa cho frontend.

Ứng dụng React cùng cấu hình và test giao diện nằm trong `frontend/`. Checklist toàn project được tổng hợp trong [tests/README.md](../tests/README.md). Bộ test API tại thư mục gốc được bổ sung cleanup cây tiến trình trên Windows để giải phóng log trước khi dọn fixtures tạm.

SQL console sử dụng endpoint hiện có. Bộ chặn SQL của backend vẫn chưa phải sandbox SELECT an toàn; frontend không thay thế kiểm soát quyền ở máy chủ. Trước khi mở hệ thống cho người dùng không tin cậy, xử lý giới hạn SQL ở backend như ghi trong `review/PROJECT_REVIEW.md`.

Đã kiểm tra production build, 30 test Vitest/Testing Library và 32 request HTTP qua Vite proxy với backend thật. Kiểm tra hình ảnh desktop/mobile còn cần thực hiện vì công cụ Computer Use báo `native pipe is unavailable` khi kết nối cửa sổ trình duyệt.

`npm audit --omit=dev` báo 0 lỗ hổng trong dependency production tại thời điểm kiểm tra. `shadcn` là dependency phục vụ phát triển/build. Audit toàn bộ dependency còn báo 6 cảnh báo low/moderate trong chuỗi CLI này (deepmerge/minimatch), và bản sửa tương thích tự động vẫn để lại các cảnh báo đó.
