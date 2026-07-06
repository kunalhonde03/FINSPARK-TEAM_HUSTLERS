"""Build per-session features by correlating telemetry and transactions."""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DEFAULT_TELEMETRY = DATA_DIR / "telemetry.csv"
DEFAULT_TRANSACTIONS = DATA_DIR / "transactions.csv"
DEFAULT_OUTPUT = DATA_DIR / "session_features.csv"

SESSION_FEATURE_COLUMNS = [
    "geo_velocity_flag",
    "failed_login_count",
    "max_failed_attempts_last_10min",
    "device_change_flag",
    "time_since_last_known_device_ip_minutes",
    "transaction_amount_zscore",
    "max_transaction_amount",
    "total_transaction_amount",
    "new_beneficiary_flag",
    "transaction_velocity",
    "weak_crypto_flag",
    "crypto_deprecated_signal_count",
    "login_event_count",
    "successful_login_count",
    "unique_geo_count",
    "unique_device_count",
]

CITY_COORDS = {
    "Mumbai": (19.0760, 72.8777),
    "Delhi": (28.7041, 77.1025),
    "Bengaluru": (12.9716, 77.5946),
    "Chennai": (13.0827, 80.2707),
    "Hyderabad": (17.3850, 78.4867),
    "Pune": (18.5204, 73.8567),
    "Kolkata": (22.5726, 88.3639),
    "Singapore": (1.3521, 103.8198),
    "Dubai": (25.2048, 55.2708),
    "Berlin": (52.5200, 13.4050),
}


@dataclass
class GeoVelocityResult:
    flag: int
    detail: str


def _bool_series(series: pd.Series) -> pd.Series:
    if series.empty:
        return pd.Series(dtype=bool)
    if series.dtype == bool:
        return series.fillna(False)
    return series.astype(str).str.lower().isin(["true", "1", "yes"])


def _parse_timestamps(series: pd.Series) -> pd.Series:
    try:
        return pd.to_datetime(series, format="mixed")
    except (TypeError, ValueError):
        return pd.to_datetime(series)


def _haversine_km(city_a: str, city_b: str) -> float:
    if city_a not in CITY_COORDS or city_b not in CITY_COORDS:
        return 0.0
    lat1, lon1 = CITY_COORDS[city_a]
    lat2, lon2 = CITY_COORDS[city_b]
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * radius_km * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _geo_velocity(telemetry: pd.DataFrame) -> GeoVelocityResult:
    if len(telemetry) < 2:
        return GeoVelocityResult(0, "")

    events = telemetry.sort_values("timestamp")
    last_city = None
    last_timestamp = None
    strongest_detail = ""
    strongest_speed = 0.0

    for row in events.itertuples(index=False):
        city = getattr(row, "geo_location", None)
        timestamp = getattr(row, "timestamp", None)
        if not city or city not in CITY_COORDS:
            continue
        if last_city and last_city != city and last_timestamp is not None:
            minutes = max(1.0, (timestamp - last_timestamp).total_seconds() / 60.0)
            speed_kmh = _haversine_km(last_city, city) / (minutes / 60.0)
            if speed_kmh > strongest_speed:
                strongest_speed = speed_kmh
                strongest_detail = f"{last_city} -> {city} in {minutes:.0f} min"
        last_city = city
        last_timestamp = timestamp

    return GeoVelocityResult(int(strongest_speed > 900.0), strongest_detail if strongest_speed > 900.0 else "")


def is_weak_crypto_row(row: pd.Series) -> bool:
    tls_version = str(row.get("tls_version", "")).upper().replace("TLS", "").strip()
    try:
        tls_number = float(tls_version)
    except ValueError:
        tls_number = 9.9

    cipher = str(row.get("cipher_suite", "")).upper()
    cert_signature = str(row.get("cert_signature_alg", "")).upper()
    try:
        key_length = int(row.get("cert_key_length", 4096))
    except (TypeError, ValueError):
        key_length = 4096

    deprecated_cipher = any(
        token in cipher
        for token in ["3DES", "RC4", "MD5", "EXPORT", "NULL", "_CBC_"]
    ) or cipher.startswith("TLS_RSA_WITH")

    return tls_number < 1.2 or deprecated_cipher or key_length < 2048 or cert_signature == "SHA-1"


