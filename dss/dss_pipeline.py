import json
import os
import duckdb
import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from dss.features import FEATURES, MIN_CATEGORY_COUNT, SMOOTHING_K, build_features, laplace_smooth

_HERE = os.path.dirname(os.path.abspath(__file__))
_WAREHOUSE = os.path.join(os.path.dirname(_HERE), "data_warehouse")

OUT_DIR = os.path.join(_HERE, "artifacts")
os.makedirs(OUT_DIR, exist_ok=True)

MODEL_PATH = os.path.join(OUT_DIR, "model.joblib")
METRICS_PATH = os.path.join(OUT_DIR, "metrics.json")
EXAMPLES_PATH = os.path.join(OUT_DIR, "example_orders.json")
SALES_MODEL_PATH = os.path.join(OUT_DIR, "sales_model.joblib")
SALES_METRICS_PATH = os.path.join(OUT_DIR, "sales_metrics.json")
SALES_FORECAST_PATH = os.path.join(OUT_DIR, "sales_forecast.json")

TRAIN_END = "2018-05-01"
VALID_END = "2018-07-01"
REVIEW_LAG_DAYS = 7
BACKTEST_START = "2017-09"
BACKTEST_END = "2018-08"
BASELINE_COLS = ["promised_days", "distance_km"]

PARAMS = dict(
    objective="binary",
    learning_rate=0.03,
    num_leaves=15,
    min_child_samples=200,
    subsample=0.8,
    subsample_freq=1,
    colsample_bytree=0.7,
    reg_lambda=20.0,
    n_estimators=3000,
    random_state=42,
    verbose=-1,
)

SALES_TARGETS = ["orders", "gmv"]
HORIZON = 28
SALES_BACKTEST_START = "2017-09-01"
HISTORY_DAYS = 140
LEVEL_DAYS = 28
PROFILE_DAYS = 84
MIN_ORIGIN = 55
EVENT_BEFORE = 1
EVENT_AFTER = 6
LGBM_FEATURES = ["h", "r7", "r14", "trend", "same_dow", "dow"]

SALES_PARAMS = dict(
    objective="l1",
    learning_rate=0.03,
    num_leaves=7,
    min_child_samples=50,
    subsample=0.8,
    subsample_freq=1,
    colsample_bytree=0.8,
    reg_lambda=10.0,
    n_estimators=300,
    random_state=42,
    verbose=-1,
)


def load_data() -> pd.DataFrame:
    SQL = f"""
    SELECT
        f.order_id,
        f.order_item_id,
        s.seller_id,
        f.delivery_delay_days,
        f.review_score,
        dp.full_date AS purchase_date,
        de.full_date AS estimated_date,
        df.full_date AS delivered_date,
        f.price AS item_price,
        f.freight_value AS item_freight,
        p.product_weight_g,
        p.product_length_cm,
        p.product_height_cm,
        p.product_width_cm,
        p.product_photos_qty,
        p.product_category_name_english AS category,
        dp.month AS purchase_month,
        c.customer_state AS c_state,
        c.latitude AS c_lat,
        c.longitude AS c_lng,
        s.seller_state AS s_state,
        s.latitude AS s_lat,
        s.longitude AS s_lng
    FROM '{_WAREHOUSE}/fact_order_items/*.parquet' f
    JOIN '{_WAREHOUSE}/dim_product/*.parquet' p ON f.product_key = p.product_key
    JOIN '{_WAREHOUSE}/dim_customer/*.parquet' c ON f.customer_key = c.customer_key
    JOIN '{_WAREHOUSE}/dim_seller/*.parquet' s ON f.seller_key = s.seller_key
    JOIN '{_WAREHOUSE}/dim_date/*.parquet' dp ON f.purchase_date_key = dp.date_key
    JOIN '{_WAREHOUSE}/dim_date/*.parquet' de ON f.estimated_date_key = de.date_key
    LEFT JOIN '{_WAREHOUSE}/dim_date/*.parquet' df ON f.delivered_date_key = df.date_key
    WHERE f.order_status = 'delivered'
    AND f.delivery_delay_days IS NOT NULL
    """
    print("Load data ...")
    con = duckdb.connect()
    items_df = con.execute(SQL).df()
    con.close()
    print(f"        {len(items_df):,} order-item rows loaded")
    return items_df


