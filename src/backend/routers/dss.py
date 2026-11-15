from typing import Any, Literal, Optional
from datetime import date
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, ValidationInfo, field_validator
import joblib
import pandas as pd
import re
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
MIN_SUPPORTED_DATE = date(1677, 9, 22)
MAX_SUPPORTED_DATE = date(2262, 4, 11)


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
    purchase_date: date = Field(ge=MIN_SUPPORTED_DATE, le=MAX_SUPPORTED_DATE, description="Purchase date in YYYY-MM-DD format")
    estimated_date: date = Field(ge=MIN_SUPPORTED_DATE, le=MAX_SUPPORTED_DATE, description="Estimated delivery date, on or after purchase_date")
    seller_id: str
    category: str
    n_items: int = Field(gt=0, strict=True, description="Positive integer item count")
    total_price: float = Field(ge=0, allow_inf_nan=False, description="Non-negative product price total")
    total_freight: float = Field(ge=0, allow_inf_nan=False, description="Non-negative freight total")
    total_weight_g: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    total_volume_cm3: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    max_dim_cm: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    c_lat: Optional[float] = None
    c_lng: Optional[float] = None
    c_state: str
    s_lat: Optional[float] = None
    s_lng: Optional[float] = None
    s_state: str

    @field_validator("purchase_date", "estimated_date", mode="before")
    @classmethod
    def parse_calendar_date(cls, value):
        if type(value) is date:
            return value
        if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
            raise ValueError("Ngày phải có định dạng YYYY-MM-DD.")
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise ValueError("Ngày không tồn tại trong lịch.") from None

    @field_validator("estimated_date")
    @classmethod
    def check_delivery_window(cls, value: date, info: ValidationInfo):
        purchase = info.data.get("purchase_date")
        if purchase is not None:
            days = (value - purchase).days
            if days < 0:
                raise ValueError("Ngày hẹn giao phải bằng hoặc sau ngày mua.")
            if days > pd.Timedelta.max.days:
                raise ValueError("Khoảng thời gian giao hàng vượt giới hạn hỗ trợ.")
        return value


class RiskThresholds(BaseModel):
    medium: float
    high: float


class LateDeliveryResponse(BaseModel):
    late_probability: float
    risk_tier: Literal["low", "medium", "high"]
    thresholds: RiskThresholds


class ForecastPoint(BaseModel):
    date: str
    forecast: float
    lo: float
    hi: float
    event: bool


class SalesForecastResponse(BaseModel):
    target: Literal["orders", "gmv"]
    horizon_days: int
    forecast: list[ForecastPoint]


class ExampleOrder(LateDeliveryRequest):
    actual_late: bool = Field(alias="_actual_late")


class ExampleOrdersResponse(BaseModel):
    examples: list[ExampleOrder]
    count: int


@router.post("/predict-late-delivery", response_model=LateDeliveryResponse)
def predict_late_delivery(req: LateDeliveryRequest):
    """
    Predicts the probability that an order will be delivered late
    (after the promised delivery date).
    """
    from dss.features import build_features  # noqa: deferred — needs sys.path patch above

    artefact = load_late_model()

    raw = pd.DataFrame([{
        "purchase_date": req.purchase_date.isoformat(),
        "estimated_date": req.estimated_date.isoformat(),
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
        "purchase_month": req.purchase_date.month,
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


@router.get("/sales-forecast", response_model=SalesForecastResponse)
def get_sales_forecast(target: Literal["orders", "gmv"] = Query("orders", description="Forecast target")):
    """
    Returns the 28-day sales forecast for orders or GMV.
    Target: 'orders' or 'gmv'
    """
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


@router.get("/sales-metrics", response_model=dict[str, Any])
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


@router.get("/late-delivery-metrics", response_model=dict[str, Any])
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


@router.get("/example-orders", response_model=ExampleOrdersResponse)
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
