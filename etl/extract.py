from pyspark.sql import SparkSession, DataFrame


def get_spark_session(app_name: str = "Olist-DW-ETL") -> SparkSession:
    """Initialize and return a configured local SparkSession."""
    spark = (
        SparkSession.builder
        .appName(app_name)
        .master("local[*]")
        .config("spark.driver.memory", "4g")
        .config("spark.sql.adaptive.enabled", "true")
        .config("spark.ui.showConsoleProgress", "false")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("ERROR")
    return spark


def extract(spark: SparkSession, dataset_dir: str = "dataset") -> dict[str, DataFrame]:
    """Read all required raw CSV datasets into Spark DataFrames."""
    print(f">>> [1/3] Extracting raw datasets from '{dataset_dir}'...")

    data = {
        "customers": spark.read.csv(
            f"{dataset_dir}/olist_customers_dataset.csv", header=True, inferSchema=True
        ),
        "geolocation": spark.read.csv(
            f"{dataset_dir}/olist_geolocation_dataset.csv", header=True, inferSchema=True
        ),
        "order_items": spark.read.csv(
            f"{dataset_dir}/olist_order_items_dataset.csv", header=True, inferSchema=True
        ),
        "orders": spark.read.csv(
            f"{dataset_dir}/olist_orders_dataset.csv", header=True, inferSchema=True
        ),
        "products": spark.read.csv(
            f"{dataset_dir}/olist_products_dataset.csv", header=True, inferSchema=True
        ),
        "sellers": spark.read.csv(
            f"{dataset_dir}/olist_sellers_dataset.csv", header=True, inferSchema=True
        ),
        "translations": spark.read.csv(
            f"{dataset_dir}/product_category_name_translation.csv", header=True, inferSchema=True
        ),
        # multiLine=True is required because customer reviews contain line breaks
        "reviews": spark.read.option("header", "true")
        .option("inferSchema", "true")
        .option("multiLine", "true")
        .csv(f"{dataset_dir}/olist_order_reviews_dataset.csv"),
    }
    return data