def build_order_table(items_df: pd.DataFrame) -> pd.DataFrame:
    print("Build order table ...")
    items_df["volume_cm3"] = (
        items_df["product_length_cm"].fillna(0)
        * items_df["product_height_cm"].fillna(0)
        * items_df["product_width_cm"].fillna(0)
    )
    items_df["max_dim_cm"] = items_df[
        ["product_length_cm", "product_height_cm", "product_width_cm"]
    ].max(axis=1)

    top_item = items_df.sort_values("item_price", ascending=False).groupby("order_id")
    first_item = items_df.sort_values("order_item_id").groupby("order_id")

    from_top = top_item[["category"]].first()
    from_first = first_item[["seller_id", "s_state", "s_lat", "s_lng"]].first()

    totals = items_df.groupby("order_id").agg(
        n_items=("order_item_id", "count"),
        total_price=("item_price", "sum"),
        total_freight=("item_freight", "sum"),
        total_weight_g=("product_weight_g", "sum"),
        total_volume_cm3=("volume_cm3", "sum"),
        max_dim_cm=("max_dim_cm", "max"),
        c_state=("c_state", "first"),
        c_lat=("c_lat", "first"),
        c_lng=("c_lng", "first"),
        purchase_date=("purchase_date", "first"),
        purchase_month=("purchase_month", "first"),
        estimated_date=("estimated_date", "first"),
        delivered_date=("delivered_date", "first"),
        delivery_delay_days=("delivery_delay_days", "max"),
        review_score=("review_score", "mean"),
    )

    df = totals.join(from_top).join(from_first).reset_index()
    df["purchase_date"] = pd.to_datetime(df["purchase_date"])
    df["delivered_date"] = pd.to_datetime(df["delivered_date"])
    df = df.sort_values("purchase_date").reset_index(drop=True)
    print(f"        {len(df):,} orders")
    return df


def add_target(df: pd.DataFrame) -> pd.DataFrame:
    df["late"] = (df["delivery_delay_days"] > 0).astype(int)
    print(f"        Late rate: {df['late'].mean():.1%}")
    return df


def global_rates(df: pd.DataFrame) -> dict:
    return {
        "late": float(df["late"].mean()),
        "review": float(df["review_score"].fillna(3.0).mean()),
    }


def past_seller_stats(df: pd.DataFrame, value_col: str, lag_days: int = 0):
    counts = np.zeros(len(df))
    sums = np.zeros(len(df))
    lag = pd.Timedelta(days=lag_days)

    for _, group in df.groupby("seller_id"):
        idx = group.index.values
        known_at = (group["delivered_date"] + lag).values
        values = group[value_col].values.astype(float)
        purchased = group["purchase_date"].values

        was_known = known_at[None, :] < purchased[:, None]
        counts[idx] = was_known.sum(axis=1)
        sums[idx] = was_known @ values
    return counts, sums


def add_seller_history(df: pd.DataFrame) -> pd.DataFrame:
    print("Add seller history ...")
    avg = global_rates(df)
    df["review_filled"] = df["review_score"].fillna(avg["review"])

    n_late, sum_late = past_seller_stats(df, "late", lag_days=0)
    n_rev, sum_rev = past_seller_stats(df, "review_filled", lag_days=REVIEW_LAG_DAYS)

    df["seller_n_orders"] = n_late
    df["seller_late_rate"] = laplace_smooth(sum_late, n_late, avg["late"])
    df["seller_avg_review"] = laplace_smooth(sum_rev, n_rev, avg["review"])
    print(f"        Orders with seller history: {(n_late > 0).sum():,}")
    return df


