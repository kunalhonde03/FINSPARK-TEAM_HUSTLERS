"""Generate synthetic banking transaction events for CyberPulse."""

from __future__ import annotations

import argparse
import random
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DEFAULT_OUTPUT = DATA_DIR / "transactions.csv"

START_TIME = datetime(2026, 1, 1, 8, 0, 0)
CHANNELS = ["mobile", "web", "atm"]
MERCHANT_CATEGORIES = [
    "groceries",
    "utilities",
    "fuel",
    "travel",
    "electronics",
    "dining",
    "investment",
    "peer_transfer",
]


def _beneficiary_id(user_id: str, new: bool) -> str:
    suffix = random.randint(10000, 99999) if new else random.randint(1, 18)
    return f"B_{user_id}_{suffix}"


def generate_transactions(
    users: int = 120,
    transactions: int = 3200,
    days: int = 21,
    seed: int = 84,
) -> pd.DataFrame:
    """Create normal banking transactions over the same synthetic period."""

    random.seed(seed)
    np.random.seed(seed)

    user_ids = [f"U{1000 + idx}" for idx in range(users)]
    user_avg_amount = {
        user_id: float(np.random.lognormal(mean=8.2, sigma=0.45))
        for user_id in user_ids
    }

    rows: list[dict[str, object]] = []
    per_user = transactions // users
    remainder = transactions % users
    txn_counter = 1

    for user_index, user_id in enumerate(user_ids):
        count = per_user + (1 if user_index < remainder else 0)
        event_times = sorted(
            START_TIME + timedelta(minutes=random.randint(0, days * 24 * 60))
            for _ in range(count)
        )

        avg_amount = user_avg_amount[user_id]
        for event_time in event_times:
            new_beneficiary = random.random() < 0.08
            category = random.choice(MERCHANT_CATEGORIES)
            channel = random.choices(CHANNELS, weights=[0.58, 0.32, 0.10], k=1)[0]

            if category == "investment":
                multiplier = np.random.lognormal(mean=0.25, sigma=0.6)
            elif category == "electronics":
                multiplier = np.random.lognormal(mean=0.15, sigma=0.55)
            else:
                multiplier = np.random.lognormal(mean=-0.1, sigma=0.45)

            amount = max(50.0, min(avg_amount * multiplier, avg_amount * 7))

            rows.append(
                {
                    "txn_id": f"txn_{txn_counter:07d}",
                    "user_id": user_id,
                    "timestamp": event_time.isoformat(),
                    "amount": round(float(amount), 2),
                    "channel": channel,
                    "beneficiary_id": _beneficiary_id(user_id, new_beneficiary),
                    "beneficiary_is_new": bool(new_beneficiary),
                    "merchant_category": category,
                    "user_avg_txn_amount": round(avg_amount, 2),
                    "is_attack_scenario": False,
                    "attack_type": "normal",
                }
            )
            txn_counter += 1

    return pd.DataFrame(rows).sort_values(["timestamp", "user_id"]).reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate CyberPulse transaction CSV.")
    parser.add_argument("--users", type=int, default=120)
    parser.add_argument("--transactions", type=int, default=3200)
    parser.add_argument("--days", type=int, default=21)
    parser.add_argument("--seed", type=int, default=84)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    transactions = generate_transactions(
        users=args.users,
        transactions=args.transactions,
        days=args.days,
        seed=args.seed,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    transactions.to_csv(args.output, index=False)
    print(f"Wrote {len(transactions):,} transaction rows to {args.output}")


if __name__ == "__main__":
    main()
