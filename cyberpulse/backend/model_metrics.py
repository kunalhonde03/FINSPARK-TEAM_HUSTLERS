"""Model performance monitoring and drift detection."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
METRICS_STORE_PATH = DATA_DIR / "model_metrics.json"


def _ensure_metrics_file() -> None:
    METRICS_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not METRICS_STORE_PATH.exists():
        METRICS_STORE_PATH.write_text(json.dumps({"metrics": []}, encoding="utf-8"), encoding="utf-8")


def load_model_metrics() -> list[dict[str, Any]]:
    """Load all model performance metrics."""
    _ensure_metrics_file()
    try:
        with METRICS_STORE_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("metrics", [])
    except json.JSONDecodeError:
        return []


def save_model_metrics(metrics: list[dict[str, Any]]) -> None:
    """Save model metrics."""
    _ensure_metrics_file()
    with METRICS_STORE_PATH.open("w", encoding="utf-8") as f:
        json.dump({"metrics": metrics}, f, indent=2)


def compute_session_metrics(alerts: pd.DataFrame) -> dict[str, Any]:
    """Compute session-level metrics from alert data.
    
    Requires columns: risk_score, is_model_anomaly, session_is_attack_scenario (if available).
    """
    metrics = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_sessions": int(len(alerts)),
        "flagged_sessions": int((alerts["risk_score"] >= 70).sum()),
    }

    # Precision/recall if we have ground truth (attack scenarios)
    if "session_is_attack_scenario" in alerts.columns:
        attacks = alerts["session_is_attack_scenario"].astype(bool)
        flagged = alerts["risk_score"] >= 70

        tp = int((flagged & attacks).sum())
        fp = int((flagged & ~attacks).sum())
        fn = int((~flagged & attacks).sum())

        metrics["true_positives"] = tp
        metrics["false_positives"] = fp
        metrics["false_negatives"] = fn

        # Precision: of what we flagged, how many were actually attacks
        if tp + fp > 0:
            metrics["precision"] = round(tp / (tp + fp), 3)
        else:
            metrics["precision"] = None

        # Recall: of all actual attacks, how many did we catch
        if tp + fn > 0:
            metrics["recall"] = round(tp / (tp + fn), 3)
        else:
            metrics["recall"] = None

        # False positive rate
        true_negatives = int((~flagged & ~attacks).sum())
        if fp + true_negatives > 0:
            metrics["false_positive_rate"] = round(fp / (fp + true_negatives), 3)
        else:
            metrics["false_positive_rate"] = None

    # Risk score distribution
    metrics["risk_score_mean"] = round(float(alerts["risk_score"].mean()), 2)
    metrics["risk_score_std"] = round(float(alerts["risk_score"].std()), 2)
    metrics["risk_score_p95"] = round(float(alerts["risk_score"].quantile(0.95)), 2)
    metrics["risk_score_p99"] = round(float(alerts["risk_score"].quantile(0.99)), 2)

    return metrics


def record_metrics(alerts: pd.DataFrame) -> dict[str, Any]:
    """Record current model metrics to persistent store."""
    metrics = compute_session_metrics(alerts)
    all_metrics = load_model_metrics()
    all_metrics.append(metrics)
    save_model_metrics(all_metrics)
    return metrics


def get_latest_metrics(limit: int = 1) -> list[dict[str, Any]]:
    """Get the most recent N metric snapshots."""
    metrics = load_model_metrics()
    return metrics[-limit:] if metrics else []


def detect_distribution_shift(
    current_alerts: pd.DataFrame,
    baseline_percentile: float = 95,
    shift_threshold: float = 0.15,
) -> dict[str, Any]:
    """Detect if current risk score distribution has shifted significantly.
    
    Compares current P95 risk score against the median of historical metrics.
    Returns drift detection result.
    """
    current_metrics = compute_session_metrics(current_alerts)
    historical = get_latest_metrics(limit=10)

    if not historical:
        return {
            "has_drift": False,
            "reason": "Not enough historical data to establish baseline",
        }

    # Get baseline P95 from recent history
    baseline_p95_values = [m.get("risk_score_p95", 0) for m in historical if m.get("risk_score_p95")]
    if not baseline_p95_values:
        return {
            "has_drift": False,
            "reason": "Baseline metrics unavailable",
        }

    baseline_p95 = np.median(baseline_p95_values)
    current_p95 = current_metrics.get("risk_score_p95", 0)

    # Calculate percentage change
    if baseline_p95 > 0:
        pct_change = abs(current_p95 - baseline_p95) / baseline_p95
    else:
        pct_change = 0

    has_drift = pct_change > shift_threshold

    return {
        "has_drift": has_drift,
        "baseline_p95": baseline_p95,
        "current_p95": current_p95,
        "pct_change": round(pct_change, 3),
        "shift_threshold": shift_threshold,
        "recommendation": (
            "Consider retraining or adjusting model threshold."
            if has_drift
            else "Risk distribution stable."
        ),
    }


def get_performance_summary() -> dict[str, Any]:
    """Get a comprehensive performance summary from recent metrics."""
    latest = get_latest_metrics(limit=1)
    if not latest:
        return {"status": "no_metrics_available"}

    current = latest[0]
    summary = {
        "timestamp": current.get("timestamp"),
        "total_sessions": current.get("total_sessions"),
        "flagged_sessions": current.get("flagged_sessions"),
        "precision": current.get("precision"),
        "recall": current.get("recall"),
        "false_positive_rate": current.get("false_positive_rate"),
        "risk_score_distribution": {
            "mean": current.get("risk_score_mean"),
            "std": current.get("risk_score_std"),
            "p95": current.get("risk_score_p95"),
            "p99": current.get("risk_score_p99"),
        },
    }

    return summary
