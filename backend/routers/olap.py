from typing import Any, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from database import get_db_connection

router = APIRouter()


class CustomQueryRequest(BaseModel):
    query: str


class KpiResponse(BaseModel):
    total_revenue: float
    total_orders: int
    total_items: int
    avg_review_score: Optional[float]
    on_time_rate: Optional[float]


class SalesTrendPoint(BaseModel):
    period: str
    revenue: float
    orders: int


class CategorySales(BaseModel):
    category: str
    revenue: float
    total_items: int
    avg_review_score: Optional[float]


class GeoSales(BaseModel):
    state: Optional[str]
    revenue: float
    orders: int
    avg_freight: Optional[float]
    avg_delay_days: Optional[float]


class FilterOptions(BaseModel):
    years: list[int]
    states: list[str]
    categories: list[str]


class CustomQueryResponse(BaseModel):
    columns: list[str]
    data: list[dict[str, Any]]
    row_count: int


class QueryTemplate(BaseModel):
    description: str
    sql: str


class DashboardFilters:
    """The same slice/dice filters are available on every dashboard chart."""

    def __init__(
        self,
        year: Optional[int] = Query(None, ge=1, le=9999, description="Purchase year"),
        state: Optional[str] = Query(None, pattern="^[A-Za-z]{2}$", description="Two-letter customer state, e.g. SP"),
        category: Optional[str] = Query(None, min_length=1, description="English product category from /filters"),
    ):
        self.year = year
        self.state = state.upper() if state is not None else None
        self.category = category


_FACT_JOINS = """
    FROM fact_order_items f
    LEFT JOIN dim_date d ON f.purchase_date_key = d.date_key
    LEFT JOIN dim_customer c ON f.customer_key = c.customer_key
    LEFT JOIN dim_product p ON f.product_key = p.product_key
"""


def _where(filters: DashboardFilters, *, require_category: bool = False):
    conditions, parameters = [], []
    for value, column in (
        (filters.year, "d.year"),
        (filters.state, "c.customer_state"),
        (filters.category, "p.product_category_name_english"),
    ):
        if value is not None:
            conditions.append(f"{column} = ?")
            parameters.append(value)
    if require_category:
        conditions.append("p.product_category_name_english IS NOT NULL")
    return ("WHERE " + " AND ".join(conditions) if conditions else ""), parameters


def _query(sql: str, parameters=None):
    con = get_db_connection()
    try:
        result = con.execute(sql, parameters or [])
        columns = [column[0] for column in result.description]
        # Native DuckDB values preserve SQL NULL as None instead of pandas NaN.
        records = [dict(zip(columns, row)) for row in result.fetchall()]
        return columns, records
    finally:
        con.close()


# ==============================================================================
# 1. KPI SUMMARY (Slice / Dice enabled)
# ==============================================================================
@router.get("/kpis", response_model=KpiResponse)
def get_kpis(
    filters: DashboardFilters = Depends(),
):
    """
    Returns headline KPI metrics for executive summary cards.
    Supports slicing by year, customer state, and product category.
    """
    where_str, parameters = _where(filters)

    sql = f"""
        SELECT 
            ROUND(COALESCE(SUM(f.total_item_value), 0), 2) AS total_revenue,
            COUNT(DISTINCT f.order_id) AS total_orders,
            COUNT(f.order_item_key) AS total_items,
            ROUND(AVG(f.review_score), 2) AS avg_review_score,
            ROUND(
                100.0 * COUNT(CASE WHEN f.delivery_delay_days <= 0 THEN 1 END) / 
                NULLIF(COUNT(CASE WHEN f.delivery_delay_days IS NOT NULL THEN 1 END), 0),
                2
            ) AS on_time_rate
        {_FACT_JOINS}
        {where_str}
    """

    return _query(sql, parameters)[1][0]


# ==============================================================================
# 2. SALES TREND (Roll-Up / Drill-Down enabled)
# ==============================================================================
@router.get("/sales-trend", response_model=list[SalesTrendPoint])
def get_sales_trend(
    granularity: Literal["month", "quarter", "year"] = Query("month", description="Time aggregation level"),
    filters: DashboardFilters = Depends(),
):
    """
    Demonstrates Roll-Up (Year/Quarter) and Drill-Down (Month).
    Returns chronological revenue and order volumes.
    """
    where_clause, parameters = _where(filters)

    if granularity == "year":
        select_col = "CAST(d.year AS VARCHAR) AS period"
        order_col = "d.year"
    elif granularity == "quarter":
        select_col = "CONCAT(d.year, '-Q', d.quarter) AS period"
        order_col = "d.year, d.quarter"
    else:  # month
        select_col = "CONCAT(d.year, '-', LPAD(CAST(d.month AS VARCHAR), 2, '0')) AS period"
        order_col = "d.year, d.month"

    sql = f"""
        SELECT 
            {select_col},
            ROUND(SUM(f.total_item_value), 2) AS revenue,
            COUNT(DISTINCT f.order_id) AS orders
        {_FACT_JOINS}
        {where_clause}
        GROUP BY {order_col}, period
        ORDER BY {order_col}
    """

    return _query(sql, parameters)[1]


