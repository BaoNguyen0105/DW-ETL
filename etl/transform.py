from pyspark.sql import DataFrame
from pyspark.sql import functions as F
from pyspark.sql.window import Window

from etl.schema import (
    dim_customer_schema,
    dim_seller_schema,
    dim_product_schema,
    dim_date_schema,
    fact_order_items_schema,
)


def build_geo_coords(raw_geolocation: DataFrame) -> DataFrame:
    """Aggregate 1M+ geolocation records down to average lat/long per zip code."""
    return (
        raw_geolocation
        .groupBy("geolocation_zip_code_prefix")
        .agg(
            F.round(F.avg("geolocation_lat"), 5).alias("latitude"),
            F.round(F.avg("geolocation_lng"), 5).alias("longitude"),
        )
    )


def build_dim_customer(raw_customers: DataFrame, geo_coords: DataFrame) -> DataFrame:
    """Build dim_customer enriched with geographic coordinates."""
    window_spec = Window.orderBy("customer_id")

    return (
        raw_customers
        .join(
            geo_coords,
            raw_customers["customer_zip_code_prefix"] == geo_coords["geolocation_zip_code_prefix"],
            how="left",
        )
        .dropDuplicates(["customer_id"])
        .withColumn("customer_key", F.row_number().over(window_spec).cast("int"))
        .select([field.name for field in dim_customer_schema.fields])
    )


def build_dim_seller(raw_sellers: DataFrame, geo_coords: DataFrame) -> DataFrame:
    """Build dim_seller enriched with geographic coordinates."""
    window_spec = Window.orderBy("seller_id")

    return (
        raw_sellers
        .join(
            geo_coords,
            raw_sellers["seller_zip_code_prefix"] == geo_coords["geolocation_zip_code_prefix"],
            how="left",
        )
        .dropDuplicates(["seller_id"])
        .withColumn("seller_key", F.row_number().over(window_spec).cast("int"))
        .select([field.name for field in dim_seller_schema.fields])
    )


def build_dim_product(raw_products: DataFrame, raw_translations: DataFrame) -> DataFrame:
    """Build dim_product with English category names and corrected spelling."""
    window_spec = Window.orderBy("product_id")

    return (
        raw_products
        .join(raw_translations, on="product_category_name", how="left")
        .withColumnRenamed("product_name_lenght", "product_name_length")
        .withColumnRenamed("product_description_lenght", "product_description_length")
        .withColumn(
            "product_category_name_english",
            F.coalesce(
                F.col("product_category_name_english"),
                F.col("product_category_name"),
                F.lit("unknown"),
            ),
        )
        .dropDuplicates(["product_id"])
        .withColumn("product_key", F.row_number().over(window_spec).cast("int"))
        .select([field.name for field in dim_product_schema.fields])
    )


def build_dim_date(raw_orders: DataFrame) -> DataFrame:
    """Build role-playing dim_date extracted from all purchase dates."""
    return (
        raw_orders
        .select(F.to_date("order_purchase_timestamp").alias("full_date"))
        .filter(F.col("full_date").isNotNull())
        .distinct()
        .withColumn("date_key", F.date_format("full_date", "yyyyMMdd").cast("int"))
        .withColumn("year", F.year("full_date"))
        .withColumn("quarter", F.quarter("full_date"))
        .withColumn("month", F.month("full_date"))
        .withColumn("month_name", F.date_format("full_date", "MMMM"))
        .withColumn("day", F.dayofmonth("full_date"))
        .withColumn("day_of_week", F.date_format("full_date", "EEEE"))
        .withColumn("is_weekend", F.when(F.dayofweek("full_date").isin(1, 7), True).otherwise(False))
        .select([field.name for field in dim_date_schema.fields])
    )


def build_fact_order_items(
    raw_items: DataFrame,
    raw_orders: DataFrame,
    raw_reviews: DataFrame,
    dim_customer: DataFrame,
    dim_seller: DataFrame,
    dim_product: DataFrame,
) -> DataFrame:
    """Build fact_order_items by resolving surrogate keys and calculating metrics."""
    # 1. Base transactions
    base_items = (
        raw_items
        .join(
            raw_orders.select(
                "order_id",
                "customer_id",
                "order_status",
                "order_purchase_timestamp",
                "order_delivered_customer_date",
                "order_estimated_delivery_date",
            ),
            on="order_id",
            how="inner",
        )
    )

    # 2. Clean reviews (safely convert score to integer and deduplicate per order)
    reviews_clean = (
        raw_reviews
        .select("order_id", F.expr("try_cast(review_score as int)").alias("review_score"))
        .dropDuplicates(["order_id"])
    )

    # 3. Lookup dimension surrogate keys via LEFT JOIN
    fact_joined = (
        base_items
        .join(dim_customer.select("customer_id", "customer_key"), on="customer_id", how="left")
        .join(dim_seller.select("seller_id", "seller_key"), on="seller_id", how="left")
        .join(dim_product.select("product_id", "product_key"), on="product_id", how="left")
        .join(reviews_clean, on="order_id", how="left")
    )

    # 4. Generate Surrogate Key & Business Measures
    fact_window = Window.orderBy("order_id", "order_item_id")

    return (
        fact_joined
        .withColumn("order_item_key", F.row_number().over(fact_window).cast("int"))
        .withColumn("purchase_date_key", F.date_format("order_purchase_timestamp", "yyyyMMdd").cast("int"))
        .withColumn("delivered_date_key", F.date_format("order_delivered_customer_date", "yyyyMMdd").cast("int"))
        .withColumn("estimated_date_key", F.date_format("order_estimated_delivery_date", "yyyyMMdd").cast("int"))
        .withColumn("total_item_value", F.round(F.col("price") + F.col("freight_value"), 2).cast("double"))
        .withColumn(
            "delivery_delay_days",
            F.datediff("order_delivered_customer_date", "order_estimated_delivery_date").cast("int"),
        )
        .select([field.name for field in fact_order_items_schema.fields])
    )


def transform(raw_data: dict[str, DataFrame]) -> dict[str, DataFrame]:
    """Orchestrate all transformations to produce the Star Schema tables."""
    print(">>> [2/3] Transforming data into Star Schema...")

    geo_coords = build_geo_coords(raw_data["geolocation"])

    dim_customer = build_dim_customer(raw_data["customers"], geo_coords)
    dim_seller = build_dim_seller(raw_data["sellers"], geo_coords)
    dim_product = build_dim_product(raw_data["products"], raw_data["translations"])
    dim_date = build_dim_date(raw_data["orders"])

    fact_order_items = build_fact_order_items(
        raw_items=raw_data["order_items"],
        raw_orders=raw_data["orders"],
        raw_reviews=raw_data["reviews"],
        dim_customer=dim_customer,
        dim_seller=dim_seller,
        dim_product=dim_product,
    )

    return {
        "dim_customer": dim_customer,
        "dim_seller": dim_seller,
        "dim_product": dim_product,
        "dim_date": dim_date,
        "fact_order_items": fact_order_items,
    }
