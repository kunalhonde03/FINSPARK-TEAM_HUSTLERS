"""FastAPI backend for the CyberPulse prototype."""

from __future__ import annotations

import json
import sys
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
    limit: int | None = Query(None, ge=1, le=20000),
) -> list[dict[str, Any]]:
    data = load_data()
    alerts = data["alerts"].copy()
    alerts = alerts[alerts["risk_score"] >= min_risk].sort_values("risk_score", ascending=False)
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


@app.get("/alerts/{session_id}/copilot-report")
def get_copilot_report(session_id: str) -> dict[str, Any]:
    import uuid
    from datetime import datetime, timezone
    data = load_data()
    alerts = data["alerts"]
    session_row = alerts[alerts["session_id"] == session_id]
    if session_row.empty:
        raise HTTPException(status_code=404, detail=f"Alert session {session_id} not found.")
    
    session = session_row.iloc[0].to_dict()
    
    user_id = session.get("user_id", "Unknown")
    risk_score = float(session.get("risk_score", 0))
    geo_flag = int(float(session.get("geo_velocity_flag", 0)))
    failed_logins = int(float(session.get("failed_login_count", 0)))
    device_change = int(float(session.get("device_change_flag", 0)))
    weak_crypto = int(float(session.get("weak_crypto_flag", 0)))
    txn_velocity = int(float(session.get("transaction_velocity", 0)))
    max_amount = float(session.get("max_transaction_amount", 0))
    new_beneficiary = int(float(session.get("new_beneficiary_flag", 0)))

    factors = []
    if geo_flag: factors.append("impossible travel geographical velocity")
    if failed_logins >= 3: factors.append(f"{failed_logins} failed login attempts")
    if device_change: factors.append("unrecognized device signature change")
    if weak_crypto: factors.append("weak legacy cryptographic parameters")
    if txn_velocity >= 3: factors.append("unusual transaction velocity")
    if max_amount > 0: factors.append(f"high-value transfer of INR {max_amount:,.2f}")
    if new_beneficiary: factors.append("payment routed to a newly enrolled beneficiary")

    factors_str = ", ".join(factors[:-1]) + (" and " + factors[-1] if len(factors) > 1 else factors[-1] if factors else "low-level transaction anomalies")
    
    classification = "Suspicious Money Mule Activity" if new_beneficiary and max_amount > 0 else "Credential Takeover Attack" if failed_logins >= 3 else "Session Hijacking Indicator"
    severity = "CRITICAL" if risk_score >= 85 else "HIGH" if risk_score >= 70 else "MEDIUM"

    summary = (
        f"At {session.get('session_start', 'the designated start time')}, User {user_id} generated a high-anomaly alert "
        f"for session {session_id}. The system flagged this activity with an overall risk score of {risk_score:.1f}/100 and a "
        f"quantum exposure rating of '{session.get('quantum_risk_level', 'Low')}'. The primary risk drivers are "
        f"{factors_str}. This combination matches typical threat signatures for a '{classification}' event."
    )

    findings = []
    if geo_flag:
        findings.append({
            "name": "Impossible Travel Event",
            "rating": "HIGH",
            "evidence": session.get("geo_velocity_detail") or "Multiple geographic access points in under 30 minutes.",
            "description": "Authentication requests came from geographical locations separated by a distance that exceeds standard transport limits, implying active session forwarding or proxy use."
        })
    if failed_logins > 0:
        findings.append({
            "name": "Brute Force Logins",
            "rating": "HIGH" if failed_logins >= 5 else "MEDIUM",
            "evidence": f"{failed_logins} failed authentication sequences logged in the session window.",
            "description": "A rapid burst of incorrect credentials was entered before success, indicating password guessing or credential validation attempts."
        })
    if device_change:
        findings.append({
            "name": "Device Identification Mismatch",
            "rating": "MEDIUM",
            "evidence": f"{int(float(session.get('unique_device_count', 1)))} device profiles registered.",
            "description": "Session initialized using a browser fingerprint, operating system, or machine identifier that doesn't correspond to user history."
        })
    if weak_crypto:
        findings.append({
            "name": "Weak / Post-Quantum Cryptography Risk",
            "rating": "CRITICAL" if max_amount >= 100000 else "MEDIUM",
            "evidence": session.get("quantum_risk_explanation") or "Vulnerable TLS version or signature algorithm.",
            "description": "Session traffic authenticated with legacy algorithms (e.g. RSA-1024 or TLS 1.0). Subject to 'Harvest Now, Decrypt Later' threat as quantum key-exchange cryptanalysis advances."
        })
    if max_amount > 0:
        findings.append({
            "name": "High-Value Transfer Flag",
            "rating": "HIGH" if max_amount >= 100000 else "MEDIUM",
            "evidence": f"Outward wire of INR {max_amount:,.2f} initiated during session.",
            "description": "The transaction amount significantly deviates from the user's running historical average z-score, mimicking typical cash-out signatures."
        })

    remediations = [
        "Revoke the active session token and force full identity re-verification via secondary channels.",
        "Initiate a temporary security freeze on beneficiary payouts associated with this transaction ID.",
        "Prompt the user to enroll in hardware-backed passkeys to avoid credential stuffing vulnerabilities.",
        "Configure the API gateway to require TLS 1.3 protocol versions and deprecate legacy RSA key transport."
    ]

    return {
        "incident_id": f"INC-{session_id[-6:].upper()}",
        "user_id": user_id,
        "session_id": session_id,
        "risk_score": risk_score,
        "severity": severity,
        "classification": classification,
        "executive_summary": summary,
        "technical_findings": findings,
        "remediations": remediations,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }


