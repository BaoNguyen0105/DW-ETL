# 🛒 Olist Data Warehouse & Decision Support System (DW & DSS)

Tài liệu hướng dẫn nội bộ dành cho thành viên phát triển **Frontend** (UI/Dashboard) và **DSS** (Model/Decision Logic).

---

## ⚡ 1. Hướng dẫn Chạy Nhanh (Setup & Run)

Chỉ cần làm theo 5 bước dưới đây để có đầy đủ Database, Models và Backend API chạy trên máy:

### Bước 1: Kích hoạt Virtual Environment & Cài thư viện
```powershell
# Tạo và kích hoạt venv (nếu chưa có)
python -m venv .venv
.venv\Scripts\activate

# Cài đặt toàn bộ dependencies (PySpark, DuckDB, FastAPI, LightGBM, Scikit-learn,...)
pip install -r requirements.txt
```

### Bước 2: Setup công cụ (Chỉ chạy 1 lần duy nhất)
Script này sẽ tự động tải OpenJDK 17 và Hadoop winutils vào thư mục `tools/` (không cần cài Java lên máy tính):
```powershell
python setup_env.py
```

### Bước 3: Chạy ETL để sinh Data Warehouse
Chạy pipeline để tự động tải bộ dữ liệu Olist từ Kaggle về, transform và xuất ra các file Parquet:
```powershell
python -m etl
```
*(Sau khi chạy xong, dữ liệu Star Schema sẽ nằm sẵn trong thư mục `data_warehouse/`).*

### Bước 4: Huấn luyện và sinh Artifacts cho DSS (Chỉ chạy 1 lần hoặc khi train lại)
Huấn luyện 2 mô hình (Dự báo rủi ro giao hàng trễ & Dự báo chuỗi thời gian doanh số), tự động lưu kết quả vào `dss/artifacts/`:
```powershell
python -m dss
```

### Bước 5: Khởi động Backend API
```powershell
cd backend
uvicorn main:app --reload --port 8000
```
* **Base URL:** `http://localhost:8000`
* **Swagger UI (Xem và test trực tiếp toàn bộ API OLAP & DSS):** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🧠 2. Phân Hệ Hỗ Trợ Quyết Định (DSS Module)

Mã nguồn DSS được tổ chức trong thư mục `dss/` và tích hợp vào Backend tại `backend/routers/dss.py`.

### Cấu trúc mô-đun:
* `dss/features.py`: Định nghĩa và tính toán các đặc trưng:
  * Khoảng cách địa lý **Haversine** từ tọa độ khách hàng và người bán.
  * Tỷ lệ cước phí vận chuyển, khối lượng, kích thước bưu kiện.
  * Lịch sử giao hàng trễ và điểm review của seller được làm mượt bằng **Laplace Smoothing**.
  * Chuyển đổi biến phân loại (State, Category) với fallback chống Out-of-Vocabulary.
* `dss/dss_pipeline.py`:
  * **Bài toán 1 - Late Delivery Risk:** Dùng **LightGBM Classifier**, phân chia tập theo thời gian (Temporal Split) và chạy Backtesting chống rò rỉ dữ liệu (Data Leakage). Phân loại rủi ro thành 3 tầng: `low`, `medium`, `high`.
  * **Bài toán 2 - Sales Forecasting:** Dự báo chuỗi thời gian cho 28 ngày kế tiếp (`orders` và `gmv`), khử mùa vụ và tính toán **Black Friday Uplift**, cung cấp khoảng tin cậy 80% (`lo` - `hi`).
* `dss/artifacts/`: Thư mục chứa các file sau khi chạy `python -m dss`:
  * `model.joblib`: Weights mô hình dự báo giao trễ & lookups.
  * `sales_model.joblib` & `sales_forecast.json`: Dự báo doanh thu 28 ngày.
  * `metrics.json` & `sales_metrics.json`: Các chỉ số đánh giá kỹ thuật (ROC-AUC, WAPE, Feature Importance).
  * `example_orders.json`: Dữ liệu mẫu đơn hàng thực tế phục vụ Frontend thử nghiệm.

### Lệnh huấn luyện lại mô hình:
```powershell
python -m dss
```

---

## 🎨 3. Dành cho bạn làm Frontend (UI / Dashboard)

Backend viết bằng FastAPI, đã bật sẵn **CORS** cho mọi domain (`allow_origins=["*"]`). Bạn có thể dùng Streamlit, React, Next.js, Vue hoặc HTML/JS thuần tùy ý.

---

### A. Các API Phân Tích OLAP (`/api/olap`)

