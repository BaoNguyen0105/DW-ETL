import os
from pyspark.sql import SparkSession, DataFrame

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC_DIR = os.path.dirname(_HERE)
_PROJECT_ROOT = os.path.dirname(_SRC_DIR)
_DEFAULT_DATASET_DIR = os.path.join(_PROJECT_ROOT, "data", "dataset").replace("\\", "/")


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


def extract(spark: SparkSession, dataset_dir: str = _DEFAULT_DATASET_DIR) -> dict[str, DataFrame]:
    """Read all required raw CSV datasets into Spark DataFrames."""
    if not os.path.isabs(dataset_dir):
        candidate = os.path.join(_PROJECT_ROOT, dataset_dir).replace("\\", "/")
        if os.path.exists(candidate):
            dataset_dir = candidate
        elif os.path.exists(os.path.join(_PROJECT_ROOT, "data", dataset_dir)):
            dataset_dir = os.path.join(_PROJECT_ROOT, "data", dataset_dir).replace("\\", "/")

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
