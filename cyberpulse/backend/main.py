"""FastAPI backend for the CyberPulse prototype."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT.parent))

from cyberpulse.explainability.rule_based_explainer import contribution_items, explain_session
from cyberpulse.features.session_features import SESSION_FEATURE_COLUMNS
from cyberpulse.models.isolation_forest import DEFAULT_MODEL, load_bundle, score_single_session
from cyberpulse.quantum_risk.crypto_rules import evaluate_feature_quantum_risk, evaluate_session_crypto


DATA_DIR = PROJECT_ROOT / "data"
ALERTS_PATH = DATA_DIR / "alerts_quantum.csv"
TELEMETRY_PATH = DATA_DIR / "telemetry.csv"
TRANSACTIONS_PATH = DATA_DIR / "transactions.csv"

ALERT_RESPONSE_COLUMNS = [
    "session_id",
    "user_id",
    "timestamp",
    "session_start",
    "session_end",
    "risk_score",
    "is_model_anomaly",
    "explanation",
    "quantum_risk_level",
    "quantum_risk_explanation",
    "feature_contributions",
    "triage_status",
    "triage_note",
    *SESSION_FEATURE_COLUMNS,
]


class SessionScoreRequest(BaseModel):
    geo_velocity_flag: int = Field(0, ge=0, le=1)
    failed_login_count: int = Field(0, ge=0)
    max_failed_attempts_last_10min: int = Field(0, ge=0)
    device_change_flag: int = Field(0, ge=0, le=1)
    time_since_last_known_device_ip_minutes: float = Field(0, ge=0)
    transaction_amount_zscore: float = 0
    max_transaction_amount: float = Field(0, ge=0)
    total_transaction_amount: float = Field(0, ge=0)
    new_beneficiary_flag: int = Field(0, ge=0, le=1)
    transaction_velocity: int = Field(0, ge=0)
    weak_crypto_flag: int = Field(0, ge=0, le=1)
    crypto_deprecated_signal_count: int = Field(0, ge=0)
    login_event_count: int = Field(0, ge=0)
    successful_login_count: int = Field(0, ge=0)
    unique_geo_count: int = Field(0, ge=0)
    unique_device_count: int = Field(0, ge=0)
    tls_version: str | None = None
    cipher_suite: str | None = None
    cert_key_length: int | None = None
    cert_signature_alg: str | None = None
    geo_velocity_detail: str | None = None

    class Config:
        extra = "allow"


def _payload_dict(payload: BaseModel) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump()
    return payload.dict()


class TriageUpdateRequest(BaseModel):
    session_id: str
    status: str | None = None
    note: str | None = None


class NotificationRuleRequest(BaseModel):
    name: str
    condition_type: str
    condition_value: Any
    notification_target: str
    enabled: bool = True


def _json_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    clean = frame.astype(object).where(pd.notna(frame), None)
    return clean.to_dict(orient="records")


def _parse_timestamps(series: pd.Series) -> pd.Series:
    try:
        return pd.to_datetime(series, format="mixed")
    except (TypeError, ValueError):
        return pd.to_datetime(series)


@lru_cache(maxsize=1)
def load_data() -> dict[str, Any]:
    missing = [path for path in [ALERTS_PATH, TELEMETRY_PATH, TRANSACTIONS_PATH, DEFAULT_MODEL] if not path.exists()]
    if missing:
        missing_text = ", ".join(str(path) for path in missing)
        raise RuntimeError(f"Missing generated CyberPulse artifacts: {missing_text}")

    alerts = pd.read_csv(ALERTS_PATH)
    alerts["timestamp"] = alerts["session_start"]
    telemetry = pd.read_csv(TELEMETRY_PATH)
    transactions = pd.read_csv(TRANSACTIONS_PATH)
    model_bundle = load_bundle(DEFAULT_MODEL)

    return {
        "alerts": alerts,
        "telemetry": telemetry,
        "transactions": transactions,
        "model_bundle": model_bundle,
    }


app = FastAPI(
    title="CyberPulse API",
    version="0.1.0",
    description="Correlates cybersecurity telemetry with banking transactions for proactive fraud and cyber-risk alerts.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "CyberPulse API"}


@app.get("/alerts")
def get_alerts(
    min_risk: float = Query(0, ge=0, le=100),
    max_risk: float = Query(100, ge=0, le=100),
    quantum_risk_level: str | None = Query(None),
    user_id: str | None = Query(None),
    triage_status: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    limit: int | None = Query(None, ge=1, le=20000),
) -> list[dict[str, Any]]:
    """Get alerts with advanced filtering.
    
    Filters:
    - min_risk/max_risk: Risk score range (0-100)
    - quantum_risk_level: High, Medium, Low
    - user_id: Specific user
    - triage_status: new, investigating, escalated, resolved
    - start_date/end_date: ISO format dates (YYYY-MM-DD)
    - limit: Max results to return
    """
    data = load_data()
    alerts = data["alerts"].copy()
    
    # Apply risk score filter
    alerts = alerts[(alerts["risk_score"] >= min_risk) & (alerts["risk_score"] <= max_risk)]
    
    # Apply quantum risk filter
    if quantum_risk_level and "quantum_risk_level" in alerts.columns:
        alerts = alerts[alerts["quantum_risk_level"] == quantum_risk_level]
    
    # Apply user filter
    if user_id:
        alerts = alerts[alerts["user_id"] == user_id]
    
    # Apply triage status filter
    alerts = apply_triage_state(alerts)
    if triage_status:
        alerts = alerts[alerts["triage_status"] == triage_status]
    
    # Apply date range filter
    if start_date or end_date:
        alerts["session_start"] = _parse_timestamps(alerts["session_start"])
        if start_date:
            start_dt = pd.to_datetime(start_date)
            alerts = alerts[alerts["session_start"] >= start_dt]
        if end_date:
            end_dt = pd.to_datetime(end_date)
            alerts = alerts[alerts["session_start"] <= end_dt]
    
    # Sort and limit
    alerts = alerts.sort_values("risk_score", ascending=False)
    if limit:
        alerts = alerts.head(limit)
    
    columns = [column for column in ALERT_RESPONSE_COLUMNS if column in alerts.columns]
    return _json_records(alerts[columns])


@app.get("/user/{user_id}/timeline")
def get_user_timeline(user_id: str) -> dict[str, Any]:
    data = load_data()
    telemetry = data["telemetry"]
    transactions = data["transactions"]

    tele = telemetry[telemetry["user_id"] == user_id].copy()
    txns = transactions[transactions["user_id"] == user_id].copy()
    if tele.empty and txns.empty:
        raise HTTPException(status_code=404, detail=f"No events found for user {user_id}")

    events: list[dict[str, Any]] = []
    if not tele.empty:
        tele["timestamp"] = _parse_timestamps(tele["timestamp"])
        for row in tele.itertuples(index=False):
            events.append(
                {
                    "event_type": "telemetry",
                    "id": row.event_id,
                    "timestamp": row.timestamp.isoformat(),
                    "login_status": row.login_status,
                    "geo_location": row.geo_location,
                    "ip_address": row.ip_address,
                    "device_fingerprint": row.device_fingerprint,
                    "tls_version": row.tls_version,
                    "cipher_suite": row.cipher_suite,
                    "cert_key_length": int(row.cert_key_length),
                    "detail": f"{row.login_status} login from {row.geo_location} using {row.auth_method}",
                }
            )

    if not txns.empty:
        txns["timestamp"] = _parse_timestamps(txns["timestamp"])
        for row in txns.itertuples(index=False):
            new_text = "new beneficiary" if bool(row.beneficiary_is_new) else "known beneficiary"
            events.append(
                {
                    "event_type": "transaction",
                    "id": row.txn_id,
                    "timestamp": row.timestamp.isoformat(),
                    "amount": float(row.amount),
                    "channel": row.channel,
                    "beneficiary_id": row.beneficiary_id,
                    "beneficiary_is_new": bool(row.beneficiary_is_new),
                    "merchant_category": row.merchant_category,
                    "detail": f"INR {float(row.amount):,.0f} {row.merchant_category} via {row.channel} to {new_text}",
                }
            )

    events = sorted(events, key=lambda event: event["timestamp"])
    return {"user_id": user_id, "events": events}


@app.post("/score-session")
def score_session(payload: SessionScoreRequest = Body(...)) -> dict[str, Any]:
    data = load_data()
    features = _payload_dict(payload)
    score = score_single_session(features, data["model_bundle"])
    explanation_input = {**features, **score}
    explanation = explain_session(explanation_input)

    has_raw_crypto = any(features.get(column) is not None for column in ["tls_version", "cipher_suite", "cert_key_length", "cert_signature_alg"])
    if has_raw_crypto:
        crypto_frame = pd.DataFrame([features])
        quantum_level, quantum_explanation = evaluate_session_crypto(
            crypto_frame,
            max_transaction_amount=float(features.get("max_transaction_amount") or 0),
        )
    else:
        quantum_level, quantum_explanation = evaluate_feature_quantum_risk(features)

    return {
        "risk_score": score["risk_score"],
        "anomaly_score": score["anomaly_score"],
        "is_model_anomaly": score["is_model_anomaly"],
        "explanation": explanation,
        "feature_contributions": contribution_items(explanation_input),
        "quantum_risk_level": quantum_level,
        "quantum_risk_explanation": quantum_explanation,
    }


@app.post("/triage")
def update_triage(payload: TriageUpdateRequest = Body(...)) -> dict[str, Any]:
    if not payload.session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    entry = set_triage_status(payload.session_id, payload.status, payload.note)
    return {"session_id": payload.session_id, **entry}


@app.get("/export/alerts.{format}")
def export_alerts(format: str, min_risk: float = Query(0, ge=0, le=100), limit: int | None = Query(None, ge=1, le=20000)) -> Response:
    data = load_data()
    alerts = data["alerts"].copy()
    alerts = alerts[alerts["risk_score"] >= min_risk].sort_values("risk_score", ascending=False)
    if limit:
        alerts = alerts.head(limit)
    alerts = apply_triage_state(alerts)

    if format.lower() == "csv":
        csv_text = alerts.to_csv(index=False)
        return Response(content=csv_text, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=cyberpulse_alerts.csv"})

    if format.lower() == "pdf":
        body = alerts.to_string(index=False)
        pdf_bytes = _build_pdf_bytes("CyberPulse alerts", body)
        return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=cyberpulse_alerts.pdf"})

    raise HTTPException(status_code=400, detail="Format must be csv or pdf")


@app.get("/stats")
def get_stats() -> dict[str, Any]:
    data = load_data()
    alerts = data["alerts"]
    flagged = alerts["risk_score"] >= 70
    high_quantum = alerts["quantum_risk_level"].eq("High") if "quantum_risk_level" in alerts else pd.Series(False)

    single_signal = (
        alerts["geo_velocity_flag"].eq(1)
        | alerts["failed_login_count"].ge(3)
        | alerts["device_change_flag"].eq(1)
        | alerts["transaction_amount_zscore"].ge(3)
        | alerts["transaction_velocity"].ge(3)
        | alerts["weak_crypto_flag"].eq(1)
    )
    single_signal_count = int(single_signal.sum())
    false_positive_reduction = (
        max(0.0, (single_signal_count - int(flagged.sum())) / max(single_signal_count, 1) * 100.0)
    )

    stats: dict[str, Any] = {
        "total_sessions": int(len(alerts)),
        "flagged_count": int(flagged.sum()),
        "high_quantum_risk_count": int(high_quantum.sum()),
        "average_risk_score": round(float(alerts["risk_score"].mean()), 2),
        "single_signal_alert_count": single_signal_count,
        "estimated_false_positive_reduction_pct": round(false_positive_reduction, 1),
    }

    if "session_is_attack_scenario" in alerts.columns:
        attacks = alerts["session_is_attack_scenario"].astype(bool)
        top_threshold = np.percentile(alerts["risk_score"], 95)
        stats["validation_attack_sessions"] = int(attacks.sum())
        stats["validation_attack_recall_top_5_pct"] = round(
            float(((alerts["risk_score"] >= top_threshold) & attacks).sum() / max(int(attacks.sum()), 1) * 100.0),
            1,
        )

    return stats


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("cyberpulse.backend.main:app", host="127.0.0.1", port=8000, reload=False)