@app.get("/alerts/{session_id}/pqc-playbook")
def get_pqc_playbook(session_id: str) -> dict[str, Any]:
    data = load_data()
    alerts = data["alerts"]
    session_row = alerts[alerts["session_id"] == session_id]
    if session_row.empty:
        raise HTTPException(status_code=404, detail=f"Alert session {session_id} not found.")
    
    session = session_row.iloc[0]
    user_id = session["user_id"]
    
    telemetry = data["telemetry"]
    user_tele = telemetry[telemetry["user_id"] == user_id].copy()
    user_tele["dt"] = pd.to_datetime(user_tele["timestamp"], format="mixed")
    
    session_start = pd.to_datetime(session["session_start"], format="mixed")
    session_end = pd.to_datetime(session["session_end"], format="mixed")
    session_tele = user_tele[(user_tele["dt"] >= session_start) & (user_tele["dt"] <= session_end)]
    
    vulnerabilities = []
    target_arch = {
        "key_exchange": "ML-KEM-1024 (Post-Quantum) or Kyber768 + X25519 Hybrid",
        "signature_scheme": "ML-DSA-87 (Dilithium) or Falcon-1024",
        "tls_version": "TLS 1.3 with Hybrid Key Agreement"
    }
    
    steps = [
        "Cryptographic Inventory: Locate all web server profiles, API clients, and network edge appliances using legacy certificates.",
        "Protocol Policy Update: Disable legacy protocols (TLS 1.0, 1.1, and 1.2) on the load balancers and enforce a minimum of TLS 1.3.",
        "Key Transport Upgrade: Replace RSA key exchange configurations with Ephemeral Diffie-Hellman (ECDHE) curves or hybrid ML-KEM agreements.",
        "Certificate Lifecycle: Issue new 3072-bit minimum RSA certificates or transition directly to hybrid quantum-safe signatures.",
        "Handshake Validation: Execute standard sandbox connection testing using OpenSSL built with liboqs integration."
    ]
    
    nginx_config = (
        "# CyberPulse Dynamic Nginx Configuration\n"
        "ssl_protocols TLSv1.3;\n"
        "ssl_prefer_server_ciphers on;\n"
        "ssl_curves X25519Kyber768Draft00:X25519:prime256v1;\n"
        "ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';\n"
    )
    
    openssl_commands = (
        "# Step 1: Generate a private key supporting hybrid key exchange\n"
        "openssl ecparam -name prime256v1 -genkey -noout -out hybrid_ecc.key\n"
        "# Step 2: Request a CSR using ML-DSA algorithm signature (OQS-OpenSSL)\n"
        "openssl req -new -key hybrid_ecc.key -out quantum_cert.csr -subj '/CN=secure-banking-node'\n"
    )

    if not session_tele.empty:
        for idx, row in session_tele.iterrows():
            tls = str(row.get("tls_version", ""))
            cipher = str(row.get("cipher_suite", ""))
            key_len = row.get("cert_key_length")
            sig_alg = str(row.get("cert_signature_alg", ""))
            
            if "1.0" in tls or "1.1" in tls or "SSL" in tls:
                vulnerabilities.append({
                    "type": "Legacy Protocol Version",
                    "detected_value": tls,
                    "risk_level": "HIGH",
                    "description": f"Connection established over deprecated {tls}. TLS 1.0/1.1 are vulnerable to protocol downgrade attacks."
                })
            if "CBC" in cipher or "3DES" in cipher or "RC4" in cipher or "MD5" in cipher or "TLS_RSA_WITH" in cipher:
                vulnerabilities.append({
                    "type": "Weak Cipher Suite",
                    "detected_value": cipher,
                    "risk_level": "HIGH",
                    "description": f"Session cipher suite '{cipher}' lacks Forward Secrecy. Intercepted traffic can be decrypted retroactively if the server key is compromised."
                })
            try:
                k_len = int(key_len) if key_len is not None else 2048
                if k_len < 2048:
                    vulnerabilities.append({
                        "type": "Weak RSA Certificate Key Length",
                        "detected_value": f"RSA-{k_len}",
                        "risk_level": "CRITICAL",
                        "description": f"RSA public key length of {k_len} is highly vulnerable to quantum factorisation using Shor's algorithm."
                    })
            except:
                pass
            if "SHA-1" in sig_alg or "MD5" in sig_alg:
                vulnerabilities.append({
                    "type": "Deprecated Certificate Signature Hash",
                    "detected_value": sig_alg,
                    "risk_level": "HIGH",
                    "description": f"Signature signed with legacy {sig_alg}. Vulnerable to hash collision attacks, making certificate forgery possible."
                })
    
    seen_vulns = set()
    unique_vulns = []
    for v in vulnerabilities:
        if v["type"] not in seen_vulns:
            seen_vulns.add(v["type"])
            unique_vulns.append(v)
            
    if not unique_vulns and int(float(session.get("weak_crypto_flag", 0))) == 1:
        unique_vulns.append({
            "type": "Weak Legacy Cipher Suite",
            "detected_value": "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
            "risk_level": "HIGH",
            "description": "Session relies on obsolete static RSA key transport and 3DES block ciphers which do not support Forward Secrecy."
        })
        unique_vulns.append({
            "type": "Vulnerable Certificate Key Length",
            "detected_value": "RSA-1024",
            "risk_level": "CRITICAL",
            "description": "Legitimate certificate utilizes a 1024-bit key, easily broken in real-time by Shor's algorithm."
        })

    return {
        "session_id": session_id,
        "user_id": user_id,
        "vulnerabilities": unique_vulns if unique_vulns else [{
            "type": "Post-Quantum Vulnerability",
            "detected_value": "None detected",
            "risk_level": "LOW",
            "description": "No immediate quantum-related vulnerabilities detected in current telemetry events."
        }],
        "target_architecture": target_arch,
        "steps": steps,
        "nginx_config": nginx_config,
        "openssl_commands": openssl_commands
    }


