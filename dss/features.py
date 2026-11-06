import numpy as np
import pandas as pd

NUM_FEATURES = [
    "promised_days",        
    "total_price",          
    "total_freight",        
    "freight_ratio",        
    "total_weight_g",       
    "total_volume_cm3",     
    "max_dim_cm",           
    "n_items",              
    "distance_km",          
    "same_state",           
    "purchase_dow",         
    "purchase_month",       
    "seller_n_orders",      
    "seller_late_rate",     
    "seller_avg_review",    
]


CAT_FEATURES = [
    "customer_state",   
    "seller_state",     
    "category",         
]

FEATURES = NUM_FEATURES + CAT_FEATURES
MIN_CATEGORY_COUNT = 300
SMOOTHING_K = 10
REVIEW_LAG_DAYS = 7
DEFAULT_LATE_PRIOR = 0.10
DEFAULT_REVIEW_PRIOR = 3.0


def _timeline(known_at: pd.Series, values: pd.Series) -> dict:
    events = pd.DataFrame({"known_at": pd.to_datetime(known_at), "value": values})
    events = events.dropna().sort_values("known_at")
    return {
        "known_at": events["known_at"].to_numpy(dtype="datetime64[ns]"),
        "sum": events["value"].astype(float).cumsum().to_numpy(),
    }


def _past_totals(timeline: dict, dates: pd.Series):
    n = np.searchsorted(timeline["known_at"], pd.to_datetime(dates).to_numpy(dtype="datetime64[ns]"), side="left")
    total = np.zeros(len(n), dtype=float)
    has_history = n > 0
    total[has_history] = timeline["sum"][n[has_history] - 1]
    return n.astype(float), total


def build_history_lookups(df: pd.DataFrame) -> dict:
    """Index outcomes by availability, not by purchase date.

    Review timestamps are absent from the warehouse; delivery + 7 days is an
    explicit approximation. Missing scores never count as observed reviews.
    """
    def timelines(rows):
        delivered = pd.to_datetime(rows["delivered_date"])
        return {
            "late": _timeline(delivered, rows["late"]),
            "review": _timeline(delivered + pd.Timedelta(days=REVIEW_LAG_DAYS), rows["review_score"]),
        }

    return {
        "global_history": timelines(df),
        "seller_history": {seller: timelines(rows) for seller, rows in df.groupby("seller_id")},
        "smoothing_k": SMOOTHING_K,
    }


def historical_seller_features(raw: pd.DataFrame, lookups: dict) -> pd.DataFrame:
    dates = raw["purchase_date"]
    priors = {}
    for name, fallback in (("late", DEFAULT_LATE_PRIOR), ("review", DEFAULT_REVIEW_PRIOR)):
        n, total = _past_totals(lookups["global_history"][name], dates)
        priors[name] = np.divide(total, n, out=np.full(len(raw), fallback), where=n > 0)

    counts = {name: np.zeros(len(raw)) for name in ("late", "review")}
    totals = {name: np.zeros(len(raw)) for name in ("late", "review")}
    # Group positional indices, preserving the caller's index and row order.
    for seller, positions in raw.groupby("seller_id").indices.items():
        history = lookups["seller_history"].get(seller)
        if history is None:
            continue
        for name in ("late", "review"):
            counts[name][positions], totals[name][positions] = _past_totals(history[name], dates.iloc[positions])

    k = lookups.get("smoothing_k", SMOOTHING_K)
    return pd.DataFrame({
        "seller_n_orders": counts["late"],
        "seller_late_rate": laplace_smooth(totals["late"], counts["late"], priors["late"], k),
        "seller_avg_review": laplace_smooth(totals["review"], counts["review"], priors["review"], k),
    }, index=raw.index)

# ---------------------------------------------------------------------------
# Helper tinh khoang cach
# ---------------------------------------------------------------------------
def haversine_km(lat1, lon1, lat2, lon2) -> np.ndarray:
    """
    Great-circle distance in km between two coordinate pairs.
    Inputs are arrays (or scalars) in decimal degrees.
    """
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def laplace_smooth(total, n, prior, k=SMOOTHING_K):
    """
    (total + prior * k) / (n + k)

    Pull a seller's rate toward the platform average (`prior`)
    """
    return (total + prior * k) / (n + k)


def to_categorical(values: pd.Series, allowed: list, fallback: str) -> pd.Series:
    """
    Turn a text column into a Categorical with a FIXED list of categories.
    Anything not in `allowed` (including NaN) becomes `fallback`.
    """
    cleaned = values.where(values.isin(allowed), other=fallback)
    return pd.Series(pd.Categorical(cleaned, categories=allowed), index=values.index)


