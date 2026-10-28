from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from database import get_db_connection

router = APIRouter()


class CustomQueryRequest(BaseModel):
    query: str


# ==============================================================================
# 1. KPI SUMMARY (Slice / Dice enabled)
# ==============================================================================
@router.get("/kpis")
def get_kpis(
    year: Optional[int] = Query(None, description="Filter by year (e.g., 2017, 2018)"),
    state: Optional[str] = Query(None, description="Filter by customer state (e.g., SP, RJ)"),
    category: Optional[str] = Query(None, description="Filter by product category"),
):
    """
    Returns headline KPI metrics for executive summary cards.
    Supports slicing by year, customer state, and product category.
    """
    con = get_db_connection()

    where_clauses = []
    if year:
        where_clauses.append(f"d.year = {year}")
    if state:
        where_clauses.append(f"c.customer_state = '{state.upper()}'")
    if category:
        where_clauses.append(f"p.product_category_name_english = '{category}'")

    where_str = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    sql = f"""
        SELECT 
            ROUND(COALESCE(SUM(f.total_item_value), 0), 2) AS total_revenue,
            COUNT(DISTINCT f.order_id) AS total_orders,
            COUNT(f.order_item_key) AS total_items,
            ROUND(COALESCE(AVG(f.review_score), 0), 2) AS avg_review_score,
            ROUND(
                100.0 * COUNT(CASE WHEN f.delivery_delay_days <= 0 THEN 1 END) / 
                NULLIF(COUNT(CASE WHEN f.delivery_delay_days IS NOT NULL THEN 1 END), 0),
                2
            ) AS on_time_rate
        FROM fact_order_items f
        LEFT JOIN dim_date d ON f.purchase_date_key = d.date_key
        LEFT JOIN dim_customer c ON f.customer_key = c.customer_key
        LEFT JOIN dim_product p ON f.product_key = p.product_key
        {where_str}
    """

    res = con.execute(sql).df().to_dict(orient="records")[0]
    con.close()
    return res


# ==============================================================================
# 2. SALES TREND (Roll-Up / Drill-Down enabled)
# ==============================================================================
@router.get("/sales-trend")
def get_sales_trend(
    interval: str = Query("month", description="Aggregation level: 'year', 'quarter', or 'month'"),
    year: Optional[int] = Query(None, description="Drill-down into a specific year"),
):
    """
    Demonstrates Roll-Up (Year/Quarter) and Drill-Down (Month).
    Returns chronological revenue and order volumes.
    """
    con = get_db_connection()

    where_clause = f"WHERE d.year = {year}" if year else ""

    if interval == "year":
        select_col = "d.year AS period"
        order_col = "d.year"
    elif interval == "quarter":
        select_col = "CONCAT(d.year, '-Q', d.quarter) AS period"
        order_col = "d.year, d.quarter"
    else:  # month
        select_col = "CONCAT(d.year, '-', LPAD(CAST(d.month AS VARCHAR), 2, '0')) AS period"
        order_col = "d.year, d.month"

    sql = f"""
        SELECT 
            {select_col},
            ROUND(SUM(f.total_item_value), 2) AS revenue,
            COUNT(DISTINCT f.order_id) AS order_count
        FROM fact_order_items f
        JOIN dim_date d ON f.purchase_date_key = d.date_key
        {where_clause}
        GROUP BY {order_col}, period
        ORDER BY {order_col}
    """

    data = con.execute(sql).df().to_dict(orient="records")
    con.close()
    return data


# ==============================================================================
# 3. TOP CATEGORIES (Merchandising Analysis)
# ==============================================================================
@router.get("/top-categories")
def get_top_categories(
    limit: int = Query(10, ge=1, le=50, description="Number of categories to return"),
    year: Optional[int] = Query(None, description="Filter by year"),
):
    """
    Returns the top selling product categories by revenue, items sold, and ratings.
    """
    con = get_db_connection()

    where_clause = f"WHERE d.year = {year}" if year else ""

    sql = f"""
        SELECT 
            p.product_category_name_english AS category,
            ROUND(SUM(f.total_item_value), 2) AS revenue,
            COUNT(f.order_item_key) AS items_sold,
            ROUND(AVG(f.review_score), 2) AS avg_review_score
        FROM fact_order_items f
        JOIN dim_product p ON f.product_key = p.product_key
        LEFT JOIN dim_date d ON f.purchase_date_key = d.date_key
        {where_clause}
        WHERE p.product_category_name_english IS NOT NULL
        GROUP BY p.product_category_name_english
        ORDER BY revenue DESC
        LIMIT {limit}
    """

    data = con.execute(sql).df().to_dict(orient="records")
    con.close()
    return data


