import os
import duckdb

# Determine the absolute path to data_warehouse/
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
DW_DIR = os.path.join(PROJECT_ROOT, "data_warehouse").replace("\\", "/")


def get_db_connection() -> duckdb.DuckDBPyConnection:
    """
    Creates an in-memory DuckDB connection and registers views
    directly over the Parquet files in data_warehouse/.
    """
    con = duckdb.connect(database=":memory:")

    # Register Star Schema views over Parquet partitions
    con.execute(f"CREATE OR REPLACE VIEW fact_order_items AS SELECT * FROM '{DW_DIR}/fact_order_items/*.parquet'")
    con.execute(f"CREATE OR REPLACE VIEW dim_customer AS SELECT * FROM '{DW_DIR}/dim_customer/*.parquet'")
    con.execute(f"CREATE OR REPLACE VIEW dim_seller AS SELECT * FROM '{DW_DIR}/dim_seller/*.parquet'")
    con.execute(f"CREATE OR REPLACE VIEW dim_product AS SELECT * FROM '{DW_DIR}/dim_product/*.parquet'")
    con.execute(f"CREATE OR REPLACE VIEW dim_date AS SELECT * FROM '{DW_DIR}/dim_date/*.parquet'")

    return con
