"""Quantum-related crypto risk rules for CyberPulse sessions."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT.parent))

from cyberpulse.features.session_features import _prepare_streams


DATA_DIR = PROJECT_ROOT / "data"
DEFAULT_SESSIONS = DATA_DIR / "alerts_explained.csv"
DEFAULT_TELEMETRY = DATA_DIR / "telemetry.csv"
DEFAULT_TRANSACTIONS = DATA_DIR / "transactions.csv"
DEFAULT_OUTPUT = DATA_DIR / "alerts_quantum.csv"

MIN_RSA_KEY_LENGTH = 2048
DEPRECATED_TLS_VERSIONS = {"SSL 3.0", "TLS 1.0", "TLS 1.1"}
DEPRECATED_CIPHER_TOKENS = ["3DES", "RC4", "MD5", "EXPORT", "NULL", "_CBC_"]
DEPRECATED_CERT_SIGNATURES = {"SHA-1", "MD5"}


def _parse_tls_version(value: Any) -> float:
    text = str(value).upper().replace("TLS", "").strip()
    try:
        return float(text)
    except ValueError:
        return 9.9


def crypto_findings_for_event(event: pd.Series | dict[str, Any]) -> list[str]:
    row = dict(event)
    findings: list[str] = []

    tls_number = _parse_tls_version(row.get("tls_version", ""))
    tls_version = f"TLS {tls_number:.1f}" if tls_number < 9.9 else str(row.get("tls_version", "")).upper().strip()
    if tls_version in DEPRECATED_TLS_VERSIONS or _parse_tls_version(tls_version) < 1.2:
        findings.append(f"deprecated {tls_version or 'TLS version'}")

    cipher = str(row.get("cipher_suite", "")).upper()
    if cipher.startswith("TLS_RSA_WITH") or any(token in cipher for token in DEPRECATED_CIPHER_TOKENS):
        findings.append(f"deprecated cipher {cipher}")

    try:
        key_length = int(row.get("cert_key_length", MIN_RSA_KEY_LENGTH))
    except (TypeError, ValueError):
        key_length = MIN_RSA_KEY_LENGTH
    if key_length < MIN_RSA_KEY_LENGTH:
        findings.append(f"RSA-{key_length}")

    cert_signature = str(row.get("cert_signature_alg", "")).upper()
    if cert_signature in DEPRECATED_CERT_SIGNATURES:
        findings.append(f"{cert_signature} certificate")

    return findings


def evaluate_session_crypto(
    telemetry_events: pd.DataFrame,
    max_transaction_amount: float = 0.0,
) -> tuple[str, str]:
    findings: list[str] = []
    for _, event in telemetry_events.iterrows():
        findings.extend(crypto_findings_for_event(event))

    unique_findings = list(dict.fromkeys(findings))
    if not unique_findings:
        return "Low", "No deprecated TLS, cipher, RSA key length, or certificate signature indicators observed."

    finding_text = ", ".join(unique_findings[:4])
    paired_value = max_transaction_amount >= 100000
    severe_crypto = len(unique_findings) >= 3 or any("TLS 1.0" in item or "RSA-1024" in item for item in unique_findings)

    if paired_value or severe_crypto:
        transaction_context = (
            f" paired with a large transaction of INR {max_transaction_amount:,.0f}"
            if max_transaction_amount
            else ""
        )
        return (
            "High",
            f"Session used {finding_text}{transaction_context}; vulnerable to harvest-now-decrypt-later risk as quantum capabilities mature.",
        )

    return (
        "Medium",
        f"Session used {finding_text}; monitor and prioritize migration to quantum-safe cryptography.",
    )


def evaluate_feature_quantum_risk(features: dict[str, Any]) -> tuple[str, str]:
    weak_crypto = int(float(features.get("weak_crypto_flag", 0) or 0)) == 1
    crypto_count = int(float(features.get("crypto_deprecated_signal_count", 0) or 0))
    max_amount = float(features.get("max_transaction_amount", 0) or 0)

    if not weak_crypto:
        return "Low", "No deprecated crypto signals were provided for this simulated session."
    if crypto_count >= 3 or max_amount >= 100000:
        return (
            "High",
            "Session includes weak crypto metadata paired with high transaction value; possible harvest-now-decrypt-later exposure.",
        )
    return "Medium", "Session includes weak crypto metadata; review TLS, cipher suite, and certificate posture."


def add_quantum_risk(
    sessions: pd.DataFrame,
    telemetry: pd.DataFrame,
    transactions: pd.DataFrame,
    window_minutes: int = 30,
) -> pd.DataFrame:
    telemetry_with_sessions, _, _ = _prepare_streams(telemetry, transactions, window_minutes)
    rows = []
    for _, session in sessions.iterrows():
        session_id = session["session_id"]
        events = telemetry_with_sessions[telemetry_with_sessions["session_id"] == session_id]
        level, explanation = evaluate_session_crypto(
            events,
            max_transaction_amount=float(session.get("max_transaction_amount", 0) or 0),
        )
        row = session.to_dict()
        row["quantum_risk_level"] = level
        row["quantum_risk_explanation"] = explanation
        rows.append(row)
    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Attach quantum-risk crypto rules to CyberPulse sessions.")
    parser.add_argument("--sessions", type=Path, default=DEFAULT_SESSIONS)
    parser.add_argument("--telemetry", type=Path, default=DEFAULT_TELEMETRY)
    parser.add_argument("--transactions", type=Path, default=DEFAULT_TRANSACTIONS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--window-minutes", type=int, default=30)
    args = parser.parse_args()

    sessions = pd.read_csv(args.sessions)
    telemetry = pd.read_csv(args.telemetry)
    transactions = pd.read_csv(args.transactions)
    enriched = add_quantum_risk(
        sessions=sessions,
        telemetry=telemetry,
        transactions=transactions,
        window_minutes=args.window_minutes,
    )
    enriched.to_csv(args.output, index=False)
    counts = enriched["quantum_risk_level"].value_counts().to_dict()
    print(f"Wrote quantum-risk enriched sessions to {args.output}")
    print(f"Quantum risk counts: {counts}")


if __name__ == "__main__":
    main()
