import os
from .env import ensure_environment
from .fetch_data import download_dataset
from .extract import get_spark_session, extract
from .transform import transform
from .load import load

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC_DIR = os.path.dirname(_HERE)
_PROJECT_ROOT = os.path.dirname(_SRC_DIR)
_DEFAULT_DATASET_DIR = os.path.join(_PROJECT_ROOT, "data", "dataset").replace("\\", "/")
_DEFAULT_DW_DIR = os.path.join(_PROJECT_ROOT, "data", "data_warehouse").replace("\\", "/")


def run_pipeline(dataset_dir: str = _DEFAULT_DATASET_DIR, output_dir: str = _DEFAULT_DW_DIR):
    """Orchestrates the entire end-to-end DW-ETL pipeline."""
    spark = get_spark_session()
    try:
        raw_data = extract(spark, dataset_dir=dataset_dir)
        warehouse_tables = transform(raw_data)
        load(warehouse_tables, output_dir=output_dir)
    finally:
        spark.stop()


if __name__ == "__main__":
    # 0. Kích hoạt và kiểm tra môi trường JDK 17
    ensure_environment()

    # 1. Đảm bảo dữ liệu đã có sẵn hoặc tải từ Kaggle
    path = download_dataset(output_dir=_DEFAULT_DATASET_DIR)

    # 2. Thực thi pipeline Extract -> Transform -> Load
    run_pipeline(dataset_dir=path, output_dir=_DEFAULT_DW_DIR)
