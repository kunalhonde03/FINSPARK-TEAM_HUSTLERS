"""Inject labeled cross-stream attack scenarios for CyberPulse validation."""

from __future__ import annotations

import argparse
import random
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DEFAULT_TELEMETRY = DATA_DIR / "telemetry.csv"
DEFAULT_TRANSACTIONS = DATA_DIR / "transactions.csv"

CITY_IP_PREFIX = {
    "Mumbai": "49.36",
    "Berlin": "91.64",
    "Delhi": "103.48",
    "Singapore": "101.100",
    "Dubai": "185.52",
}

ATTACK_TYPES = [
    "impossible_travel",
    "credential_stuffing_new_beneficiary",
    "weak_crypto_large_transfer",
    "device_change_transaction_velocity",
]


def _ip_for_city(city: str) -> str:
    prefix = CITY_IP_PREFIX[city]
    return f"{prefix}.{random.randint(0, 255)}.{random.randint(1, 254)}"


def _next_numeric_id(series: pd.Series, prefix: str) -> int:
    if series.empty:
        return 1
    numeric = series.astype(str).str.extract(r"(\d+)$")[0].dropna().astype(int)
    return int(numeric.max()) + 1 if not numeric.empty else 1


def _base_row_values(transactions: pd.DataFrame, user_id: str) -> tuple[float, str]:
    user_rows = transactions[transactions["user_id"] == user_id]
    if user_rows.empty:
        return 5000.0, "mobile"
    avg_amount = float(user_rows["user_avg_txn_amount"].median())
    channel = str(user_rows["channel"].mode().iloc[0])
    return avg_amount, channel


def _telemetry_row(
    event_id: str,
    user_id: str,
    timestamp: datetime,
    city: str,
    device: str,
    login_status: str = "success",
    failed_attempts: int = 0,
    tls_version: str = "TLS 1.3",
    cipher_suite: str = "TLS_AES_256_GCM_SHA384",
    cert_key_length: int = 2048,
    cert_signature_alg: str = "SHA-256",
    attack_type: str = "normal",
) -> dict[str, object]:
    return {
        "event_id": event_id,
        "user_id": user_id,
        "timestamp": timestamp.isoformat(),
        "ip_address": _ip_for_city(city),
        "geo_location": city,
        "device_fingerprint": device,
        "login_status": login_status,
        "auth_method": "password" if login_status == "fail" else "mfa",
        "tls_version": tls_version,
        "cipher_suite": cipher_suite,
        "cert_key_length": cert_key_length,
        "cert_signature_alg": cert_signature_alg,
        "failed_attempts_last_10min": failed_attempts,
        "is_attack_scenario": attack_type != "normal",
        "attack_type": attack_type,
    }


def _transaction_row(
    txn_id: str,
    user_id: str,
    timestamp: datetime,
    amount: float,
    channel: str,
    beneficiary_is_new: bool,
    merchant_category: str,
    user_avg_txn_amount: float,
    attack_type: str,
) -> dict[str, object]:
    beneficiary_suffix = random.randint(20000, 99999) if beneficiary_is_new else random.randint(1, 18)
    return {
        "txn_id": txn_id,
        "user_id": user_id,
        "timestamp": timestamp.isoformat(),
        "amount": round(amount, 2),
        "channel": channel,
        "beneficiary_id": f"B_{user_id}_{beneficiary_suffix}",
        "beneficiary_is_new": bool(beneficiary_is_new),
        "merchant_category": merchant_category,
        "user_avg_txn_amount": round(user_avg_txn_amount, 2),
        "is_attack_scenario": True,
        "attack_type": attack_type,
    }


