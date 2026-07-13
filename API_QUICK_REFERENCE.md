# CyberPulse API Quick Reference

## Base URL
```
http://127.0.0.1:8000
```

## Health & Stats

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | API health check |
| `GET` | `/stats` | Dashboard statistics |

## Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/alerts` | List alerts with filters |
| `GET` | `/user/{user_id}/timeline` | User event timeline |
| `GET` | `/export/alerts.csv` | Export alerts as CSV |
| `GET` | `/export/alerts.pdf` | Export alerts as PDF |

### Alert Filtering Parameters
```
?min_risk=0&max_risk=100
&quantum_risk_level=High|Medium|Low
&user_id=user_123
&triage_status=new|investigating|escalated|resolved
&start_date=2026-01-01&end_date=2026-07-13
&limit=50
```

## Scoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/score-session` | Score a session live |

### Example Request
```json
{
  "geo_velocity_flag": 1,
  "failed_login_count": 2,
  "risk_score": 75,
  "quantum_risk_level": "High"
}
```

## Triage

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/triage` | Update triage status |

### Example Request
```json
{
  "session_id": "sess_123",
  "status": "investigating",
  "note": "Checking transaction details"
}
```

## Notification Rules

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/notification-rules` | List all rules |
| `POST` | `/notification-rules` | Create rule |
| `DELETE` | `/notification-rules/{rule_id}` | Delete rule |
| `POST` | `/notification-rules/test` | Test rule against alert |

### Create Rule Example
```bash
POST /notification-rules
{
  "name": "High Risk Alert",
  "condition_type": "min_risk_score",
  "condition_value": 85,
  "notification_target": "webhook:https://example.com/alerts",
  "enabled": true
}
```

### Condition Types
- `min_risk_score` → value: number (0-100)
- `quantum_risk` → value: "High"|"Medium"|"Low"
- `attack_type` → value: string pattern
- `user_id` → value: user ID
- `triage_status` → value: "new"|"investigating"|"escalated"|"resolved"

### Notification Targets
- `webhook:https://example.com/alerts`
- `email:user@bank.com`
- `slack:#channel-name`

## Model Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/model/metrics` | Get metric snapshots |
| `GET` | `/model/performance` | Get performance summary |
| `POST` | `/model/metrics/record` | Record current metrics |
| `GET` | `/model/drift-detection` | Detect distribution drift |

### Parameters
```
/model/metrics?limit=10
/model/drift-detection?shift_threshold=0.15
```

## Crypto Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/crypto-inventory` | TLS/cipher/cert inventory |

## Real-Time Alerts

| Protocol | Endpoint | Description |
|----------|----------|-------------|
| `WebSocket` | `/ws/alerts` | Real-time alert stream |
| `GET` | `/model/alerts-stream/latest` | Latest high-risk alerts (polling) |

### WebSocket Example
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/alerts');
ws.onmessage = (event) => {
  const alert = JSON.parse(event.data);
  console.log('New alert:', alert);
};
```

---

## Common Queries

### Get Critical Alerts
```bash
GET /alerts?min_risk=85&limit=20
```

### Get Alerts for Specific User
```bash
GET /alerts?user_id=user_456&limit=10
```

### Get High Quantum Risk Alerts
```bash
GET /alerts?quantum_risk_level=High&min_risk=50
```

### Get Unresolved Alerts
```bash
GET /alerts?triage_status=new&triage_status=investigating
```

### Get Alerts in Date Range
```bash
GET /alerts?start_date=2026-07-01&end_date=2026-07-15
```

### Export High Risk Alerts
```bash
GET /export/alerts.csv?min_risk=70
```

### Check Model Performance
```bash
GET /model/performance
```

### Detect Model Drift
```bash
GET /model/drift-detection?shift_threshold=0.20
```

---

## cURL Examples

### Test API
```bash
curl http://127.0.0.1:8000/health
```

### Get Alerts with Filter
```bash
curl "http://127.0.0.1:8000/alerts?min_risk=75&quantum_risk_level=High"
```

### Create Notification Rule
```bash
curl -X POST http://127.0.0.1:8000/notification-rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Rule",
    "condition_type": "min_risk_score",
    "condition_value": 85,
    "notification_target": "webhook:https://example.com/alert",
    "enabled": true
  }'
```

### Update Triage
```bash
curl -X POST http://127.0.0.1:8000/triage \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_123",
    "status": "investigating",
    "note": "Under review"
  }'
```

### Score Session Live
```bash
curl -X POST http://127.0.0.1:8000/score-session \
  -H "Content-Type: application/json" \
  -d '{
    "geo_velocity_flag": 1,
    "failed_login_count": 3,
    "device_change_flag": 1,
    "transaction_amount_zscore": 2.5
  }'
```

---

## Response Examples

### Alert Response
```json
{
  "session_id": "sess_123456",
  "user_id": "user_789",
  "risk_score": 87.5,
  "quantum_risk_level": "High",
  "triage_status": "new",
  "explanation": "High-value transfer after device change",
  "timestamp": "2026-07-13T10:30:00Z"
}
```

### Performance Summary
```json
{
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

### Drift Detection Response
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

---

## Status Codes

| Code | Meaning |
|------|---------|
| `200` | OK - Request succeeded |
| `201` | Created - Resource created |
| `400` | Bad Request - Invalid parameters |
| `404` | Not Found - Resource not found |
| `500` | Server Error - Internal error |

---

## Rate Limits
None currently (development build).

## Authentication
None currently (development build).

---

## For Full Documentation
See:
- `FEATURES_GUIDE.md` - Detailed feature guide
- `IMPLEMENTATION_SUMMARY.md` - Implementation details
- `http://127.0.0.1:8000/docs` - Interactive Swagger UI
- `http://127.0.0.1:8000/redoc` - ReDoc documentation
