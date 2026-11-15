import os
from pyspark.sql import DataFrame

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC_DIR = os.path.dirname(_HERE)
_PROJECT_ROOT = os.path.dirname(_SRC_DIR)
_DEFAULT_DW_DIR = os.path.join(_PROJECT_ROOT, "data", "data_warehouse").replace("\\", "/")


def load(warehouse_tables: dict[str, DataFrame], output_dir: str = _DEFAULT_DW_DIR):
    """Write all Star Schema tables out as partitioned Parquet files."""
    if not os.path.isabs(output_dir):
        if output_dir in ("data_warehouse", "data/data_warehouse"):
            output_dir = _DEFAULT_DW_DIR
        else:
            output_dir = os.path.join(_PROJECT_ROOT, output_dir).replace("\\", "/")

    print(f">>> [3/3] Loading Star Schema into '{output_dir}/' as Parquet...")

    for table_name, df in warehouse_tables.items():
        destination = f"{output_dir}/{table_name}"
        print(f"    - Writing {table_name} -> {destination}")
        df.write.mode("overwrite").parquet(destination)

    print(">>> ETL Pipeline successfully completed!")