# ==============================================================================
# 3. TOP CATEGORIES (Merchandising Analysis)
# ==============================================================================
@router.get("/top-categories", response_model=list[CategorySales])
def get_top_categories(
    limit: int = Query(10, ge=1, le=50, description="Number of categories to return"),
    by: Literal["revenue", "volume"] = Query("revenue", description="Rank by revenue or item volume"),
    filters: DashboardFilters = Depends(),
):
    """
    Returns the top selling product categories by revenue, items sold, and ratings.
    """
    where_clause, parameters = _where(filters, require_category=True)
    sort_column = "revenue" if by == "revenue" else "total_items"

    sql = f"""
        SELECT 
            p.product_category_name_english AS category,
            ROUND(SUM(f.total_item_value), 2) AS revenue,
            COUNT(f.order_item_key) AS total_items,
            ROUND(AVG(f.review_score), 2) AS avg_review_score
        {_FACT_JOINS}
        {where_clause}
        GROUP BY p.product_category_name_english
        ORDER BY {sort_column} DESC, category ASC
        LIMIT ?
    """

    return _query(sql, [*parameters, limit])[1]


# ==============================================================================
# 4. GEOGRAPHIC DISTRIBUTION (Regional Demand & Shipping Delays)
# ==============================================================================
@router.get("/geo-distribution", response_model=list[GeoSales])
def get_geo_distribution(
    filters: DashboardFilters = Depends(),
):
    """
    Returns sales revenue, order counts, and delivery performance by Brazilian state.
    Used for choropleth map heatmaps and logistics DSS analysis.
    """
    where_clause, parameters = _where(filters)

    sql = f"""
        SELECT 
            c.customer_state AS state,
            ROUND(SUM(f.total_item_value), 2) AS revenue,
            COUNT(DISTINCT f.order_id) AS orders,
            ROUND(AVG(f.freight_value), 2) AS avg_freight,
            ROUND(AVG(f.delivery_delay_days), 2) AS avg_delay_days
        {_FACT_JOINS}
        {where_clause}
        GROUP BY c.customer_state
        ORDER BY revenue DESC
    """

    return _query(sql, parameters)[1]


# ==============================================================================
# 5. FILTER OPTIONS (Populates Dropdowns in Frontend)
# ==============================================================================
@router.get("/filters", response_model=FilterOptions)
def get_filter_options():
    """
    Returns available years, customer states, and product categories
    to dynamically populate filter dropdowns in the frontend.
    """
    years = [row["year"] for row in _query("SELECT DISTINCT d.year FROM fact_order_items f JOIN dim_date d ON f.purchase_date_key = d.date_key WHERE d.year IS NOT NULL ORDER BY d.year")[1]]
    states = [row["customer_state"] for row in _query("SELECT DISTINCT customer_state FROM dim_customer WHERE customer_state IS NOT NULL ORDER BY customer_state")[1]]
    categories = [row["product_category_name_english"] for row in _query("SELECT DISTINCT product_category_name_english FROM dim_product WHERE product_category_name_english IS NOT NULL AND product_category_name_english != 'unknown' ORDER BY product_category_name_english")[1]]
    return {
        "years": years,
        "states": states,
        "categories": categories,
    }


# ==============================================================================
# 6. OLAP QUERY CONSOLE (Execute Custom / Template SQL)
# ==============================================================================
@router.post("/execute-query", response_model=CustomQueryResponse)
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

    try:
        columns, records = _query(clean_query)
        return {
            "columns": columns,
            "data": records,
            "row_count": len(records),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==============================================================================
# 7. SAMPLE OLAP TEMPLATES (For Teacher / Demo Showcase)
# ==============================================================================
@router.get("/sample-queries", response_model=dict[str, QueryTemplate])
def get_sample_queries():
    """
    Returns the textbook OLAP operation templates (Roll-up, Drill-down, Slice, Dice)
    for the interactive query interface.
    """
    return {
        "Roll-Up": {
            "description": "Roll up sales from daily line-items to annual revenue.",
            "sql": "SELECT d.year, ROUND(SUM(f.total_item_value), 2) AS total_revenue, COUNT(f.order_item_key) AS total_items FROM fact_order_items f JOIN dim_date d ON f.purchase_date_key = d.date_key GROUP BY d.year ORDER BY d.year;",
        },
        "Drill-Down": {
            "description": "Drill down into monthly revenue and item counts for year 2017.",
            "sql": "SELECT d.year, d.month, d.month_name, ROUND(SUM(f.total_item_value), 2) AS revenue, COUNT(f.order_item_key) AS total_items FROM fact_order_items f JOIN dim_date d ON f.purchase_date_key = d.date_key WHERE d.year = 2017 GROUP BY d.year, d.month, d.month_name ORDER BY d.month;",
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