def _prepare_streams(
    telemetry: pd.DataFrame,
    transactions: pd.DataFrame,
    window_minutes: int,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    telemetry = telemetry.copy()
    transactions = transactions.copy()
    telemetry["timestamp"] = _parse_timestamps(telemetry["timestamp"])
    transactions["timestamp"] = _parse_timestamps(transactions["timestamp"])

    telemetry["source_type"] = "telemetry"
    transactions["source_type"] = "transaction"
    telemetry["source_id"] = telemetry["event_id"]
    transactions["source_id"] = transactions["txn_id"]

    timeline = pd.concat(
        [
            telemetry[["user_id", "timestamp", "source_type", "source_id"]],
            transactions[["user_id", "timestamp", "source_type", "source_id"]],
        ],
        ignore_index=True,
    ).sort_values(["user_id", "timestamp", "source_type"])

    gap = timeline.groupby("user_id")["timestamp"].diff().gt(pd.Timedelta(minutes=window_minutes))
    first_for_user = timeline.groupby("user_id").cumcount().eq(0)
    timeline["session_index"] = (gap | first_for_user).groupby(timeline["user_id"]).cumsum()
    timeline["session_id"] = timeline.apply(
        lambda row: f"{row['user_id']}_S{int(row['session_index']):05d}",
        axis=1,
    )

    session_map = timeline[["source_type", "source_id", "session_id"]]
    telemetry = telemetry.merge(
        session_map[session_map["source_type"] == "telemetry"][["source_id", "session_id"]],
        on="source_id",
        how="left",
    )
    transactions = transactions.merge(
        session_map[session_map["source_type"] == "transaction"][["source_id", "session_id"]],
        on="source_id",
        how="left",
    )
    return telemetry, transactions, timeline


def _safe_unique(values: Iterable[object]) -> list[str]:
    return sorted({str(value) for value in values if pd.notna(value)})


def build_session_features(
    telemetry: pd.DataFrame,
    transactions: pd.DataFrame,
    window_minutes: int = 30,
) -> pd.DataFrame:
    """Return one row per correlated user session, ready for unsupervised modeling."""

    telemetry, transactions, timeline = _prepare_streams(telemetry, transactions, window_minutes)
    transactions["beneficiary_is_new"] = _bool_series(transactions["beneficiary_is_new"])
    telemetry["is_attack_scenario"] = _bool_series(telemetry["is_attack_scenario"])
    transactions["is_attack_scenario"] = _bool_series(transactions["is_attack_scenario"])
    telemetry["weak_crypto_row"] = telemetry.apply(is_weak_crypto_row, axis=1)

    telemetry_by_session = {key: group.copy() for key, group in telemetry.groupby("session_id")}
    transactions_by_session = {key: group.copy() for key, group in transactions.groupby("session_id")}
    empty_telemetry = telemetry.iloc[0:0].copy()
    empty_transactions = transactions.iloc[0:0].copy()

    user_txn_stats = transactions.groupby("user_id")["amount"].agg(["median", "std"]).rename(
        columns={"median": "user_amount_median", "std": "user_amount_std"}
    )

    rows: list[dict[str, object]] = []
    last_seen_by_user: dict[str, dict[str, pd.Timestamp]] = {}

    for session_id, session_events in timeline.groupby("session_id", sort=False):
        user_id = str(session_events["user_id"].iloc[0])
        session_start = session_events["timestamp"].min()
        session_end = session_events["timestamp"].max()
        tele = telemetry_by_session.get(session_id, empty_telemetry)
        txns = transactions_by_session.get(session_id, empty_transactions)

        geo_velocity = _geo_velocity(tele)
        devices = _safe_unique(tele["device_fingerprint"]) if not tele.empty else []
        ips = _safe_unique(tele["ip_address"]) if not tele.empty else []
        seen = last_seen_by_user.setdefault(user_id, {})
        prior_minutes: list[float] = []

        for identity in devices + ips:
            if identity in seen:
                prior_minutes.append((session_start - seen[identity]).total_seconds() / 60.0)

        time_since_known = min(prior_minutes) if prior_minutes else 0.0
        for identity in devices + ips:
            seen[identity] = session_end

        failed_login_count = int((tele["login_status"] == "fail").sum()) if not tele.empty else 0
        successful_login_count = int((tele["login_status"] == "success").sum()) if not tele.empty else 0
        max_failed_recent = (
            int(tele["failed_attempts_last_10min"].fillna(0).max()) if not tele.empty else 0
        )
        weak_crypto_count = int(tele["weak_crypto_row"].sum()) if not tele.empty else 0

        txn_count = int(len(txns))
        max_amount = float(txns["amount"].max()) if txn_count else 0.0
        total_amount = float(txns["amount"].sum()) if txn_count else 0.0
        user_stat = user_txn_stats.loc[user_id] if user_id in user_txn_stats.index else None
        user_median = float(user_stat["user_amount_median"]) if user_stat is not None else 0.0
        user_std = float(user_stat["user_amount_std"]) if user_stat is not None else 0.0
        if not np.isfinite(user_std) or user_std < max(1.0, user_median * 0.1):
            user_std = max(1.0, user_median * 0.5)
        amount_zscore = (max_amount - user_median) / user_std if txn_count else 0.0

        attack_types = set()
        if not tele.empty:
            attack_types.update(tele.loc[tele["attack_type"] != "normal", "attack_type"].astype(str))
        if not txns.empty:
            attack_types.update(txns.loc[txns["attack_type"] != "normal", "attack_type"].astype(str))

        rows.append(
            {
                "session_id": session_id,
                "user_id": user_id,
                "session_start": session_start.isoformat(),
                "session_end": session_end.isoformat(),
                "duration_minutes": round(
                    max(1.0, (session_end - session_start).total_seconds() / 60.0), 2
                ),
                "geo_velocity_flag": geo_velocity.flag,
                "geo_velocity_detail": geo_velocity.detail,
                "failed_login_count": failed_login_count,
                "max_failed_attempts_last_10min": max_failed_recent,
                "device_change_flag": int(len(devices) > 1),
                "time_since_last_known_device_ip_minutes": round(float(time_since_known), 2),
                "transaction_amount_zscore": round(float(amount_zscore), 4),
                "max_transaction_amount": round(float(max_amount), 2),
                "total_transaction_amount": round(float(total_amount), 2),
                "new_beneficiary_flag": int(bool(txns["beneficiary_is_new"].any())) if txn_count else 0,
                "transaction_velocity": txn_count,
                "weak_crypto_flag": int(weak_crypto_count > 0),
                "crypto_deprecated_signal_count": weak_crypto_count,
                "login_event_count": int(len(tele)),
                "successful_login_count": successful_login_count,
                "unique_geo_count": int(tele["geo_location"].nunique()) if not tele.empty else 0,
                "unique_device_count": int(tele["device_fingerprint"].nunique()) if not tele.empty else 0,
                "session_is_attack_scenario": bool(
                    (not tele.empty and bool(tele["is_attack_scenario"].any()))
                    or (not txns.empty and bool(txns["is_attack_scenario"].any()))
                ),
                "session_attack_types": "|".join(sorted(attack_types)) if attack_types else "normal",
            }
        )

    features = pd.DataFrame(rows)
    for column in SESSION_FEATURE_COLUMNS:
        if column not in features:
            features[column] = 0
    return features.sort_values(["session_start", "user_id"]).reset_index(drop=True)


def load_and_build(
    telemetry_path: Path = DEFAULT_TELEMETRY,
    transactions_path: Path = DEFAULT_TRANSACTIONS,
    window_minutes: int = 30,
) -> pd.DataFrame:
    telemetry = pd.read_csv(telemetry_path)
    transactions = pd.read_csv(transactions_path)
    return build_session_features(telemetry, transactions, window_minutes=window_minutes)


def feature_matrix(session_features: pd.DataFrame) -> pd.DataFrame:
    """Return numeric modeling features, explicitly excluding validation labels."""

    return session_features[SESSION_FEATURE_COLUMNS].copy()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build CyberPulse session feature table.")
    parser.add_argument("--telemetry", type=Path, default=DEFAULT_TELEMETRY)
    parser.add_argument("--transactions", type=Path, default=DEFAULT_TRANSACTIONS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--window-minutes", type=int, default=30)
    args = parser.parse_args()

    session_features = load_and_build(
        telemetry_path=args.telemetry,
        transactions_path=args.transactions,
        window_minutes=args.window_minutes,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    session_features.to_csv(args.output, index=False)

    attack_sessions = int(session_features["session_is_attack_scenario"].sum())
    print(
        f"Wrote {len(session_features):,} session rows to {args.output}; "
        f"{attack_sessions:,} sessions include injected attack evidence"
    )


if __name__ == "__main__":
    main()
