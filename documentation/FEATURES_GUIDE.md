# CyberPulse Advanced Features Guide

## 1. Advanced Alert Filtering

The `/alerts` endpoint now supports comprehensive filtering:

```bash
# Filter by risk score range
GET /alerts?min_risk=70&max_risk=95

# Filter by quantum risk level
GET /alerts?quantum_risk_level=High

# Filter by specific user
GET /alerts?user_id=user_12345

# Filter by triage status
GET /alerts?triage_status=investigating

# Filter by date range
GET /alerts?start_date=2026-01-01&end_date=2026-07-13

# Combine filters (all are optional)
GET /alerts?min_risk=75&quantum_risk_level=High&user_id=user_456&limit=50
```

**Filter Parameters:**
- `min_risk` / `max_risk`: Risk score range (0-100)
- `quantum_risk_level`: High, Medium, or Low
- `user_id`: Filter to a specific user
- `triage_status`: new, investigating, escalated, resolved
- `start_date` / `end_date`: ISO format dates (YYYY-MM-DD)
- `limit`: Max results to return (default: no limit)

---

## 2. Notification Rules Engine

Create rules that automatically trigger notifications when alerts match conditions.

### Create a Notification Rule

```bash
POST /notification-rules
Content-Type: application/json

{
  "name": "Critical Risk Alerts",
  "condition_type": "min_risk_score",
  "condition_value": 85,
  "notification_target": "webhook:https://mybank.com/security-webhook",
  "enabled": true
}
```

### Condition Types

| Type | Example | Description |
|------|---------|-------------|
| `min_risk_score` | `85` | Alert when risk_score >= value |
| `quantum_risk` | `"High"` | Alert when quantum risk is High/Medium/Low |
| `attack_type` | `"credential"` | Alert when attack type matches pattern |
| `user_id` | `"user_123"` | Alert for specific user |
| `triage_status` | `"escalated"` | Alert when status changes to value |

### Notification Targets

- `webhook:https://example.com/alerts` - HTTP POST webhook
- `email:analyst@bank.com` - Email notification
- `slack:#security-alerts` - Slack channel
- `email:team@bank.com,analyst@bank.com` - Multiple recipients

### List Rules

```bash
GET /notification-rules
```

### Delete a Rule

```bash
DELETE /notification-rules/{rule_id}
```

### Test a Rule

```bash
POST /notification-rules/test
Content-Type: application/json

{
  "session_id": "sess_123",
  "user_id": "user_456",
  "risk_score": 92,
  "quantum_risk_level": "High",
  "triage_status": "new"
}

Response:
{
  "triggered_rules": [...],
  "notification_targets": ["webhook:...", "email:..."],
  "count": 2
}
```

---

## 3. Model Performance Monitoring

Track model metrics, precision, recall, and detect distribution drift.

### Get Latest Metrics

```bash
GET /model/metrics?limit=10
```

Returns: precision, recall, false positive rate, risk score distribution stats

### Get Performance Summary

```bash
GET /model/performance
```

Example Response:
```json
{
  "timestamp": "2026-07-13T10:30:00Z",
  "total_sessions": 9928,
  "flagged_sessions": 180,
  "precision": 0.856,
  "recall": 0.920,
  "false_positive_rate": 0.045,
  "risk_score_distribution": {
    "mean": 23.4,
    "std": 28.2,
    "p95": 78.5,
    "p99": 92.3
  }
}
```

### Detect Distribution Shift

```bash
GET /model/drift-detection?shift_threshold=0.15
```

Detects if current risk distribution has shifted >15% from baseline:

```json
{
  "has_drift": false,
  "baseline_p95": 78.2,
  "current_p95": 79.1,
  "pct_change": 0.011,
  "shift_threshold": 0.15,
  "recommendation": "Risk distribution stable."
}
```

### Record Metrics Snapshot

```bash
POST /model/metrics/record
```

Stores current metrics for historical tracking.

---

## 4. Real-Time Alerts via WebSocket

Stream high-risk alerts to connected clients in real-time.

### JavaScript Client Example

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://127.0.0.1:8000/ws/alerts');

ws.onopen = () => {
  console.log('Connected to real-time alerts');
};

ws.onmessage = (event) => {
  const alert = JSON.parse(event.data);
  console.log('🚨 New High-Risk Alert:', alert);
  // Update dashboard UI here
  updateAlertList(alert);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected from real-time alerts');
};
```

### Polling Alternative (if WebSocket unavailable)

```bash
GET /model/alerts-stream/latest?min_risk=80
```

Returns latest 20 high-risk alerts (good for polling every 10-30 seconds).

---

## Usage Examples

### Scenario 1: Monitor for Quantum-Risk Alerts

```bash
# List high-risk quantum alerts
GET /alerts?quantum_risk_level=High&min_risk=70

# Create notification rule for quantum alerts
POST /notification-rules
{
  "name": "Quantum Risk High Alert",
  "condition_type": "quantum_risk",
  "condition_value": "High",
  "notification_target": "webhook:https://bank.com/quantum-risk",
  "enabled": true
}
```

### Scenario 2: Monitor Specific User

```bash
# Get all alerts for a user
GET /alerts?user_id=user_789&limit=50

# Get user's timeline
GET /user/user_789/timeline

# Create rule to alert on any user escalation
POST /notification-rules
{
  "name": "User 789 Escalation Alert",
  "condition_type": "user_id",
  "condition_value": "user_789",
  "notification_target": "email:investigator@bank.com",
  "enabled": true
}
```

### Scenario 3: Monitor Model Performance

```bash
# Check if model has drifted
GET /model/drift-detection

# Get detailed metrics
GET /model/metrics?limit=5

# Record current snapshot
POST /model/metrics/record

# Get summary for dashboard
GET /model/performance
```

---

## Integration Checklist

- [ ] Update frontend to use new `/alerts` filtering parameters
- [ ] Implement WebSocket client in dashboard for real-time alerts
- [ ] Add notification rules management UI
- [ ] Display model performance metrics on dashboard
- [ ] Set up alert drift detection monitoring (cron job every hour)
- [ ] Test all notification targets (webhook, email, Slack)
- [ ] Configure critical rules (risk > 85, quantum High, etc.)

---

## Notes

- All new features are backward compatible
- WebSocket connections scale with client load
- Notification rules are stored as JSON (production: use database)
- Model metrics are historical and used for drift detection
