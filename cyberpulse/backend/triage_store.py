from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
TRIAGE_STORE_PATH = DATA_DIR / "alert_triage.json"
VALID_STATUSES = ["new", "investigating", "escalated", "resolved"]
DEFAULT_STATUS = "new"


def _ensure_store_file() -> None:
    TRIAGE_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not TRIAGE_STORE_PATH.exists():
        TRIAGE_STORE_PATH.write_text("{}", encoding="utf-8")


def load_triage_index() -> dict[str, dict[str, Any]]:
    _ensure_store_file()
    try:
        with TRIAGE_STORE_PATH.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except json.JSONDecodeError:
        payload = {}

    if not isinstance(payload, dict):
        payload = {}
    return {
        str(session_id): {
            "status": str(item.get("status", DEFAULT_STATUS)).lower(),
            "note": item.get("note"),
            "updated_at": item.get("updated_at"),
        }
        for session_id, item in payload.items()
        if isinstance(item, dict)
    }


def save_triage_index(index: dict[str, dict[str, Any]]) -> None:
    _ensure_store_file()
    with TRIAGE_STORE_PATH.open("w", encoding="utf-8") as handle:
        json.dump(index, handle, indent=2, sort_keys=True)


def normalize_status(value: str | None) -> str:
    cleaned = (value or DEFAULT_STATUS).strip().lower()
    return cleaned if cleaned in VALID_STATUSES else DEFAULT_STATUS


def set_triage_status(session_id: str, status: str | None = None, note: str | None = None) -> dict[str, Any]:
    index = load_triage_index()
    next_status = normalize_status(status)
    entry = index.get(str(session_id), {})
    entry.update(
        {
            "status": next_status,
            "note": note,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    index[str(session_id)] = entry
    save_triage_index(index)
    return entry


def apply_triage_state(alerts: pd.DataFrame, index: dict[str, dict[str, Any]] | None = None) -> pd.DataFrame:
    enriched = alerts.copy()
    triage_index = index or load_triage_index()
    triage_status = []
    triage_note = []
    for session_id in enriched.get("session_id", pd.Series(dtype=object)):
        entry = triage_index.get(str(session_id), {})
        triage_status.append(entry.get("status", DEFAULT_STATUS))
        triage_note.append(entry.get("note"))
    enriched["triage_status"] = triage_status
    enriched["triage_note"] = triage_note
    return enriched