# ==============================================================================
# 4. GEOGRAPHIC DISTRIBUTION (Regional Demand & Shipping Delays)
# ==============================================================================
@router.get("/geo-distribution")
def get_geo_distribution(
    year: Optional[int] = Query(None, description="Filter by year"),
):
    """
    Returns sales revenue, order counts, and delivery performance by Brazilian state.
    Used for choropleth map heatmaps and logistics DSS analysis.
    """
    con = get_db_connection()

    where_clause = f"WHERE d.year = {year}" if year else ""

    sql = f"""
        SELECT 
            c.customer_state AS state,
            ROUND(SUM(f.total_item_value), 2) AS revenue,
            COUNT(DISTINCT f.order_id) AS orders_count,
            ROUND(AVG(f.freight_value), 2) AS avg_freight,
            ROUND(AVG(f.delivery_delay_days), 2) AS avg_delay_days
        FROM fact_order_items f
        JOIN dim_customer c ON f.customer_key = c.customer_key
        LEFT JOIN dim_date d ON f.purchase_date_key = d.date_key
        {where_clause}
        GROUP BY c.customer_state
        ORDER BY revenue DESC
    """

    data = con.execute(sql).df().to_dict(orient="records")
    con.close()
    return data


# ==============================================================================
# 5. FILTER OPTIONS (Populates Dropdowns in Frontend)
# ==============================================================================
@router.get("/filters")
def get_filter_options():
    """
    Returns available years, customer states, and product categories
    to dynamically populate filter dropdowns in the frontend.
    """
    con = get_db_connection()

    years = [row[0] for row in con.execute("SELECT DISTINCT year FROM dim_date ORDER BY year").fetchall() if row[0]]
    states = [row[0] for row in con.execute("SELECT DISTINCT customer_state FROM dim_customer WHERE customer_state IS NOT NULL ORDER BY customer_state").fetchall()]
    categories = [row[0] for row in con.execute("SELECT DISTINCT product_category_name_english FROM dim_product WHERE product_category_name_english IS NOT NULL AND product_category_name_english != 'unknown' ORDER BY product_category_name_english").fetchall()]

    con.close()
    return {
        "years": years,
        "states": states,
        "categories": categories,
    }


# ==============================================================================
# 6. OLAP QUERY CONSOLE (Execute Custom / Template SQL)
# ==============================================================================
@router.post("/execute-query")
def execute_custom_query(req: CustomQueryRequest):
    """
    Executes a custom SQL query directly against the Star Schema
    and returns tabular data for the OLAP Query Console.
    """
    clean_query = req.query.strip()

    # Basic read-only safety guard
    lower_query = clean_query.lower()
    if any(keyword in lower_query for keyword in ["drop", "delete", "insert", "update", "alter"]):
        raise HTTPException(status_code=400, detail="Only read-only SELECT queries are permitted.")

    con = get_db_connection()
    try:
        df = con.execute(clean_query).df()
        columns = list(df.columns)
        records = df.to_dict(orient="records")
        return {
            "columns": columns,
            "data": records,
            "row_count": len(records),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        con.close()


# ==============================================================================
# 7. SAMPLE OLAP TEMPLATES (For Teacher / Demo Showcase)
# ==============================================================================
@router.get("/sample-queries")
def get_sample_queries():
    """
    Returns the textbook OLAP operation templates (Roll-up, Drill-down, Slice, Dice)
    for the interactive query interface.
    """
    return {
        "Roll-Up": {
            "description": "Roll up sales from daily line-items to annual revenue.",
            "sql": "SELECT d.year, ROUND(SUM(f.total_item_value), 2) AS total_revenue, COUNT(f.order_item_key) AS items_sold FROM fact_order_items f JOIN dim_date d ON f.purchase_date_key = d.date_key GROUP BY d.year ORDER BY d.year;",
        },
        "Drill-Down": {
            "description": "Drill down into monthly revenue and item counts for year 2017.",
            "sql": "SELECT d.year, d.month, d.month_name, ROUND(SUM(f.total_item_value), 2) AS revenue, COUNT(f.order_item_key) AS items_count FROM fact_order_items f JOIN dim_date d ON f.purchase_date_key = d.date_key WHERE d.year = 2017 GROUP BY d.year, d.month, d.month_name ORDER BY d.month;",
        },
        "Slice": {
            "description": "Slice data to only view orders delivered in the state of São Paulo (SP).",
            "sql": "SELECT c.customer_city, ROUND(SUM(f.total_item_value), 2) AS revenue, COUNT(DISTINCT f.order_id) AS orders FROM fact_order_items f JOIN dim_customer c ON f.customer_key = c.customer_key WHERE c.customer_state = 'SP' GROUP BY c.customer_city ORDER BY revenue DESC LIMIT 10;",
        },
        "Dice": {
            "description": "Dice multi-dimensional sub-cube: Health & Beauty products sold in 2018 in Rio de Janeiro (RJ).",
            "sql": "SELECT p.product_category_name_english, d.month_name, ROUND(SUM(f.total_item_value), 2) AS revenue FROM fact_order_items f JOIN dim_product p ON f.product_key = p.product_key JOIN dim_date d ON f.purchase_date_key = d.date_key JOIN dim_customer c ON f.customer_key = c.customer_key WHERE p.product_category_name_english = 'health_beauty' AND d.year = 2018 AND c.customer_state = 'RJ' GROUP BY p.product_category_name_english, d.month, d.month_name ORDER BY d.month;",
        },
    }