@app.get("/alerts/{session_id}/stix")
def get_stix_bundle(session_id: str) -> dict[str, Any]:
    import uuid
    from datetime import datetime, timezone
    data = load_data()
    alerts = data["alerts"]
    session_row = alerts[alerts["session_id"] == session_id]
    if session_row.empty:
        raise HTTPException(status_code=404, detail=f"Alert session {session_id} not found.")
    
    session = session_row.iloc[0]
    user_id = session["user_id"]
    
    telemetry = data["telemetry"]
    user_tele = telemetry[telemetry["user_id"] == user_id]
    ip_addr = "127.0.0.1"
    if not user_tele.empty:
        ip_addr = user_tele.iloc[0].get("ip_address", "127.0.0.1")
        
    bundle_id = f"bundle--{uuid.uuid4()}"
    identity_id = f"identity--{uuid.uuid4()}"
    indicator_id = f"indicator--{uuid.uuid4()}"
    observed_id = f"observed-data--{uuid.uuid4()}"
    threat_actor_id = f"threat-actor--{uuid.uuid4()}"
    relationship_1_id = f"relationship--{uuid.uuid4()}"
    relationship_2_id = f"relationship--{uuid.uuid4()}"
    
    now_str = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    
    objects = [
        {
            "type": "identity",
            "spec_version": "2.1",
            "id": identity_id,
            "created": now_str,
            "modified": now_str,
            "name": f"Compromised Customer: {user_id}",
            "description": f"Customer identity associated with User ID {user_id}",
            "identity_class": "individual"
        },
        {
            "type": "indicator",
            "spec_version": "2.1",
            "id": indicator_id,
            "created": now_str,
            "modified": now_str,
            "name": f"Access Source IP: {ip_addr}",
            "description": f"IP address flagged during high-risk security alert session {session_id}",
            "pattern": f"[ipv4-addr:value = '{ip_addr}']",
            "pattern_type": "stix",
            "valid_from": now_str
        },
        {
            "type": "observed-data",
            "spec_version": "2.1",
            "id": observed_id,
            "created": now_str,
            "modified": now_str,
            "first_observed": now_str,
            "last_observed": now_str,
            "number_observed": 1,
            "objects": {
                "0": {
                    "type": "network-traffic",
                    "src_ref": "1",
                    "protocols": ["tcp", "tls"],
                    "extensions": {
                        "tls-ext": {
                            "cipher_suite": str(session.get("cipher_suite", "Unknown")),
                            "version": str(session.get("tls_version", "Unknown"))
                        }
                    }
                },
                "1": {
                    "type": "ipv4-addr",
                    "value": ip_addr
                }
            }
        },
        {
            "type": "threat-actor",
            "spec_version": "2.1",
            "id": threat_actor_id,
            "created": now_str,
            "modified": now_str,
            "name": "Unknown Fraud Operator",
            "description": f"Threat actor attempting illegitimate transaction of INR {float(session.get('max_transaction_amount', 0)):,.2f} via session {session_id}",
            "threat_actor_types": ["crime-syndicate", "fraudster"],
            "sophistication": "tactical"
        },
        {
            "type": "relationship",
            "spec_version": "2.1",
            "id": relationship_1_id,
            "created": now_str,
            "modified": now_str,
            "relationship_type": "indicates",
            "source_ref": indicator_id,
            "target_ref": threat_actor_id
        },
        {
            "type": "relationship",
            "spec_version": "2.1",
            "id": relationship_2_id,
            "created": now_str,
            "modified": now_str,
            "relationship_type": "compromises",
            "source_ref": threat_actor_id,
            "target_ref": identity_id
        }
    ]
    
    return {
        "type": "bundle",
        "id": bundle_id,
        "objects": objects
    }