def inject_attacks(
    telemetry: pd.DataFrame,
    transactions: pd.DataFrame,
    attack_rate: float = 0.05,
    seed: int = 126,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Append labeled attacks until about attack_rate of rows are scenario rows."""

    random.seed(seed)

    telemetry = telemetry.copy()
    transactions = transactions.copy()
    telemetry["timestamp"] = pd.to_datetime(telemetry["timestamp"])
    transactions["timestamp"] = pd.to_datetime(transactions["timestamp"])

    user_ids = sorted(set(telemetry["user_id"]).intersection(set(transactions["user_id"])))
    target_attack_rows = max(40, int((len(telemetry) + len(transactions)) * attack_rate))
    attack_rows_added = 0
    event_counter = _next_numeric_id(telemetry["event_id"], "evt")
    txn_counter = _next_numeric_id(transactions["txn_id"], "txn")
    injected_telemetry: list[dict[str, object]] = []
    injected_transactions: list[dict[str, object]] = []

    min_time = min(telemetry["timestamp"].min(), transactions["timestamp"].min())
    max_time = max(telemetry["timestamp"].max(), transactions["timestamp"].max())
    total_minutes = max(60, int((max_time - min_time).total_seconds() // 60))

    scenario_index = 0
    while attack_rows_added < target_attack_rows:
        attack_type = ATTACK_TYPES[scenario_index % len(ATTACK_TYPES)]
        user_id = random.choice(user_ids)
        avg_amount, usual_channel = _base_row_values(transactions, user_id)
        base_time = min_time + timedelta(minutes=random.randint(30, total_minutes - 30))
        device_a = f"attack_dev_{user_id}_trusted"
        device_b = f"attack_dev_{user_id}_new_{scenario_index}"

        def next_event_id() -> str:
            nonlocal event_counter
            value = f"evt_{event_counter:07d}"
            event_counter += 1
            return value

        def next_txn_id() -> str:
            nonlocal txn_counter
            value = f"txn_{txn_counter:07d}"
            txn_counter += 1
            return value

        if attack_type == "impossible_travel":
            injected_telemetry.extend(
                [
                    _telemetry_row(next_event_id(), user_id, base_time, "Mumbai", device_a, attack_type=attack_type),
                    _telemetry_row(
                        next_event_id(),
                        user_id,
                        base_time + timedelta(minutes=12),
                        "Berlin",
                        device_a,
                        attack_type=attack_type,
                    ),
                ]
            )
            injected_transactions.append(
                _transaction_row(
                    next_txn_id(),
                    user_id,
                    base_time + timedelta(minutes=15),
                    max(avg_amount * 9, 200000.0),
                    "web",
                    True,
                    "peer_transfer",
                    avg_amount,
                    attack_type,
                )
            )

        elif attack_type == "credential_stuffing_new_beneficiary":
            for offset in range(5):
                injected_telemetry.append(
                    _telemetry_row(
                        next_event_id(),
                        user_id,
                        base_time + timedelta(minutes=offset),
                        "Delhi",
                        device_b,
                        login_status="fail",
                        failed_attempts=offset + 1,
                        attack_type=attack_type,
                    )
                )
            injected_telemetry.append(
                _telemetry_row(
                    next_event_id(),
                    user_id,
                    base_time + timedelta(minutes=7),
                    "Delhi",
                    device_b,
                    failed_attempts=5,
                    attack_type=attack_type,
                )
            )
            injected_transactions.append(
                _transaction_row(
                    next_txn_id(),
                    user_id,
                    base_time + timedelta(minutes=11),
                    max(avg_amount * 6, 150000.0),
                    usual_channel,
                    True,
                    "peer_transfer",
                    avg_amount,
                    attack_type,
                )
            )

        elif attack_type == "weak_crypto_large_transfer":
            injected_telemetry.append(
                _telemetry_row(
                    next_event_id(),
                    user_id,
                    base_time,
                    "Dubai",
                    device_a,
                    tls_version="TLS 1.0",
                    cipher_suite="TLS_RSA_WITH_3DES_EDE_CBC_SHA",
                    cert_key_length=1024,
                    cert_signature_alg="SHA-1",
                    attack_type=attack_type,
                )
            )
            injected_transactions.append(
                _transaction_row(
                    next_txn_id(),
                    user_id,
                    base_time + timedelta(minutes=8),
                    max(avg_amount * 8, 175000.0),
                    "web",
                    False,
                    "investment",
                    avg_amount,
                    attack_type,
                )
            )

        elif attack_type == "device_change_transaction_velocity":
            injected_telemetry.extend(
                [
                    _telemetry_row(next_event_id(), user_id, base_time, "Mumbai", device_a, attack_type=attack_type),
                    _telemetry_row(
                        next_event_id(),
                        user_id,
                        base_time + timedelta(minutes=4),
                        "Mumbai",
                        device_b,
                        attack_type=attack_type,
                    ),
                ]
            )
            for offset in (6, 9, 13, 17):
                injected_transactions.append(
                    _transaction_row(
                        next_txn_id(),
                        user_id,
                        base_time + timedelta(minutes=offset),
                        max(avg_amount * random.uniform(2.5, 5.5), 60000.0),
                        random.choice(["mobile", "web"]),
                        offset == 6,
                        "peer_transfer",
                        avg_amount,
                        attack_type,
                    )
                )

        scenario_index += 1
        attack_rows_added = len(injected_telemetry) + len(injected_transactions)

    telemetry = pd.concat([telemetry, pd.DataFrame(injected_telemetry)], ignore_index=True)
    transactions = pd.concat([transactions, pd.DataFrame(injected_transactions)], ignore_index=True)
    telemetry = telemetry.sort_values(["timestamp", "user_id"]).reset_index(drop=True)
    transactions = transactions.sort_values(["timestamp", "user_id"]).reset_index(drop=True)

    return telemetry, transactions


def main() -> None:
    parser = argparse.ArgumentParser(description="Inject CyberPulse attack scenarios.")
    parser.add_argument("--telemetry", type=Path, default=DEFAULT_TELEMETRY)
    parser.add_argument("--transactions", type=Path, default=DEFAULT_TRANSACTIONS)
    parser.add_argument("--attack-rate", type=float, default=0.05)
    parser.add_argument("--seed", type=int, default=126)
    args = parser.parse_args()

    telemetry = pd.read_csv(args.telemetry)
    transactions = pd.read_csv(args.transactions)
    telemetry, transactions = inject_attacks(
        telemetry=telemetry,
        transactions=transactions,
        attack_rate=args.attack_rate,
        seed=args.seed,
    )

    telemetry.to_csv(args.telemetry, index=False)
    transactions.to_csv(args.transactions, index=False)

    tele_attack_rows = int(telemetry["is_attack_scenario"].sum())
    txn_attack_rows = int(transactions["is_attack_scenario"].sum())
    print(
        "Injected "
        f"{tele_attack_rows:,} telemetry attack rows and "
        f"{txn_attack_rows:,} transaction attack rows into {DATA_DIR}"
    )


if __name__ == "__main__":
    main()
