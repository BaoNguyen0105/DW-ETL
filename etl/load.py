from pyspark.sql import DataFrame


def load(warehouse_tables: dict[str, DataFrame], output_dir: str = "data_warehouse"):
    """Write all Star Schema tables out as partitioned Parquet files."""
    print(f">>> [3/3] Loading Star Schema into '{output_dir}/' as Parquet...")

    for table_name, df in warehouse_tables.items():
        destination = f"{output_dir}/{table_name}"
        print(f"    - Writing {table_name} -> {destination}")
        df.write.mode("overwrite").parquet(destination)

    print(">>> ETL Pipeline successfully completed!")