@app.get("/mule-tracker")
def get_mule_tracker() -> dict[str, Any]:
    data = load_data()
    transactions = data["transactions"]
    alerts = data["alerts"]
    
    high_risk_users = set(alerts[alerts["risk_score"] >= 70]["user_id"].unique())
    
    beneficiary_groups = transactions.groupby("beneficiary_id").agg({
        "user_id": lambda x: list(set(x)),
        "amount": ["count", "sum"],
        "beneficiary_is_new": "first"
    })
    
    beneficiary_groups.columns = ["user_ids", "txn_count", "total_amount", "is_new"]
    beneficiary_groups = beneficiary_groups.reset_index()
    
    mules_df = beneficiary_groups[beneficiary_groups["user_ids"].apply(len) >= 2]
    
    nodes = []
    links = []
    added_nodes = set()
    
    top_mules = mules_df.sort_values(by="total_amount", ascending=False).head(15)
    
    for _, row in top_mules.iterrows():
        beneficiary_id = row["beneficiary_id"]
        sending_users = row["user_ids"]
        total_amount = float(row["total_amount"])
        
        compromised_senders = [u for u in sending_users if u in high_risk_users]
        num_compromised = len(compromised_senders)
        
        mule_risk = "Low"
        mule_score = 30.0
        if num_compromised >= 2:
            mule_risk = "High"
            mule_score = 90.0
        elif num_compromised == 1 or len(sending_users) >= 3:
            mule_risk = "Medium"
            mule_score = 65.0
            
        if beneficiary_id not in added_nodes:
            nodes.append({
                "id": beneficiary_id,
                "label": f"Mule Hub: {beneficiary_id}",
                "type": "beneficiary",
                "risk_score": mule_score,
                "risk_level": mule_risk,
                "total_received": total_amount,
                "txn_count": int(row["txn_count"]),
                "is_new": bool(row["is_new"])
            })
            added_nodes.add(beneficiary_id)
            
        for user_id in sending_users:
            is_compromised = user_id in high_risk_users
            user_risk_rows = alerts[alerts["user_id"] == user_id]
            user_score = 35.0
            if not user_risk_rows.empty:
                user_score = float(user_risk_rows["risk_score"].max())
                
            if user_id not in added_nodes:
                nodes.append({
                    "id": user_id,
                    "label": f"Sender: {user_id}",
                    "type": "user",
                    "risk_score": user_score,
                    "risk_level": "High" if user_score >= 70 else "Medium" if user_score >= 50 else "Low",
                    "is_compromised": is_compromised
                })
                added_nodes.add(user_id)
                
            edge_txns = transactions[(transactions["user_id"] == user_id) & (transactions["beneficiary_id"] == beneficiary_id)]
            txn_sum = float(edge_txns["amount"].sum())
            txn_count = len(edge_txns)
            
            links.append({
                "source": user_id,
                "target": beneficiary_id,
                "amount": txn_sum,
                "count": txn_count
            })
            
    return {
        "nodes": nodes,
        "links": links
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("cyberpulse.backend.main:app", host="127.0.0.1", port=8000, reload=False)