def build_lookups(df: pd.DataFrame) -> dict:
    seller_stats = df.groupby("seller_id").agg(
        n=("late", "size"),
        late_sum=("late", "sum"),
        review_sum=("review_filled", "sum"),
    )

    cat_counts = df["category"].value_counts()
    valid_categories = sorted(cat_counts[cat_counts >= MIN_CATEGORY_COUNT].index.tolist())
    valid_categories.append("other")

    lookups = {
        "seller_stats": seller_stats,
        "global_rates": global_rates(df),
        "smoothing_k": SMOOTHING_K,
        "categories": {
            "customer_state": sorted(df["c_state"].dropna().unique().tolist()) + ["UNK"],
            "seller_state": sorted(df["s_state"].dropna().unique().tolist()) + ["UNK"],
            "category": valid_categories,
        },
    }
    print(f"        {len(seller_stats):,} sellers, {len(valid_categories) - 1} categories")
    return lookups


def split_by_time(when: pd.Series):
    is_train = (when < TRAIN_END).values
    is_valid = ((when >= TRAIN_END) & (when < VALID_END)).values
    is_test = (when >= VALID_END).values
    print(f"        Train/Valid/Test: {is_train.sum():,}/{is_valid.sum():,}/{is_test.sum():,}")
    return is_train, is_valid, is_test


def train_model(X, y, is_train, is_valid):
    model = lgb.LGBMClassifier(**PARAMS)
    model.fit(
        X[is_train], y[is_train],
        eval_X=X[is_valid], eval_y=y[is_valid],
        eval_metric="auc",
        callbacks=[lgb.early_stopping(100, verbose=False)],
    )
    print(f"        Best iteration: {model.best_iteration_}")
    return model


def score_set(y, mask, proba) -> dict:
    return {
        "n": int(mask.sum()),
        "late_rate": round(float(y[mask].mean()), 4),
        "roc_auc": round(float(roc_auc_score(y[mask], proba)), 4),
        "pr_auc": round(float(average_precision_score(y[mask], proba)), 4),
    }


def baseline_inputs(X: pd.DataFrame) -> pd.DataFrame:
    return X[BASELINE_COLS].fillna(X[BASELINE_COLS].median())


def evaluate(model, X, y, is_train, is_valid, is_test) -> dict:
    Xb = baseline_inputs(X)
    baseline = LogisticRegression(max_iter=500).fit(Xb[is_train], y[is_train])

    metrics = {
        "validation": score_set(y, is_valid, model.predict_proba(X[is_valid])[:, 1]),
        "test": score_set(y, is_test, model.predict_proba(X[is_test])[:, 1]),
        "baseline": score_set(y, is_test, baseline.predict_proba(Xb[is_test])[:, 1]),
    }
    print(f"        Valid AUC: {metrics['validation']['roc_auc']:.4f}")
    print(f"        Test AUC: {metrics['test']['roc_auc']:.4f}")
    print(f"        Baseline AUC: {metrics['baseline']['roc_auc']:.4f}")
    return metrics


def run_backtest(X, y, when, final_params):
    Xb = baseline_inputs(X)
    all_pred, all_actual, by_month = [], [], []

    for month in pd.period_range(BACKTEST_START, BACKTEST_END, freq="M"):
        before = (when < month.start_time).values
        this_month = ((when >= month.start_time) & (when < (month + 1).start_time)).values

        if before.sum() < 200 or this_month.sum() < 10:
            continue

        m_lgbm = lgb.LGBMClassifier(**final_params).fit(X[before], y[before])
        m_base = LogisticRegression(max_iter=500).fit(Xb[before], y[before])

        pred_lgbm = m_lgbm.predict_proba(X[this_month])[:, 1]
        pred_base = m_base.predict_proba(Xb[this_month])[:, 1]

        by_month.append({
            "month": str(month),
            "n": int(this_month.sum()),
            "late_rate": round(float(y[this_month].mean()), 3),
            "lgbm_auc": round(float(roc_auc_score(y[this_month], pred_lgbm)), 3),
            "baseline_auc": round(float(roc_auc_score(y[this_month], pred_base)), 3),
        })
        all_pred.append(pred_lgbm)
        all_actual.append(y[this_month])

    all_pred = np.concatenate(all_pred)
    all_actual = np.concatenate(all_actual)
    bt = pd.DataFrame(by_month)

    summary = {
        "by_month": by_month,
        "mean_auc": round(float(bt["lgbm_auc"].mean()), 3),
        "min_auc": round(float(bt["lgbm_auc"].min()), 3),
        "max_auc": round(float(bt["lgbm_auc"].max()), 3),
        "baseline_mean": round(float(bt["baseline_auc"].mean()), 3),
    }
    print(f"        Backtest mean AUC: {summary['mean_auc']:.3f}")
    return summary, all_pred, all_actual