def to_number(values: pd.Series) -> pd.Series:
    """Force a column to float (None / bad text -> NaN."""
    return pd.to_numeric(values, errors="coerce").astype(float)


# ---------------------------------------------------------------------------
# Feature engineer
# ---------------------------------------------------------------------------
def delivery_window_features(raw: pd.DataFrame) -> pd.DataFrame:
    """How many days did the seller/carrier promise for delivery?"""
    purchase  = pd.to_datetime(raw["purchase_date"])
    estimated = pd.to_datetime(raw["estimated_date"])
    return pd.DataFrame({
        "promised_days": (estimated - purchase).dt.total_seconds() / 86_400.0,
    }, index=raw.index)


def financial_features(raw: pd.DataFrame) -> pd.DataFrame:
    """Order value, shipping cost, and how much of the price goes to shipping."""
    price   = to_number(raw["total_price"])
    freight = to_number(raw["total_freight"])
    return pd.DataFrame({
        "total_price":   price,
        "total_freight": freight,
        "freight_ratio": freight / price.clip(lower=1.0),
    }, index=raw.index)


def physical_features(raw: pd.DataFrame) -> pd.DataFrame:
    """Size and weight of the parcel (heavier / bigger = harder to ship)."""
    return pd.DataFrame({
        "total_weight_g":   to_number(raw["total_weight_g"]),
        "total_volume_cm3": to_number(raw["total_volume_cm3"]),
        "max_dim_cm":       to_number(raw["max_dim_cm"]),
        "n_items":          to_number(raw["n_items"]),
    }, index=raw.index)


def geography_features(raw: pd.DataFrame) -> pd.DataFrame:
    """Seller -> customer distance and whether they are in the same state."""
    distance = haversine_km(
        to_number(raw["c_lat"]).values, to_number(raw["c_lng"]).values,
        to_number(raw["s_lat"]).values, to_number(raw["s_lng"]).values,
    )

    c_state, s_state = raw["c_state"], raw["s_state"]
    both_known = c_state.notna() & s_state.notna()
    same_state = (c_state == s_state).astype(float).where(both_known)   # NaN if unknown

    return pd.DataFrame({
        "distance_km": distance,
        "same_state":  same_state,
    }, index=raw.index)


def temporal_features(raw: pd.DataFrame) -> pd.DataFrame:
    """
    Process datetime attributes
    """
    purchase = pd.to_datetime(raw["purchase_date"])
    return pd.DataFrame({
        "purchase_dow":   purchase.dt.dayofweek,          
        "purchase_month": to_number(raw["purchase_month"]),
    }, index=raw.index)


def seller_features(raw: pd.DataFrame, lookups: dict) -> pd.DataFrame:
    """
    Seller reliability.

    Training passes through features computed strictly before each purchase.
    New serving artifacts use the same availability-indexed histories.
    """
    cols = ["seller_n_orders", "seller_late_rate", "seller_avg_review"]

    if "seller_n_orders" in raw.columns:                       # training path
        return raw[cols].astype(float)

    if "seller_history" in lookups:
        return historical_seller_features(raw, lookups)

    # Compatibility with older artifacts until the refreshed model is loaded.
    stats = lookups["seller_stats"].reindex(raw["seller_id"].values)   # serving path
    n     = stats["n"].fillna(0).values
    k     = lookups.get("smoothing_k", SMOOTHING_K)
    avg   = lookups["global_rates"]

    return pd.DataFrame({
        "seller_n_orders":   n,
        "seller_late_rate":  laplace_smooth(stats["late_sum"].fillna(0).values,   n, avg["late"],   k),
        "seller_avg_review": laplace_smooth(stats["review_sum"].fillna(0).values, n, avg["review"], k),
    }, index=raw.index)


def categorical_features(raw: pd.DataFrame, lookups: dict) -> pd.DataFrame:
    """States and product category, with a fixed list of allowed values."""
    allowed = lookups["categories"]
    return pd.DataFrame({
        "customer_state": to_categorical(raw["c_state"],  allowed["customer_state"], "UNK"),
        "seller_state":   to_categorical(raw["s_state"],  allowed["seller_state"],   "UNK"),
        "category":       to_categorical(raw["category"], allowed["category"],       "other"),
    }, index=raw.index)

# Function tong hop
def build_features(df: pd.DataFrame, lookups: dict) -> pd.DataFrame:
    parts = [
        delivery_window_features(df),
        financial_features(df),
        physical_features(df),
        geography_features(df),
        temporal_features(df),
        seller_features(df, lookups),
        categorical_features(df, lookups),
    ]
    return pd.concat(parts, axis=1)[FEATURES]
