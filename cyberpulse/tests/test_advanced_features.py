#!/usr/bin/env python3
"""Test script for CyberPulse advanced features."""

import asyncio
import json
import sys
from pathlib import Path

import requests

# Add project root to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

BASE_URL = "http://127.0.0.1:8000"


def test_advanced_filtering():
    """Test the advanced filtering on /alerts endpoint."""
    print("\n" + "=" * 70)
    print("TEST 1: ADVANCED ALERT FILTERING")
    print("=" * 70)

    tests = [
        {
            "name": "Risk range filter (70-85)",
            "params": {"min_risk": 70, "max_risk": 85},
        },
        {
            "name": "Quantum risk filter",
            "params": {"quantum_risk_level": "High"},
        },
        {
            "name": "Triage status filter",
            "params": {"triage_status": "new"},
        },
        {
            "name": "Combined filters",
            "params": {
                "min_risk": 75,
                "quantum_risk_level": "High",
                "limit": 5,
            },
        },
    ]

    for test in tests:
        print(f"\n📊 {test['name']}")
        print(f"   Query: {test['params']}")
        try:
            response = requests.get(f"{BASE_URL}/alerts", params=test["params"], timeout=5)
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Success: {len(data)} alerts returned")
            else:
                print(f"   ❌ Error: {response.status_code}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")


def test_notification_rules():
    """Test notification rules endpoints."""
    print("\n" + "=" * 70)
    print("TEST 2: NOTIFICATION RULES ENGINE")
    print("=" * 70)

    # Create a rule
    print("\n📋 Creating notification rule...")
    rule_payload = {
        "name": "Test High Risk Alert",
        "condition_type": "min_risk_score",
        "condition_value": 85,
        "notification_target": "webhook:https://example.com/alerts",
        "enabled": True,
    }

    try:
        response = requests.post(
            f"{BASE_URL}/notification-rules",
            json=rule_payload,
            timeout=5,
        )
        if response.status_code == 200:
            rule = response.json()
            print(f"✅ Rule created: {rule['rule']['rule_id']}")
            rule_id = rule["rule"]["rule_id"]
        else:
            print(f"❌ Failed: {response.status_code}")
            return
    except Exception as e:
        print(f"❌ Failed: {e}")
        return

    # List rules
    print("\n📋 Listing notification rules...")
    try:
        response = requests.get(f"{BASE_URL}/notification-rules", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Total rules: {data['count']}")
        else:
            print(f"❌ Failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Failed: {e}")

    # Test a rule
    print("\n🧪 Testing rule against sample alert...")
    test_alert = {
        "session_id": "test_sess_1",
        "user_id": "test_user",
        "risk_score": 90,
        "quantum_risk_level": "High",
    }

    try:
        response = requests.post(
            f"{BASE_URL}/notification-rules/test",
            json=test_alert,
            timeout=5,
        )
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Triggered rules: {result['count']}")
            print(f"   Targets: {result['notification_targets']}")
        else:
            print(f"❌ Failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Failed: {e}")

    # Delete rule
    print(f"\n🗑️  Deleting rule {rule_id}...")
    try:
        response = requests.delete(f"{BASE_URL}/notification-rules/{rule_id}", timeout=5)
        if response.status_code == 200:
            print(f"✅ Rule deleted")
        else:
            print(f"❌ Failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Failed: {e}")


def test_model_metrics():
    """Test model metrics endpoints."""
    print("\n" + "=" * 70)
    print("TEST 3: MODEL PERFORMANCE MONITORING")
    print("=" * 70)

    # Record metrics
    print("\n📊 Recording current metrics...")
    try:
        response = requests.post(f"{BASE_URL}/model/metrics/record", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Metrics recorded")
        else:
            print(f"❌ Failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Failed: {e}")

    # Get latest metrics
    print("\n📈 Fetching latest metrics...")
    try:
        response = requests.get(f"{BASE_URL}/model/metrics?limit=5", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Retrieved {data['count']} metric snapshots")
            if data["count"] > 0:
                latest = data["metrics"][-1]
                print(f"   Precision: {latest.get('precision', 'N/A')}")
                print(f"   Recall: {latest.get('recall', 'N/A')}")
                print(f"   FP Rate: {latest.get('false_positive_rate', 'N/A')}")
        else:
            print(f"❌ Failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Failed: {e}")

    # Get performance summary
    print("\n📊 Getting performance summary...")
    try:
        response = requests.get(f"{BASE_URL}/model/performance", timeout=5)
        if response.status_code == 200:
            summary = response.json()
            print(f"✅ Performance Summary:")
            print(f"   Total Sessions: {summary.get('total_sessions')}")
            print(f"   Flagged: {summary.get('flagged_sessions')}")
            print(f"   Precision: {summary.get('precision')}")
            print(f"   Recall: {summary.get('recall')}")
        else:
            print(f"❌ Failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Failed: {e}")

    # Check drift
    print("\n🔄 Checking for distribution drift...")
    try:
        response = requests.get(f"{BASE_URL}/model/drift-detection?shift_threshold=0.15", timeout=5)
        if response.status_code == 200:
            drift = response.json()
            status = "⚠️  DRIFT DETECTED" if drift.get("has_drift") else "✅ Stable"
            print(f"{status}")
            print(f"   Change: {drift.get('pct_change', 0) * 100:.1f}%")
            print(f"   Recommendation: {drift.get('recommendation')}")
        else:
            print(f"❌ Failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Failed: {e}")


def test_alert_streaming():
    """Test real-time alerts endpoint."""
    print("\n" + "=" * 70)
    print("TEST 4: REAL-TIME ALERT STREAMING")
    print("=" * 70)

    print("\n🔴 Fetching latest high-risk alerts (polling alternative)...")
    try:
        response = requests.get(f"{BASE_URL}/model/alerts-stream/latest?min_risk=80", timeout=5)
        if response.status_code == 200:
            alerts = response.json()
            print(f"✅ Retrieved {len(alerts)} high-risk alerts")
            if alerts:
                print(f"   Top alert: session {alerts[0].get('session_id')} (risk: {alerts[0].get('risk_score')})")
        else:
            print(f"❌ Failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Failed: {e}")

    print("\n🔌 WebSocket endpoint: ws://127.0.0.1:8000/ws/alerts")
    print("   (Test with JavaScript client - see client.js for example)")


def test_health():
    """Test API health."""
    print("\n" + "=" * 70)
    print("API HEALTH CHECK")
    print("=" * 70)

    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            print("✅ API is running and healthy")
            return True
        else:
            print(f"❌ API returned: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Cannot connect to API: {e}")
        print(f"\nStart the API with:")
        print(
            f"  python -m uvicorn cyberpulse.backend.main:app --host 127.0.0.1 --port 8000"
        )
        return False


def main():
    """Run all tests."""
    print("\n" + "🚀" * 35)
    print("CYBERPULSE ADVANCED FEATURES TEST SUITE")
    print("🚀" * 35)

    if not test_health():
        return 1

    test_advanced_filtering()
    test_notification_rules()
    test_model_metrics()
    test_alert_streaming()

    print("\n" + "=" * 70)
    print("✅ TEST SUITE COMPLETE")
    print("=" * 70)
    print("\n📚 Full API documentation: See FEATURES_GUIDE.md")
    print("🔗 Swagger docs: http://127.0.0.1:8000/docs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
