from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import joblib
import pandas as pd
import sys
import os

router = APIRouter()

_HERE = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(os.path.dirname(_HERE))
_ARTIFACTS = os.path.join(_PROJECT_ROOT, "dss", "artifacts")

if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

MODEL_PATH = os.path.join(_ARTIFACTS, "model.joblib")
SALES_MODEL_PATH = os.path.join(_ARTIFACTS, "sales_model.joblib")
SALES_FORECAST_PATH = os.path.join(_ARTIFACTS, "sales_forecast.json")

_late_model = None
_sales_model = None


def load_late_model():
    global _late_model
    if _late_model is None:
        if not os.path.exists(MODEL_PATH):
            raise HTTPException(status_code=503, detail="Model not trained. Run dss_pipeline.py first.")
        _late_model = joblib.load(MODEL_PATH)
    return _late_model


def load_sales_model():
    global _sales_model
    if _sales_model is None:
        if not os.path.exists(SALES_MODEL_PATH):
            raise HTTPException(status_code=503, detail="Sales model not trained. Run dss_pipeline.py first.")
        _sales_model = joblib.load(SALES_MODEL_PATH)
    return _sales_model


class LateDeliveryRequest(BaseModel):
    purchase_date: str
    estimated_date: str
    seller_id: str
    category: str
    n_items: int
    total_price: float
    total_freight: float
    total_weight_g: Optional[float] = None
    total_volume_cm3: Optional[float] = None
    max_dim_cm: Optional[float] = None
    c_lat: Optional[float] = None
    c_lng: Optional[float] = None
    c_state: str
    s_lat: Optional[float] = None
    s_lng: Optional[float] = None
    s_state: str


@router.post("/predict-late-delivery")
def predict_late_delivery(req: LateDeliveryRequest):
    """
    Predicts the probability that an order will be delivered late
    (after the promised delivery date).
    """
    from dss.features import build_features  # noqa: deferred — needs sys.path patch above

    artefact = load_late_model()

    purchase = pd.to_datetime(req.purchase_date)
    raw = pd.DataFrame([{
        "purchase_date": req.purchase_date,
        "estimated_date": req.estimated_date,
        "seller_id": req.seller_id,
        "category": req.category,
        "n_items": req.n_items,
        "total_price": req.total_price,
        "total_freight": req.total_freight,
        "total_weight_g": req.total_weight_g,
        "total_volume_cm3": req.total_volume_cm3,
        "max_dim_cm": req.max_dim_cm,
        "c_lat": req.c_lat,
        "c_lng": req.c_lng,
        "c_state": req.c_state,
        "s_lat": req.s_lat,
        "s_lng": req.s_lng,
        "s_state": req.s_state,
        "purchase_month": purchase.month,
    }])

    X = build_features(raw, artefact["lookups"])
    proba = float(artefact["model"].predict_proba(X)[0, 1])

    tiers = artefact["tiers"]
    if proba >= tiers["high"]:
        risk = "high"
    elif proba >= tiers["medium"]:
        risk = "medium"
    else:
        risk = "low"

    return {
        "late_probability": round(proba, 4),
        "risk_tier": risk,
        "thresholds": tiers,
    }


@router.get("/sales-forecast")
def get_sales_forecast(target: str = "orders"):
    """
    Returns the 28-day sales forecast for orders or GMV.
    Target: 'orders' or 'gmv'
    """
    if target not in ["orders", "gmv"]:
        raise HTTPException(status_code=400, detail="Target must be 'orders' or 'gmv'")

    import json
    if not os.path.exists(SALES_FORECAST_PATH):
        raise HTTPException(status_code=503, detail="Forecast not available. Run dss_pipeline.py first.")

    with open(SALES_FORECAST_PATH) as f:
        forecasts = json.load(f)

    if target not in forecasts:
        raise HTTPException(status_code=404, detail=f"Target '{target}' not found")

    return {
        "target": target,
        "forecast": forecasts[target],
        "horizon_days": len(forecasts[target]),
    }


@router.get("/sales-metrics")
def get_sales_metrics():
    """
    Returns sales forecast model performance metrics.
    """
    import json
    metrics_path = os.path.join(_ARTIFACTS, "sales_metrics.json")

    if not os.path.exists(metrics_path):
        raise HTTPException(status_code=503, detail="Metrics not available. Run dss_pipeline.py first.")

    with open(metrics_path) as f:
        metrics = json.load(f)

    return metrics


@router.get("/late-delivery-metrics")
def get_late_delivery_metrics():
    """
    Returns late delivery model performance metrics.
    """
    import json
    metrics_path = os.path.join(_ARTIFACTS, "metrics.json")

    if not os.path.exists(metrics_path):
        raise HTTPException(status_code=503, detail="Metrics not available. Run dss_pipeline.py first.")

    with open(metrics_path) as f:
        metrics = json.load(f)

    return metrics


@router.get("/example-orders")
def get_example_orders():
    """
    Returns example orders for testing the late delivery prediction API.
    """
    import json
    examples_path = os.path.join(_ARTIFACTS, "example_orders.json")

    if not os.path.exists(examples_path):
        raise HTTPException(status_code=503, detail="Examples not available. Run dss_pipeline.py first.")

    with open(examples_path) as f:
        examples = json.load(f)

    return {"examples": examples, "count": len(examples)}