def make_risk_tiers(all_pred, all_actual):
    high_cut = float(np.quantile(all_pred, 0.90))
    medium_cut = float(np.quantile(all_pred, 0.65))

    tier_table = {}
    for name, lo, hi in [("low", -1, medium_cut), ("medium", medium_cut, high_cut), ("high", high_cut, 2)]:
        in_tier = (all_pred >= lo) & (all_pred < hi)
        tier_table[name] = {
            "share": round(float(in_tier.mean()), 3),
            "late_rate": round(float(all_actual[in_tier].mean()), 3),
            "lift": round(float(all_actual[in_tier].mean() / all_actual.mean()), 2),
        }
    print(f"        Risk tiers computed")
    return tier_table, {"medium": medium_cut, "high": high_cut}


def fit_final_model(X, y, final_params):
    model = lgb.LGBMClassifier(**final_params).fit(X, y)
    importance = pd.Series(model.booster_.feature_importance("gain"), index=FEATURES)
    importance_pct = (100 * importance / importance.sum()).round(1).sort_values(ascending=False)
    return model, importance_pct.to_dict()


def save_late_artifacts(model, lookups, metrics):
    artefact = {
        "model": model,
        "lookups": lookups,
        "tiers": metrics["tier_thresholds"],
        "features": FEATURES,
    }
    joblib.dump(artefact, MODEL_PATH)
    print(f"        Model saved → {MODEL_PATH}")

    with open(METRICS_PATH, "w") as fh:
        json.dump(metrics, fh, indent=2)
    print(f"        Metrics saved → {METRICS_PATH}")


def _num(value):
    return None if pd.isna(value) else float(value)


def save_examples(df, is_test):
    sample = df[is_test].sample(5, random_state=1)
    examples = []
    for row in sample.itertuples(index=False):
        examples.append({
            "purchase_date": str(row.purchase_date)[:10],
            "estimated_date": str(row.estimated_date)[:10],
            "seller_id": row.seller_id,
            "category": row.category,
            "n_items": int(row.n_items),
            "total_price": float(row.total_price),
            "total_freight": float(row.total_freight),
            "total_weight_g": _num(row.total_weight_g),
            "total_volume_cm3": _num(row.total_volume_cm3),
            "max_dim_cm": _num(row.max_dim_cm),
            "c_lat": _num(row.c_lat),
            "c_lng": _num(row.c_lng),
            "c_state": row.c_state,
            "s_lat": _num(row.s_lat),
            "s_lng": _num(row.s_lng),
            "s_state": row.s_state,
            "_actual_late": bool(row.late),
        })

    with open(EXAMPLES_PATH, "w") as fh:
        json.dump(examples, fh, indent=2)
    print(f"        Examples saved → {EXAMPLES_PATH}")


def load_daily_sales() -> pd.DataFrame:
    SQL = f"""
    SELECT
        dp.full_date AS date,
        COUNT(DISTINCT f.order_id) AS orders,
        SUM(f.price) AS gmv
    FROM '{_WAREHOUSE}/fact_order_items/*.parquet' f
    JOIN '{_WAREHOUSE}/dim_date/*.parquet' dp ON f.purchase_date_key = dp.date_key
    WHERE f.order_status NOT IN ('canceled', 'unavailable')
    GROUP BY dp.full_date
    ORDER BY dp.full_date
    """
    print("Load daily sales ...")
    con = duckdb.connect()
    daily = con.execute(SQL).df()
    con.close()
    print(f"        {len(daily):,} days loaded")
    return daily


def prepare_series(daily: pd.DataFrame, target: str) -> pd.Series:
    s = daily.set_index(pd.to_datetime(daily["date"]))[target].astype(float)
    return s.asfreq("D").fillna(0.0)


