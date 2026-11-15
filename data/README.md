# Thư Mục Dữ Liệu (Data Directory)

Thư mục này được sử dụng để chứa toàn bộ dữ liệu thô (raw dataset) và kho dữ liệu phân tích (data warehouse) của dự án. 

> [!NOTE]
> Do tổng dung lượng dữ liệu lớn (> 120 MB dữ liệu thô CSV và các bảng Parquet được sinh ra), hai thư mục con `data/dataset/` và `data/data_warehouse/` đã được cấu hình trong `.gitignore` để tránh commit lên GitHub repository. File này hướng dẫn nguồn gốc và cách chuẩn bị lại dữ liệu khi sao chép dự án về máy mới.

---

## 1. Cấu trúc thư mục mong đợi

```text
data/
├── dataset/                  # Dữ liệu thô dạng CSV (tải từ Kaggle)
│   ├── olist_customers_dataset.csv
│   ├── olist_geolocation_dataset.csv
│   ├── olist_order_items_dataset.csv
│   ├── olist_order_payments_dataset.csv
│   ├── olist_order_reviews_dataset.csv
│   ├── olist_orders_dataset.csv
│   ├── olist_products_dataset.csv
│   ├── olist_sellers_dataset.csv
│   └── product_category_name_translation.csv
│
└── data_warehouse/           # Kho dữ liệu định dạng Parquet (Star Schema)
    ├── fact_order_items/     # Bảng Fact lưu thông tin từng dòng đơn hàng, doanh thu, phí ship
    ├── dim_customer/         # Bảng Dimension thông tin khách hàng và vị trí địa lý
    ├── dim_seller/           # Bảng Dimension thông tin nhà bán hàng
    ├── dim_product/          # Bảng Dimension thông tin và danh mục sản phẩm
    └── dim_date/             # Bảng Dimension thời gian (ngày, tháng, quý, năm, cuối tuần)
```

---

## 2. Nguồn gốc dữ liệu & Cách khởi tạo

### A. Dữ liệu thô (`data/dataset/`)
* **Nguồn gốc:** Bộ dữ liệu thương mại điện tử công khai của Olist trên Kaggle: [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce).
* **Mô tả:** Bộ dữ liệu gồm khoảng 100.000 đơn hàng từ năm 2016 đến 2018 tại Brazil, bao gồm các chiều thông tin: trạng thái đơn hàng, thanh toán, đánh giá, vị trí địa lý, thông tin người bán và người mua.
* **Cách chuẩn bị:**
  - **Cách 1 (Tự động):** Chạy lệnh khởi động pipeline ETL (hệ thống sẽ tự động sử dụng thư viện `kagglehub` để tải về và đặt vào `data/dataset/` nếu thư mục còn trống):
    ```powershell
    python -m src.etl
    ```
  - **Cách 2 (Thủ công):** Truy cập liên kết Kaggle ở trên, tải file zip về, giải nén toàn bộ 9 file CSV vào thư mục `data/dataset/`.

---

### B. Kho dữ liệu (`data/data_warehouse/`)
* **Nguồn gốc:** Được sinh ra tự động bởi pipeline ETL (`src/etl`) của dự án bằng Apache Spark (PySpark).
* **Quá trình xử lý:**
  1. **Extract:** Đọc 9 file CSV từ `data/dataset/`.
  2. **Transform:** Làm sạch dữ liệu, khử trùng lặp vị trí địa lý bằng thuật toán trọng tâm (median centroid), tính toán các độ đo trễ hạn đơn hàng, tạo surrogate key (`customer_key`, `seller_key`, `product_key`, `date_key`, `order_item_key`).
  3. **Load:** Xuất toàn bộ dữ liệu ra 5 bảng Parquet nén Snappy theo mô hình Star Schema đặt tại `data/data_warehouse/`.
* **Cách khởi tạo:**
  Chạy lệnh sau tại thư mục gốc của dự án:
  ```powershell
  python -m src.etl
  ```
  Sau khi chạy xong, DuckDB trong Backend API (`src/backend`) và hệ thống mô hình dự báo DSS (`src/dss`) sẽ tự động đọc trực tiếp kho dữ liệu từ thư mục này.
