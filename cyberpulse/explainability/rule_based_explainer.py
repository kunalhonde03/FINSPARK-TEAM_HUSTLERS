"""Rule-based explanations for CyberPulse alert sessions."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DEFAULT_SCORED = DATA_DIR / "scored_sessions.csv"
DEFAULT_OUTPUT = DATA_DIR / "alerts_explained.csv"


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).lower() in {"true", "1", "yes"}


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _format_money(amount: float) -> str:
    return f"INR {amount:,.0f}"


def contribution_items(session: pd.Series | dict[str, Any]) -> list[dict[str, Any]]:
    """Return structured feature reasons for UI display."""

    row = dict(session)
    items: list[dict[str, Any]] = []

    if int(_as_float(row.get("geo_velocity_flag"))) == 1:
        detail = row.get("geo_velocity_detail") or "geographically distant logins in one session"
        items.append(
            {
                "feature": "Impossible travel",
                "value": str(detail),
                "severity": "high",
            }
        )

    failed_count = int(_as_float(row.get("failed_login_count")))
    max_recent = int(_as_float(row.get("max_failed_attempts_last_10min")))
    if failed_count >= 3 or max_recent >= 3:
        items.append(
            {
                "feature": "Failed-login burst",
                "value": f"{max(failed_count, max_recent)} failed attempts within the session",
                "severity": "high" if max(failed_count, max_recent) >= 5 else "medium",
            }
        )

    if int(_as_float(row.get("device_change_flag"))) == 1:
        unique_devices = int(_as_float(row.get("unique_device_count"), 2))
        items.append(
            {
                "feature": "Device change",
                "value": f"{unique_devices} device fingerprints observed",
                "severity": "medium",
            }
        )

    zscore = _as_float(row.get("transaction_amount_zscore"))
    max_amount = _as_float(row.get("max_transaction_amount"))
    if zscore >= 3.0 or max_amount >= 100000:
        items.append(
            {
                "feature": "High-value transfer",
                "value": f"{_format_money(max_amount)} ({zscore:.1f} z-score)",
                "severity": "high" if zscore >= 5.0 or max_amount >= 175000 else "medium",
            }
        )

    if int(_as_float(row.get("new_beneficiary_flag"))) == 1:
        items.append(
            {
                "feature": "New beneficiary",
                "value": "first-time beneficiary in the same session",
                "severity": "medium",
            }
        )

    velocity = int(_as_float(row.get("transaction_velocity")))
    if velocity >= 3:
        items.append(
            {
                "feature": "Transaction velocity",
                "value": f"{velocity} transactions in the session window",
                "severity": "medium" if velocity < 5 else "high",
            }
        )

    crypto_count = int(_as_float(row.get("crypto_deprecated_signal_count")))
    if int(_as_float(row.get("weak_crypto_flag"))) == 1:
        items.append(
            {
                "feature": "Weak crypto",
                "value": f"{max(1, crypto_count)} deprecated TLS/cipher/certificate signal(s)",
                "severity": "high",
            }
        )

    if not items and _as_float(row.get("risk_score")) >= 70:
        items.append(
            {
                "feature": "Combined anomaly",
                "value": "multiple low-frequency session signals combined into a high anomaly score",
                "severity": "medium",
            }
        )

    return items


def explain_session(session: pd.Series | dict[str, Any]) -> str:
    items = contribution_items(session)
    if not items:
        return "No major rule threshold was crossed; model score remains low."

    phrases = [f"{item['feature'].lower()} ({item['value']})" for item in items]
    return "Flagged due to: " + " + ".join(phrases)


def add_explanations(scored_sessions: pd.DataFrame) -> pd.DataFrame:
    explained = scored_sessions.copy()
    explained["explanation"] = explained.apply(explain_session, axis=1)
    explained["feature_contributions"] = explained.apply(
        lambda row: json.dumps(contribution_items(row)),
        axis=1,
    )
    return explained


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate CyberPulse rule-based explanations.")
    parser.add_argument("--scored", type=Path, default=DEFAULT_SCORED)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    scored = pd.read_csv(args.scored)
    explained = add_explanations(scored)
    explained.to_csv(args.output, index=False)
    flagged = int((explained["risk_score"] >= 70).sum()) if "risk_score" in explained else 0
    sample = explained.sort_values("risk_score", ascending=False).iloc[0]["explanation"]
    print(f"Wrote explanations to {args.output}; {flagged:,} sessions are risk_score >= 70")
    print(f"Top alert explanation: {sample}")


if __name__ == "__main__":
    main()
