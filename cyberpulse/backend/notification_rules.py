"""Notification rules engine for CyberPulse alerts."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
RULES_STORE_PATH = DATA_DIR / "notification_rules.json"


def _ensure_rules_file() -> None:
    RULES_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not RULES_STORE_PATH.exists():
        RULES_STORE_PATH.write_text(json.dumps({"rules": []}, indent=2), encoding="utf-8")


def load_notification_rules() -> list[dict[str, Any]]:
    """Load all notification rules."""
    _ensure_rules_file()
    try:
        with RULES_STORE_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("rules", [])
    except json.JSONDecodeError:
        return []


def save_notification_rules(rules: list[dict[str, Any]]) -> None:
    """Save notification rules."""
    _ensure_rules_file()
    with RULES_STORE_PATH.open("w", encoding="utf-8") as f:
        json.dump({"rules": rules}, f, indent=2)


def create_notification_rule(
    name: str,
    condition_type: str,
    condition_value: Any,
    notification_target: str,
    enabled: bool = True,
) -> dict[str, Any]:
    """Create a new notification rule.
    
    condition_type options:
    - "min_risk_score": Alert when risk_score >= condition_value
    - "quantum_risk": Alert when quantum_risk_level == condition_value (High/Medium/Low)
    - "attack_type": Alert when attack matches condition_value pattern
    - "user_id": Alert for specific user_id
    - "triage_status": Alert when triage status changes to condition_value
    
    notification_target examples:
    - "webhook:https://example.com/alerts"
    - "email:analyst@bank.com"
    - "slack:#security-alerts"
    """
    rule = {
        "rule_id": f"rule_{datetime.now(timezone.utc).timestamp()}",
        "name": name,
        "condition_type": condition_type,
        "condition_value": condition_value,
        "notification_target": notification_target,
        "enabled": enabled,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return rule


def add_notification_rule(rule: dict[str, Any]) -> dict[str, Any]:
    """Add a notification rule to the store."""
    rules = load_notification_rules()
    rules.append(rule)
    save_notification_rules(rules)
    return rule


def delete_notification_rule(rule_id: str) -> bool:
    """Delete a notification rule by ID."""
    rules = load_notification_rules()
    original_count = len(rules)
    rules = [r for r in rules if r.get("rule_id") != rule_id]
    if len(rules) < original_count:
        save_notification_rules(rules)
        return True
    return False


def evaluate_alert_against_rules(alert: dict[str, Any]) -> list[dict[str, Any]]:
    """Evaluate an alert against all active rules and return matching rules."""
    rules = load_notification_rules()
    triggered_rules = []

    for rule in rules:
        if not rule.get("enabled", True):
            continue

        matches = False
        condition_type = rule.get("condition_type", "")
        condition_value = rule.get("condition_value")

        if condition_type == "min_risk_score":
            matches = alert.get("risk_score", 0) >= condition_value

        elif condition_type == "quantum_risk":
            matches = alert.get("quantum_risk_level") == condition_value

        elif condition_type == "attack_type":
            alert_type = alert.get("attack_type", "")
            matches = condition_value.lower() in alert_type.lower()

        elif condition_type == "user_id":
            matches = alert.get("user_id") == condition_value

        elif condition_type == "triage_status":
            matches = alert.get("triage_status") == condition_value

        if matches:
            triggered_rules.append(rule)

    return triggered_rules


def get_notification_targets(alert: dict[str, Any]) -> list[str]:
    """Get all notification targets for an alert based on triggered rules."""
    triggered_rules = evaluate_alert_against_rules(alert)
    targets = []
    for rule in triggered_rules:
        target = rule.get("notification_target")
        if target and target not in targets:
            targets.append(target)
    return targets