#### 1. Lấy dữ liệu cho các thẻ KPI (`/api/olap/kpis`)
Dùng để hiển thị các con số tổng quan ở đầu Dashboard. Hỗ trợ bộ lọc Slice / Dice:
* **Method:** `GET`
* **Params (Optional):** `year` (int), `state` (str, ví dụ: "SP"), `category` (str)
* **Ví dụ:** `/api/olap/kpis?year=2018&state=SP`
* **Response:**
  ```json
  {
    "total_revenue": 1254300.50,
    "total_orders": 8500,
    "total_items": 9800,
    "avg_review_score": 4.15,
    "on_time_rate": 92.4
  }
  ```

#### 2. Biểu đồ doanh thu theo thời gian (`/api/olap/sales-trend`)
Dùng cho biểu đồ đường (Line chart) thể hiện tính năng **Drill-down / Roll-up**:
* **Method:** `GET`
* **Params:** 
  * `granularity` (Bắt buộc): `"month"`, `"quarter"`, hoặc `"year"`
  * `year` (Optional): Lọc theo năm cụ thể
* **Ví dụ:** `/api/olap/sales-trend?granularity=month&year=2018`
* **Response:**
  ```json
  [
    {"period": "2018-01", "revenue": 111500.2, "orders": 820},
    {"period": "2018-02", "revenue": 120400.8, "orders": 890}
  ]
  ```

#### 3. Top ngành hàng bán chạy (`/api/olap/top-categories`)
Dùng cho biểu đồ cột (Bar chart):
* **Method:** `GET`
* **Params (Optional):** 
  * `limit`: Số lượng top (Mặc định: 10)
  * `by`: `"revenue"` (theo doanh thu) hoặc `"volume"` (theo số lượng bán)
* **Response:**
  ```json
  [
    {"category": "bed_bath_table", "revenue": 1036000.0, "total_items": 11115},
    {"category": "health_beauty", "revenue": 998000.0, "total_items": 9670}
  ]
  ```

#### 4. Phân bổ doanh số theo Bang (`/api/olap/geo-distribution`)
Dùng để vẽ bản đồ nhiệt (Heatmap) hoặc bảng phân tích theo 27 bang của Brazil:
* **Method:** `GET`
* **Response:**
  ```json
  [
    {"state": "SP", "revenue": 5200000.0, "orders": 41746},
    {"state": "RJ", "revenue": 1800000.0, "orders": 12852}
  ]
  ```

#### 5. Danh sách các lựa chọn cho Dropdown Filter (`/api/olap/filters`)
Dùng để nạp danh sách các năm, bang, ngành hàng vào các bộ lọc Dropdown:
* **Method:** `GET`
* **Response:**
  ```json
  {
    "years": [2016, 2017, 2018],
    "states": ["SP", "RJ", "MG"],
    "categories": ["health_beauty", "computers_accessories"]
  }
  ```

#### 6. Chạy câu truy vấn SQL tùy biến (`/api/olap/execute-query`)
Dành cho trang **OLAP Query Console** (Cho phép người dùng nhập SQL tùy biến và xem kết quả trực tiếp):
* **Method:** `POST`
* **Body:** `{"query": "SELECT c.customer_state, COUNT(*) FROM fact_order_items f JOIN dim_customer c ON f.customer_key = c.customer_key GROUP BY 1"}`
* **Response:** Trả về danh sách records JSON và số lượng dòng.

---

### B. Các API Hỗ Trợ Quyết Định DSS (`/api/dss`)

#### 1. Dự đoán rủi ro đơn hàng giao trễ (`/api/dss/predict-late-delivery`)
Dùng cho Form đánh giá rủi ro đơn hàng mới:
* **Method:** `POST`
* **Body (JSON):**
  ```json
  {
    "purchase_date": "2018-08-15",
    "estimated_date": "2018-08-28",
    "seller_id": "4a3ca9315b744ce9f8e9374361493884",
    "category": "bed_bath_table",
    "n_items": 1,
    "total_price": 120.0,
    "total_freight": 25.5,
    "total_weight_g": 1200.0,
    "total_volume_cm3": 8000.0,
    "max_dim_cm": 30.0,
    "c_lat": -23.5505,
    "c_lng": -46.6333,
    "c_state": "SP",
    "s_lat": -22.9068,
    "s_lng": -43.1729,
    "s_state": "RJ"
  }
  ```
* **Response:**
  ```json
  {
    "late_probability": 0.3842,
    "risk_tier": "high",
    "thresholds": {
      "medium": 0.12,
      "high": 0.30
    }
  }
  ```