def black_friday(year: int) -> pd.Timestamp:
    november = pd.date_range(f"{year}-11-01", f"{year}-11-30")
    return november[november.day_of_week == 4][3]


def event_offsets(dates: pd.DatetimeIndex) -> np.ndarray:
    offset = np.full(len(dates), np.nan)
    for year in range(dates.min().year, dates.max().year + 1):
        diff = np.asarray((dates - black_friday(year)).days)
        inside = (diff >= -EVENT_BEFORE) & (diff <= EVENT_AFTER)
        offset[inside] = diff[inside]
    return offset


def weekday_profile(y: pd.Series) -> pd.Series:
    recent = y.iloc[-PROFILE_DAYS:]
    profile = recent.groupby(recent.index.day_of_week).mean()
    return profile / profile.mean()


def neutralise_events(y: pd.Series) -> pd.Series:
    clean = y.copy()
    offset = event_offsets(y.index)
    for i in np.where(~np.isnan(offset))[0]:
        start = i - int(offset[i] + EVENT_BEFORE)
        if start < 28:
            continue
        before = y.iloc[:start]
        clean.iloc[i] = before.iloc[-14:].mean() * weekday_profile(before)[y.index[i].day_of_week]
    return clean


def event_uplift(raw: pd.Series, clean: pd.Series) -> dict:
    offset = event_offsets(raw.index)
    inside = ~np.isnan(offset)
    if not inside.any():
        return {}
    ratio = (raw[inside] / clean[inside]).groupby(offset[inside]).mean()
    return {int(k): float(v) for k, v in ratio.items()}


def forecast_seasonal_naive(y, dates, model=None):
    steps = np.asarray((dates - y.index[-1]).days)
    first = np.ceil(steps / 7).astype(int)
    back = [y.reindex(dates - pd.to_timedelta(7 * (first + j), "D")).values for j in range(4)]
    return np.mean(back, axis=0)


def forecast_level_dow(y, dates, model=None):
    return y.iloc[-LEVEL_DAYS:].mean() * weekday_profile(y).reindex(dates.day_of_week).values


def lgbm_features(y: pd.Series, origins: np.ndarray, h: int) -> pd.DataFrame:
    v = y.values
    mean = {w: y.rolling(w).mean().values[origins] for w in (7, 14, 28, 56)}
    first = int(np.ceil(h / 7))
    same = np.mean([v[origins + h - 7 * (first + j)] for j in range(4)], axis=0)
    dates = y.index[0] + pd.to_timedelta(origins + h, "D")
    level = mean[28]
    with np.errstate(invalid="ignore", divide="ignore"):
        r7 = np.where(level > 0, mean[7] / level, np.nan)
        r14 = np.where(level > 0, mean[14] / level, np.nan)
        trend = np.where(mean[56] > 0, level / mean[56], np.nan)
        same_dow = np.where(level > 0, same / level, np.nan)
    return pd.DataFrame({
        "h": h,
        "level": level,
        "r7": r7,
        "r14": r14,
        "trend": trend,
        "same_dow": same_dow,
        "dow": dates.day_of_week,
    })


def fit_lgbm_sales(y):
    rows = []
    for h in range(1, HORIZON + 1):
        origins = np.arange(MIN_ORIGIN, len(y) - h)
        X = lgbm_features(y, origins, h)
        X["ratio"] = y.values[origins + h] / X["level"]
        rows.append(X)
    data = pd.concat(rows, ignore_index=True)
    return lgb.LGBMRegressor(**SALES_PARAMS).fit(data[LGBM_FEATURES], data["ratio"])


def forecast_lgbm(y, dates, model):
    origin = np.array([len(y) - 1])
    X = pd.concat([lgbm_features(y, origin, h) for h in range(1, len(dates) + 1)], ignore_index=True)
    return model.predict(X[LGBM_FEATURES]) * X["level"].values


SALES_CANDIDATES = {
    "seasonal_naive": (lambda y: None, forecast_seasonal_naive),
    "level_dow": (lambda y: None, forecast_level_dow),
    "lgbm_ratio": (fit_lgbm_sales, forecast_lgbm),
}


