"""Streamlit dashboard for the CyberPulse prototype."""

from __future__ import annotations

import json
import os
from typing import Any

import altair as alt
import pandas as pd
import requests
import streamlit as st


DEFAULT_API_BASE = os.getenv("CYBERPULSE_API_BASE", "http://127.0.0.1:8000")

SEVERITY_COLORS = {
    "High": "#c62828",
    "Medium": "#b7791f",
    "Low": "#2e7d32",
}


st.set_page_config(page_title="CyberPulse", page_icon="CP", layout="wide")

st.markdown(
    """
    <style>
    .block-container {padding-top: 1.3rem; padding-bottom: 1.5rem;}
    .cp-title {font-size: 2rem; font-weight: 760; letter-spacing: 0; margin-bottom: .1rem;}
    .cp-subtitle {color: #52606d; margin-bottom: 1rem;}
    .badge {display: inline-block; padding: .28rem .58rem; border-radius: .35rem; color: white; font-weight: 700;}
    .badge-low {background: #2e7d32;}
    .badge-medium {background: #b7791f;}
    .badge-high {background: #c62828;}
    .small-label {font-size: .78rem; color: #52606d; text-transform: uppercase; letter-spacing: .05rem;}
    div[data-testid="stMetricValue"] {font-size: 1.55rem;}
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_data(ttl=15)
def api_get(api_base: str, path: str, params: dict[str, Any] | None = None) -> Any:
    response = requests.get(f"{api_base}{path}", params=params, timeout=15)
    response.raise_for_status()
    return response.json()


def api_post(api_base: str, path: str, payload: dict[str, Any]) -> Any:
    response = requests.post(f"{api_base}{path}", json=payload, timeout=15)
    response.raise_for_status()
    return response.json()


def risk_band(score: float) -> str:
    if score >= 85:
        return "Critical"
    if score >= 70:
        return "High"
    if score >= 40:
        return "Medium"
    return "Low"


def quantum_badge(level: str) -> str:
    css = {
        "High": "badge-high",
        "Medium": "badge-medium",
        "Low": "badge-low",
    }.get(level, "badge-low")
    return f"<span class='badge {css}'>{level}</span>"


def parse_contributions(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return value
    if pd.isna(value):
        return []
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return []


def simulate_payload(scenario: str) -> dict[str, Any]:
    base = {
        "geo_velocity_flag": 0,
        "failed_login_count": 0,
        "max_failed_attempts_last_10min": 0,
        "device_change_flag": 0,
        "time_since_last_known_device_ip_minutes": 0,
        "transaction_amount_zscore": 0,
        "max_transaction_amount": 0,
        "total_transaction_amount": 0,
        "new_beneficiary_flag": 0,
        "transaction_velocity": 0,
        "weak_crypto_flag": 0,
        "crypto_deprecated_signal_count": 0,
        "login_event_count": 1,
        "successful_login_count": 1,
        "unique_geo_count": 1,
        "unique_device_count": 1,
    }
    if scenario == "Impossible travel + high transfer":
        base.update(
            {
                "geo_velocity_flag": 1,
                "geo_velocity_detail": "Mumbai -> Berlin in 12 min",
                "transaction_amount_zscore": 9.0,
                "max_transaction_amount": 200000,
                "total_transaction_amount": 200000,
                "new_beneficiary_flag": 1,
                "unique_geo_count": 2,
            }
        )
    elif scenario == "Failed logins + new beneficiary":
        base.update(
            {
                "failed_login_count": 5,
                "max_failed_attempts_last_10min": 5,
                "transaction_amount_zscore": 6.2,
                "max_transaction_amount": 150000,
                "total_transaction_amount": 150000,
                "new_beneficiary_flag": 1,
                "login_event_count": 6,
            }
        )
    elif scenario == "Weak crypto + large transfer":
        base.update(
            {
                "weak_crypto_flag": 1,
                "crypto_deprecated_signal_count": 4,
                "transaction_amount_zscore": 7.5,
                "max_transaction_amount": 175000,
                "total_transaction_amount": 175000,
                "tls_version": "TLS 1.0",
                "cipher_suite": "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
                "cert_key_length": 1024,
                "cert_signature_alg": "SHA-1",
            }
        )
    else:
        base.update(
            {
                "device_change_flag": 1,
                "transaction_velocity": 4,
                "transaction_amount_zscore": 4.8,
                "max_transaction_amount": 85000,
                "total_transaction_amount": 240000,
                "new_beneficiary_flag": 1,
                "unique_device_count": 2,
            }
        )
    return base


def render_timeline(api_base: str, user_id: str) -> None:
    timeline = api_get(api_base, f"/user/{user_id}/timeline")
    events = pd.DataFrame(timeline["events"])
    if events.empty:
        st.info("No timeline events found.")
        return

    events["timestamp"] = pd.to_datetime(events["timestamp"])
    txns = events[events["event_type"] == "transaction"].copy()
    telemetry = events[events["event_type"] == "telemetry"].copy()
    max_amount = float(txns["amount"].max()) if not txns.empty else 1.0
    marker_y = max(max_amount * 1.08, 1.0)

    layers = []
    if not txns.empty:
        layers.append(
            alt.Chart(txns)
            .mark_bar(color="#3b82f6", size=8)
            .encode(
                x=alt.X("timestamp:T", title="Time"),
                y=alt.Y("amount:Q", title="Transaction amount / telemetry marker"),
                tooltip=[
                    alt.Tooltip("timestamp:T", title="Time"),
                    alt.Tooltip("amount:Q", title="Amount", format=",.0f"),
                    alt.Tooltip("detail:N", title="Detail"),
                ],
            )
        )
    if not telemetry.empty:
        telemetry["marker_y"] = marker_y
        layers.append(
            alt.Chart(telemetry)
            .mark_point(filled=True, size=95, shape="diamond")
            .encode(
                x=alt.X("timestamp:T", title="Time"),
                y=alt.Y("marker_y:Q", title="Transaction amount / telemetry marker"),
                color=alt.Color(
                    "login_status:N",
                    scale=alt.Scale(domain=["success", "fail"], range=["#2e7d32", "#c62828"]),
                    legend=alt.Legend(title="Login"),
                ),
                tooltip=[
                    alt.Tooltip("timestamp:T", title="Time"),
                    alt.Tooltip("login_status:N", title="Status"),
                    alt.Tooltip("geo_location:N", title="Geo"),
                    alt.Tooltip("detail:N", title="Detail"),
                ],
            )
        )

    if layers:
        chart = alt.layer(*layers).properties(height=340).interactive()
        st.altair_chart(chart, use_container_width=True)


def main() -> None:
    st.markdown("<div class='cp-title'>CyberPulse</div>", unsafe_allow_html=True)
    st.markdown(
        "<div class='cp-subtitle'>Correlated cyber telemetry, transaction behaviour, and quantum-risk signals.</div>",
        unsafe_allow_html=True,
    )

    with st.sidebar:
        api_base = st.text_input("API base", DEFAULT_API_BASE)
        min_risk = st.slider("Alert threshold", 0, 100, 70, 5)
        alert_limit = st.number_input("Alert rows", min_value=25, max_value=2000, value=300, step=25)

    try:
        stats = api_get(api_base, "/stats")
        alerts = pd.DataFrame(
            api_get(api_base, "/alerts", {"min_risk": min_risk, "limit": int(alert_limit)})
        )
    except requests.RequestException as exc:
        st.error(f"Backend unavailable: {exc}")
        return

    stat_cols = st.columns(4)
    stat_cols[0].metric("Sessions analyzed", f"{stats['total_sessions']:,}")
    stat_cols[1].metric("Alerts flagged", f"{stats['flagged_count']:,}")
    stat_cols[2].metric("High quantum risk", f"{stats['high_quantum_risk_count']:,}")
    stat_cols[3].metric("FP reduction", f"{stats['estimated_false_positive_reduction_pct']}%")

    if alerts.empty:
        st.warning("No alerts match the current threshold.")
        return

    alerts["risk_band"] = alerts["risk_score"].apply(risk_band)
    feed_columns = ["user_id", "timestamp", "risk_score", "risk_band", "quantum_risk_level", "explanation"]
    st.subheader("Alert Feed")
    st.dataframe(
        alerts[feed_columns],
        hide_index=True,
        use_container_width=True,
        column_config={
            "risk_score": st.column_config.ProgressColumn("Risk score", min_value=0, max_value=100, format="%.1f"),
            "timestamp": st.column_config.DatetimeColumn("Timestamp"),
            "explanation": st.column_config.TextColumn("Explanation", width="large"),
        },
    )

    left, right = st.columns([1.15, 0.85])
    session_options = alerts["session_id"].tolist()
    selected_session_id = left.selectbox("Selected session", session_options, index=0)
    selected = alerts[alerts["session_id"] == selected_session_id].iloc[0]

    with left:
        st.subheader(f"User {selected['user_id']} Timeline")
        render_timeline(api_base, str(selected["user_id"]))

    with right:
        st.subheader("Session Detail")
        st.markdown(
            f"<div class='small-label'>Quantum risk</div>{quantum_badge(str(selected['quantum_risk_level']))}",
            unsafe_allow_html=True,
        )
        st.write(selected["quantum_risk_explanation"])
        st.write(selected["explanation"])

        contributions = parse_contributions(selected.get("feature_contributions"))
        if contributions:
            contrib_df = pd.DataFrame(contributions)
            severity_value = {"high": 3, "medium": 2, "low": 1}
            contrib_df["weight"] = contrib_df["severity"].map(severity_value).fillna(1)
            contrib_chart = (
                alt.Chart(contrib_df)
                .mark_bar()
                .encode(
                    x=alt.X("weight:Q", axis=None),
                    y=alt.Y("feature:N", sort="-x", title=None),
                    color=alt.Color(
                        "severity:N",
                        scale=alt.Scale(
                            domain=["high", "medium", "low"],
                            range=["#c62828", "#b7791f", "#2e7d32"],
                        ),
                        legend=None,
                    ),
                    tooltip=[
                        alt.Tooltip("feature:N", title="Feature"),
                        alt.Tooltip("value:N", title="Value"),
                        alt.Tooltip("severity:N", title="Severity"),
                    ],
                )
                .properties(height=240)
            )
            st.altair_chart(contrib_chart, use_container_width=True)

        st.subheader("Simulate Attack")
        scenario = st.selectbox(
            "Scenario",
            [
                "Impossible travel + high transfer",
                "Failed logins + new beneficiary",
                "Weak crypto + large transfer",
                "Device change + transaction velocity",
            ],
        )
        if st.button("Simulate an attack", type="primary"):
            try:
                result = api_post(api_base, "/score-session", simulate_payload(scenario))
                st.metric("Live risk score", f"{result['risk_score']:.1f}")
                st.markdown(quantum_badge(result["quantum_risk_level"]), unsafe_allow_html=True)
                st.write(result["explanation"])
                st.caption(result["quantum_risk_explanation"])
            except requests.RequestException as exc:
                st.error(f"Simulation failed: {exc}")


if __name__ == "__main__":
    main()