#### 2. Lấy dự báo bán hàng 28 ngày (`/api/dss/sales-forecast`)
Dùng cho biểu đồ dự báo xu hướng tương lai:
* **Method:** `GET`
* **Params:** `target` (`"orders"` hoặc `"gmv"`, mặc định là `"orders"`)
* **Ví dụ:** `/api/dss/sales-forecast?target=orders`
* **Response:**
  ```json
  {
    "target": "orders",
    "horizon_days": 28,
    "forecast": [
      {
        "date": "2018-09-04",
        "forecast": 215.4,
        "lo": 182.5,
        "hi": 251.2,
        "event": false
      }
    ]
  }
  ```

#### 3. Lấy mẫu đơn hàng có sẵn để test nhanh (`/api/dss/example-orders`)
Dùng để gắn nút bấm "Tải đơn hàng mẫu" trên giao diện, tự động điền form dự đoán:
* **Method:** `GET`
* **Response:** Trả về 5 đơn hàng mẫu thực tế kèm cờ `_actual_late`.

#### 4. Các API Metrics mô hình (`/api/dss/late-delivery-metrics` & `/api/dss/sales-metrics`)
Dùng để hiển thị bảng đánh giá độ chính xác của các mô hình DSS (ROC-AUC, Feature Importance, WAPE theo ngày/tuần).

---

## 📐 4. Star Schema Reference (Cấu trúc Bảng)

Mô hình dữ liệu Star Schema chuẩn Ralph Kimball được lưu trữ tại [docs/schema.png](docs/schema.png) và định nghĩa mã nguồn Mermaid tại [docs/schema.mmd](docs/schema.mmd):

![Star Schema](docs/schema.png)

<details>
<summary><b>🔍 Bấm để xem chi tiết mã nguồn Mermaid (Schema ERD)</b></summary>

```mermaid
erDiagram
    dim_customer ||--o{ fact_order_items : "has (customer_key)"
    dim_seller ||--o{ fact_order_items : "fulfills (seller_key)"
    dim_product ||--o{ fact_order_items : "contains (product_key)"
    dim_date ||--o{ fact_order_items : "purchased_at (purchase_date_key)"
    dim_date ||--o{ fact_order_items : "delivered_at (delivered_date_key)"
    dim_date ||--o{ fact_order_items : "estimated_at (estimated_date_key)"

    fact_order_items {
        int order_item_key PK "Surrogate Primary Key"
        string order_id "Degenerate Dimension"
        int order_item_id "Degenerate Dimension (Line Number)"
        string order_status "Degenerate Dimension"
        int customer_key FK "References dim_customer"
        int seller_key FK "References dim_seller"
        int product_key FK "References dim_product"
        int purchase_date_key FK "References dim_date"
        int delivered_date_key FK "References dim_date"
        int estimated_date_key FK "References dim_date"
        double price "Metric: Item Price"
        double freight_value "Metric: Shipping Cost"
        double total_item_value "Metric: Price + Freight"
        int delivery_delay_days "Metric: Delivery vs Estimate Days"
        int review_score "Metric: 1 to 5 Stars"
    }

    dim_customer {
        int customer_key PK "Surrogate Primary Key"
        string customer_id "Natural Key (Order-level)"
        string customer_unique_id "Human/Account Key"
        int customer_zip_code_prefix "Zip Code Prefix"
        string customer_city "City Name"
        string customer_state "State Code"
        double latitude "Representative Latitude"
        double longitude "Representative Longitude"
    }

    dim_seller {
        int seller_key PK "Surrogate Primary Key"
        string seller_id "Natural Key"
        int seller_zip_code_prefix "Zip Code Prefix"
        string seller_city "City Name"
        string seller_state "State Code"
        double latitude "Representative Latitude"
        double longitude "Representative Longitude"
    }

    dim_product {
        int product_key PK "Surrogate Primary Key"
        string product_id "Natural Key"
        string product_category_name "Portuguese Category"
        string product_category_name_english "English Category"
        int product_name_length "Name Character Count"
        int product_description_length "Description Character Count"
        int product_photos_qty "Number of Photos"
        double product_weight_g "Weight (grams)"
        double product_length_cm "Length (cm)"
        double product_height_cm "Height (cm)"
        double product_width_cm "Width (cm)"
    }

    dim_date {
        int date_key PK "Surrogate Key (YYYYMMDD)"
        date full_date "Standard Date (YYYY-MM-DD)"
        int year "Calendar Year"
        int quarter "Quarter (1-4)"
        int month "Month (1-12)"
        string month_name "Full Month Name"
        int day "Day of Month (1-31)"
        string day_of_week "Day Name (Monday-Sunday)"
        boolean is_weekend "True if Saturday or Sunday"
    }
```

</details>