def run_sales_backtest(raw: pd.Series, clean: pd.Series):
    is_event = ~np.isnan(event_offsets(raw.index))
    first = raw.index.get_loc(pd.Timestamp(SALES_BACKTEST_START))
    stats = {name: dict(err=0.0, actual=0.0, bias=0.0, week_err=0.0, week_actual=0.0, fold=[]) for name in SALES_CANDIDATES}
    ratios = {name: [] for name in SALES_CANDIDATES}

    for origin in range(first, len(raw) - HORIZON, 28):
        history = clean.iloc[:origin + 1]
        dates = raw.index[origin + 1:origin + 1 + HORIZON]
        actual = raw.values[origin + 1:origin + 1 + HORIZON]
        keep = ~is_event[origin + 1:origin + 1 + HORIZON]
        if not keep.any():
            continue

        for name, (fit, predict) in SALES_CANDIDATES.items():
            pred = np.clip(predict(history, dates, fit(history)), 0, None)
            err = np.abs(actual - pred)[keep]

            week_ok = keep.reshape(-1, 7).all(axis=1)
            week_a = actual.reshape(-1, 7).sum(axis=1)[week_ok]
            week_p = pred.reshape(-1, 7).sum(axis=1)[week_ok]

            s = stats[name]
            s["err"] += err.sum()
            s["actual"] += actual[keep].sum()
            s["bias"] += (pred - actual)[keep].sum()
            s["week_err"] += np.abs(week_a - week_p).sum()
            s["week_actual"] += week_a.sum()
            s["fold"].append(err.sum() / actual[keep].sum())
            ratios[name].append(actual[keep] / np.clip(pred[keep], 1e-9, None))

    summary = {}
    for name, s in stats.items():
        summary[name] = {
            "daily_wape": round(float(s["err"] / s["actual"]), 3),
            "weekly_wape": round(float(s["week_err"] / s["week_actual"]), 3),
            "bias_pct": round(float(100 * s["bias"] / s["actual"]), 1),
            "median_fold_wape": round(float(np.median(s["fold"])), 3),
            "n_folds": len(s["fold"]),
        }
    print(f"        Best model by daily WAPE")
    return summary, {name: np.concatenate(r) for name, r in ratios.items()}


def choose_sales_model(summary: dict) -> str:
    chosen = min(summary, key=lambda name: summary[name]["daily_wape"])
    print(f"        Chosen: {chosen}")
    return chosen


def make_interval(ratio: np.ndarray) -> dict:
    return {"lo": round(float(np.quantile(ratio, 0.10)), 3), "hi": round(float(np.quantile(ratio, 0.90)), 3)}


def forecast_sales(artefact: dict, history: pd.Series = None, horizon: int = HORIZON) -> pd.DataFrame:
    history = artefact["history"] if history is None else history
    dates = pd.date_range(history.index[-1] + pd.Timedelta(days=1), periods=horizon)
    predict = SALES_CANDIDATES[artefact["name"]][1]
    base = np.clip(predict(history, dates, artefact["model"]), 0, None)

    offset = event_offsets(dates)
    uplift = np.array([artefact["event_uplift"].get(int(o), 1.0) if not np.isnan(o) else 1.0 for o in offset])
    point = base * uplift

    return pd.DataFrame({
        "date": dates.strftime("%Y-%m-%d"),
        "forecast": point.round(1),
        "lo": (point * artefact["interval"]["lo"]).round(1),
        "hi": (point * artefact["interval"]["hi"]).round(1),
        "event": ~np.isnan(offset),
    })


def save_sales_artifacts(artefacts, metrics, forecasts):
    joblib.dump(artefacts, SALES_MODEL_PATH)
    print(f"        Sales model saved → {SALES_MODEL_PATH}")

    with open(SALES_METRICS_PATH, "w") as fh:
        json.dump(metrics, fh, indent=2)
    print(f"        Sales metrics saved → {SALES_METRICS_PATH}")

    with open(SALES_FORECAST_PATH, "w") as fh:
        json.dump({t: f.to_dict(orient="records") for t, f in forecasts.items()}, fh, indent=2)
    print(f"        Sales forecast saved → {SALES_FORECAST_PATH}")


