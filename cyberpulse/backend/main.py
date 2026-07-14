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
from fastapi import Body, FastAPI, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


def _build_pdf_bytes(title: str, body: str) -> bytes:
    escaped_title = title.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    lines = body.splitlines() or [""]
    stream_parts = []
    y = 770
    for line in lines[:120]:
        if y < 40:
            break
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream_parts.append(f"BT /F1 10 Tf 54 {y} Td ({escaped}) Tj ET")
        y -= 12
    stream_body = "\n".join(stream_parts)
    pdf = f"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 0 >> stream
BT /F1 16 Tf 54 760 Td ({escaped_title}) Tj ET
{stream_body}
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f \n0000000010 00000 n \n0000000062 00000 n \n0000000119 00000 n \n0000000200 00000 n \n0000000300 00000 n \ntrailer << /Size 6 /Root 1 0 R >>
startxref
0
%%EOF
"""
    return pdf.encode("latin-1", errors="ignore")

from cyberpulse.backend.triage_store import apply_triage_state, set_triage_status
from cyberpulse.backend.notification_rules import (
    add_notification_rule,
    create_notification_rule,
    delete_notification_rule,
    evaluate_alert_against_rules,
    get_notification_targets,
    load_notification_rules,
)
from cyberpulse.backend.model_metrics import (
    compute_session_metrics,
    detect_distribution_shift,
    get_latest_metrics,
    get_performance_summary,
    record_metrics,
)


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


@app.get("/crypto-inventory")
def get_crypto_inventory() -> dict[str, Any]:
    """Return a simple inventory summary of crypto-related telemetry.

    Produces counts for TLS versions, cipher suites, certificate key-length buckets,
    and certificate signature algorithms. This is intentionally lightweight and
    designed for the dashboard to display inventory/coverage metrics.
    """
    data = load_data()
    telemetry = data["telemetry"].copy()

    # Normalize and guard columns
    tls_series = telemetry.get("tls_version") if "tls_version" in telemetry.columns else None
    cipher_series = telemetry.get("cipher_suite") if "cipher_suite" in telemetry.columns else None
    keylen_series = telemetry.get("cert_key_length") if "cert_key_length" in telemetry.columns else None
    sig_series = telemetry.get("cert_signature_alg") if "cert_signature_alg" in telemetry.columns else None

    def safe_counts(series):
        if series is None or series.empty:
            return {}
        clean = series.fillna("unknown").astype(str).str.strip()
        return clean.value_counts().to_dict()

    def keylen_buckets(series):
        if series is None or series.empty:
            return {}
        def bucket(v):
            try:
                n = int(v)
            except (TypeError, ValueError):
                return "unknown"
            if n < 1024:
                return "<1024"
            if n < 2048:
                return "1024-2047"
            if n < 4096:
                return "2048-4095"
            return ">=4096"

        buckets = series.fillna("unknown").map(bucket)
        return buckets.value_counts().to_dict()

    inventory = {
        "total_telemetry_rows": int(len(telemetry)),
        "tls_versions": safe_counts(tls_series),
        "cipher_suites": safe_counts(cipher_series),
        "cert_key_length_buckets": keylen_buckets(keylen_series),
        "cert_signature_algorithms": safe_counts(sig_series),
    }

    # Also include a lightweight breakdown by quantum risk levels from alerts if present
    alerts = data.get("alerts")
    if alerts is not None and "quantum_risk_level" in alerts.columns:
        inventory["alerts_by_quantum_risk"] = alerts["quantum_risk_level"].fillna("unknown").value_counts().to_dict()

    return inventory


# ============================================================================
# NOTIFICATION RULES ENDPOINTS
# ============================================================================

@app.get("/notification-rules")
def list_notification_rules() -> dict[str, Any]:
    """List all notification rules."""
    rules = load_notification_rules()
    return {"rules": rules, "count": len(rules)}


@app.post("/notification-rules")
def create_rule(payload: NotificationRuleRequest) -> dict[str, Any]:
    """Create a new notification rule.
    
    Condition types:
    - min_risk_score: Alert when risk_score >= condition_value
    - quantum_risk: Alert when quantum_risk_level == condition_value
    - attack_type: Alert when attack matches condition_value
    - user_id: Alert for specific user
    - triage_status: Alert on status change
    
    Example: {
        "name": "High Risk Alert",
        "condition_type": "min_risk_score",
        "condition_value": 85,
        "notification_target": "webhook:https://example.com/alerts",
        "enabled": true
    }
    """
    rule = create_notification_rule(
        name=payload.name,
        condition_type=payload.condition_type,
        condition_value=payload.condition_value,
        notification_target=payload.notification_target,
        enabled=payload.enabled,
    )
    added_rule = add_notification_rule(rule)
    return {"rule": added_rule, "status": "created"}


@app.delete("/notification-rules/{rule_id}")
def delete_rule(rule_id: str) -> dict[str, Any]:
    """Delete a notification rule by ID."""
    success = delete_notification_rule(rule_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")
    return {"rule_id": rule_id, "status": "deleted"}


@app.post("/notification-rules/test")
def test_notification_rule(alert: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """Test which rules would be triggered by a sample alert."""
    triggered = evaluate_alert_against_rules(alert)
    targets = get_notification_targets(alert)
    return {
        "triggered_rules": triggered,
        "notification_targets": targets,
        "count": len(triggered),
    }


# ============================================================================
# MODEL METRICS & PERFORMANCE ENDPOINTS
# ============================================================================

@app.get("/model/metrics")
def get_model_metrics(limit: int = Query(10, ge=1, le=100)) -> dict[str, Any]:
    """Get recent model performance metrics."""
    metrics = get_latest_metrics(limit=limit)
    return {"metrics": metrics, "count": len(metrics)}


@app.get("/model/performance")
def get_model_performance() -> dict[str, Any]:
    """Get comprehensive performance summary."""
    summary = get_performance_summary()
    return summary


@app.post("/model/metrics/record")
def record_current_metrics() -> dict[str, Any]:
    """Record current metrics snapshot (typically called after new alerts are generated)."""
    data = load_data()
    metrics = record_metrics(data["alerts"])
    return {"metrics": metrics, "status": "recorded"}


@app.get("/model/drift-detection")
def check_distribution_drift(
    shift_threshold: float = Query(0.15, ge=0, le=1)
) -> dict[str, Any]:
    """Detect if risk score distribution has shifted significantly.
    
    shift_threshold: Acceptable percentage change (0.15 = 15%)
    """
    data = load_data()
    drift_result = detect_distribution_shift(data["alerts"], shift_threshold=shift_threshold)
    return drift_result


# ============================================================================
# REAL-TIME ALERTS VIA WEBSOCKET
# ============================================================================

# Store active WebSocket connections
active_connections: list[WebSocket] = []


@app.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time alerts.
    
    Sends new high-risk alerts to connected clients as they are detected.
    Example JS client:
    
    const ws = new WebSocket('ws://localhost:8000/ws/alerts');
    ws.onmessage = (event) => {
        const alert = JSON.parse(event.data);
        console.log('New alert:', alert);
    };
    """
    await websocket.accept()
    active_connections.append(websocket)
    try:
        # Keep connection open and send alerts when data changes
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(websocket)


async def broadcast_alert(alert: dict[str, Any]) -> None:
    """Broadcast an alert to all connected WebSocket clients."""
    for connection in active_connections:
        try:
            await connection.send_json(alert)
        except Exception:
            # Client disconnected, will be cleaned up on next receive
            pass


@app.get("/model/alerts-stream/latest")
def get_latest_high_risk_alerts(min_risk: float = Query(80, ge=0, le=100)) -> list[dict[str, Any]]:
    """Get the latest high-risk alerts suitable for streaming/notifications.
    
    This is a polling alternative to WebSocket if needed.
    """
    data = load_data()
    alerts = data["alerts"].copy()
    alerts = alerts[alerts["risk_score"] >= min_risk]
    alerts = apply_triage_state(alerts)
    alerts = alerts.sort_values("risk_score", ascending=False).head(20)
    
    columns = [col for col in ALERT_RESPONSE_COLUMNS if col in alerts.columns]
    return _json_records(alerts[columns])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("cyberpulse.backend.main:app", host="127.0.0.1", port=8000, reload=False)
