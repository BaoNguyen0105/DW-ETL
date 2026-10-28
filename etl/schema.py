from pyspark.sql.types import (
    StructType,
    StructField,
    StringType,
    IntegerType,
    DoubleType,
    DateType,
    BooleanType,
)

# ==============================================================================
# DATA WAREHOUSE STAR SCHEMA DEFINITIONS
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Customer Dimension Schema (dim_customer)
# ------------------------------------------------------------------------------
dim_customer_schema = StructType([
    StructField("customer_key", IntegerType(), False),           # Surrogate Key
    StructField("customer_id", StringType(), False),            # Natural / Business Key
    StructField("customer_unique_id", StringType(), True),       # Human Account ID
    StructField("customer_zip_code_prefix", IntegerType(), True),
    StructField("customer_city", StringType(), True),
    StructField("customer_state", StringType(), True),
    StructField("latitude", DoubleType(), True),
    StructField("longitude", DoubleType(), True),
])

# ------------------------------------------------------------------------------
# 2. Seller Dimension Schema (dim_seller)
# ------------------------------------------------------------------------------
dim_seller_schema = StructType([
    StructField("seller_key", IntegerType(), False),             # Surrogate Key
    StructField("seller_id", StringType(), False),              # Natural / Business Key
    StructField("seller_zip_code_prefix", IntegerType(), True),
    StructField("seller_city", StringType(), True),
    StructField("seller_state", StringType(), True),
    StructField("latitude", DoubleType(), True),
    StructField("longitude", DoubleType(), True),
])

# ------------------------------------------------------------------------------
# 3. Product Dimension Schema (dim_product)
# ------------------------------------------------------------------------------
dim_product_schema = StructType([
    StructField("product_key", IntegerType(), False),            # Surrogate Key
    StructField("product_id", StringType(), False),             # Natural / Business Key
    StructField("product_category_name", StringType(), True),
    StructField("product_category_name_english", StringType(), True),
    StructField("product_name_length", IntegerType(), True),
    StructField("product_description_length", IntegerType(), True),
    StructField("product_photos_qty", IntegerType(), True),
    StructField("product_weight_g", DoubleType(), True),
    StructField("product_length_cm", DoubleType(), True),
    StructField("product_height_cm", DoubleType(), True),
    StructField("product_width_cm", DoubleType(), True),
])

# ------------------------------------------------------------------------------
# 4. Date Dimension Schema (dim_date)
# ------------------------------------------------------------------------------
dim_date_schema = StructType([
    StructField("date_key", IntegerType(), False),              # Surrogate Key: YYYYMMDD
    StructField("full_date", DateType(), False),
    StructField("year", IntegerType(), False),
    StructField("quarter", IntegerType(), False),
    StructField("month", IntegerType(), False),
    StructField("month_name", StringType(), False),
    StructField("day", IntegerType(), False),
    StructField("day_of_week", StringType(), False),
    StructField("is_weekend", BooleanType(), False),
])

# ------------------------------------------------------------------------------
# 5. Order Items Fact Schema (fact_order_items)
# ------------------------------------------------------------------------------
fact_order_items_schema = StructType([
    # Primary Key
    StructField("order_item_key", IntegerType(), False),        # Fact Primary Key
    
    # Degenerate Dimensions (Direct transactional identifiers)
    StructField("order_id", StringType(), False),
    StructField("order_item_id", IntegerType(), False),
    StructField("order_status", StringType(), True),
    
    # Foreign Keys pointing to Dimensions
    StructField("customer_key", IntegerType(), True),
    StructField("seller_key", IntegerType(), True),
    StructField("product_key", IntegerType(), True),
    StructField("purchase_date_key", IntegerType(), True),
    StructField("delivered_date_key", IntegerType(), True),
    StructField("estimated_date_key", IntegerType(), True),
    
    # Quantitative Measures (Facts)
    StructField("price", DoubleType(), True),
    StructField("freight_value", DoubleType(), True),
    StructField("total_item_value", DoubleType(), True),
    StructField("delivery_delay_days", IntegerType(), True),
    StructField("review_score", IntegerType(), True),
])