def run_late_delivery_pipeline():
    print("\n" + "=" * 60)
    print("LATE DELIVERY PREDICTION PIPELINE")
    print("=" * 60)

    print("\nSTEP 1-5  Preparing data ...")
    df = add_target(build_order_table(load_data()))
    df = add_seller_history(df)
    lookups = build_lookups(df)

    print("\nSTEP 6  Building features ...")
    X = build_features(df, lookups)
    y = df["late"].values
    when = df["purchase_date"]
    is_train, is_valid, is_test = split_by_time(when)

    print("\nSTEP 7  Training ...")
    model = train_model(X, y, is_train, is_valid)
    final_params = {**PARAMS, "n_estimators": int(model.best_iteration_ * 1.15)}

    print("\nSTEP 8  Evaluating ...")
    metrics = evaluate(model, X, y, is_train, is_valid, is_test)

    print("\nSTEP 9  Backtest ...")
    metrics["backtest"], all_pred, all_actual = run_backtest(X, y, when, final_params)

    print("\nSTEP 10  Risk tiers ...")
    metrics["risk_tiers"], metrics["tier_thresholds"] = make_risk_tiers(all_pred, all_actual)

    print("\nSTEP 11  Final model ...")
    final_model, metrics["feature_importance"] = fit_final_model(X, y, final_params)
    save_late_artifacts(final_model, lookups, metrics)

    print("\nSTEP 12  Examples ...")
    save_examples(df, is_test)

    print("\n" + "─" * 60)
    print("LATE DELIVERY COMPLETE")
    print(f"  Test AUC: {metrics['test']['roc_auc']:.4f}")
    print(f"  Backtest AUC: {metrics['backtest']['mean_auc']:.3f}")
    print("─" * 60)


def run_sales_forecast_pipeline():
    print("\n" + "=" * 60)
    print("SALES FORECAST PIPELINE")
    print("=" * 60)

    print("\nSTEP 1  Loading sales ...")
    daily = load_daily_sales()

    artefacts, metrics, forecasts = {}, {}, {}
    for target in SALES_TARGETS:
        print(f"\n{'═' * 20} {target.upper()} {'═' * 20}")

        print("STEP 2  Preparing series ...")
        raw = prepare_series(daily, target)
        clean = neutralise_events(raw)
        print(f"        {len(raw)} days")

        print("\nSTEP 3-4  Backtest ...")
        summary, ratios = run_sales_backtest(raw, clean)

        print("\nSTEP 5-6  Choose model ...")
        chosen = choose_sales_model(summary)
        interval = make_interval(ratios[chosen])
        print(f"        80% interval: x{interval['lo']:.2f} ... x{interval['hi']:.2f}")

        fit, _ = SALES_CANDIDATES[chosen]
        artefacts[target] = {
            "name": chosen,
            "model": fit(clean),
            "history": clean.iloc[-HISTORY_DAYS:],
            "event_uplift": event_uplift(raw, clean),
            "interval": interval,
            "as_of": str(raw.index[-1].date()),
        }

        print("\nSTEP 7  Forecast ...")
        forecasts[target] = forecast_sales(artefacts[target])
        total = forecasts[target]["forecast"].sum()
        print(f"        Next {HORIZON} days: {total:,.0f}")

        metrics[target] = {
            "chosen": chosen,
            "backtest": summary,
            "interval_80": interval,
            "event_uplift": artefacts[target]["event_uplift"],
        }

    print("\nSTEP 8  Saving ...")
    save_sales_artifacts(artefacts, metrics, forecasts)

    print("\n" + "─" * 60)
    print("SALES FORECAST COMPLETE")
    for target in SALES_TARGETS:
        m = metrics[target]
        print(f"  {target}: {m['chosen']} WAPE {m['backtest'][m['chosen']]['daily_wape']:.3f}")
    print("─" * 60)


def main():
    run_late_delivery_pipeline()
    run_sales_forecast_pipeline()


if __name__ == "__main__":
    main()
