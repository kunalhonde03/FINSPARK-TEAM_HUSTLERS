"""Generate synthetic banking cybersecurity telemetry for CyberPulse."""

from __future__ import annotations

import argparse
import random
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DEFAULT_OUTPUT = DATA_DIR / "telemetry.csv"

START_TIME = datetime(2026, 1, 1, 8, 0, 0)
GEO_LOCATIONS = {
    "Mumbai": "49.36",
    "Delhi": "103.48",
    "Bengaluru": "106.51",
    "Chennai": "115.97",
    "Hyderabad": "122.16",
    "Pune": "152.58",
    "Kolkata": "157.39",
    "Singapore": "101.100",
    "Dubai": "185.52",
}
AUTH_METHODS = ["password", "mfa", "biometric", "passkey"]
TLS_VERSIONS = ["TLS 1.2", "TLS 1.3", "TLS 1.1"]
STRONG_CIPHERS = [
    "TLS_AES_256_GCM_SHA384",
    "TLS_AES_128_GCM_SHA256",
    "TLS_CHACHA20_POLY1305_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
]
WEAK_CIPHERS = [
    "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
    "TLS_RSA_WITH_AES_128_CBC_SHA",
]
CERT_SIGNATURES = ["SHA-256", "SHA-384", "SHA-1"]


def _ip_for_city(city: str) -> str:
    prefix = GEO_LOCATIONS[city]
    return f"{prefix}.{random.randint(0, 255)}.{random.randint(1, 254)}"


def _device_pool(user_id: str) -> list[str]:
    return [f"dev_{user_id}_{idx}_{random.randint(1000, 9999)}" for idx in range(1, 4)]


def _weighted_choice(values: list[str], weights: list[float]) -> str:
    return random.choices(values, weights=weights, k=1)[0]


def generate_telemetry(
    users: int = 120,
    events: int = 7500,
    days: int = 21,
    seed: int = 42,
) -> pd.DataFrame:
    """Create normal telemetry with a small natural background of weak signals."""

    random.seed(seed)
    np.random.seed(seed)

    user_ids = [f"U{1000 + idx}" for idx in range(users)]
    profiles = {
        user_id: {
            "home_city": random.choice(list(GEO_LOCATIONS.keys())[:7]),
            "devices": _device_pool(user_id),
        }
        for user_id in user_ids
    }

    rows: list[dict[str, object]] = []
    per_user = events // users
    remainder = events % users

    event_counter = 1
    for user_index, user_id in enumerate(user_ids):
        count = per_user + (1 if user_index < remainder else 0)
        profile = profiles[user_id]
        event_times = sorted(
            START_TIME + timedelta(minutes=random.randint(0, days * 24 * 60))
            for _ in range(count)
        )

        rolling_failures = 0
        last_event_time: datetime | None = None
        for event_time in event_times:
            if last_event_time and event_time - last_event_time > timedelta(minutes=10):
                rolling_failures = 0

            login_status = _weighted_choice(["success", "fail"], [0.92, 0.08])
            if login_status == "fail":
                rolling_failures += 1
            else:
                rolling_failures = max(0, rolling_failures - 1)

            weak_background = random.random() < 0.015
            tls_version = (
                _weighted_choice(TLS_VERSIONS, [0.58, 0.39, 0.03])
                if not weak_background
                else random.choice(["TLS 1.0", "TLS 1.1"])
            )
            cipher_suite = random.choice(WEAK_CIPHERS if weak_background else STRONG_CIPHERS)
            cert_key_length = random.choice([1024, 2048] if weak_background else [2048, 3072, 4096])
            cert_signature_alg = random.choice(["SHA-1", "SHA-256"] if weak_background else CERT_SIGNATURES[:2])

            city = (
                profile["home_city"]
                if random.random() < 0.87
                else random.choice(list(GEO_LOCATIONS.keys()))
            )

            rows.append(
                {
                    "event_id": f"evt_{event_counter:07d}",
                    "user_id": user_id,
                    "timestamp": event_time.isoformat(),
                    "ip_address": _ip_for_city(city),
                    "geo_location": city,
                    "device_fingerprint": random.choice(profile["devices"]),
                    "login_status": login_status,
                    "auth_method": random.choice(AUTH_METHODS),
                    "tls_version": tls_version,
                    "cipher_suite": cipher_suite,
                    "cert_key_length": cert_key_length,
                    "cert_signature_alg": cert_signature_alg,
                    "failed_attempts_last_10min": rolling_failures,
                    "is_attack_scenario": False,
                    "attack_type": "normal",
                }
            )
            last_event_time = event_time
            event_counter += 1

    return pd.DataFrame(rows).sort_values(["timestamp", "user_id"]).reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate CyberPulse telemetry CSV.")
    parser.add_argument("--users", type=int, default=120)
    parser.add_argument("--events", type=int, default=7500)
    parser.add_argument("--days", type=int, default=21)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    telemetry = generate_telemetry(
        users=args.users,
        events=args.events,
        days=args.days,
        seed=args.seed,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    telemetry.to_csv(args.output, index=False)
    print(f"Wrote {len(telemetry):,} telemetry rows to {args.output}")


if __name__ == "__main__":
    main()
