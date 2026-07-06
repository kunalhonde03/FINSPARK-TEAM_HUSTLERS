# CyberPulse

CyberPulse is a hackathon-ready prototype that correlates banking cybersecurity telemetry with transactional behavior to detect cyber threats, fraud patterns, and quantum-related crypto risk.

The pipeline is intentionally end-to-end and demo-focused: synthetic event generation, attack injection, session feature engineering, unsupervised anomaly scoring, explainability, quantum-risk enrichment, FastAPI endpoints, and a Streamlit analyst dashboard.

## Architecture

1. `data_generator/` creates normal telemetry and transaction streams, then injects labeled attack scenarios for validation.
2. `features/session_features.py` joins both streams into 30-minute user sessions and engineers model-ready signals.
3. `models/isolation_forest.py` trains an unsupervised Isolation Forest and writes 0-100 risk scores.
4. `explainability/rule_based_explainer.py` turns high-risk feature combinations into readable alert explanations.
5. `quantum_risk/crypto_rules.py` checks TLS, cipher, RSA key length, and certificate signature metadata.
6. `backend/main.py` exposes alerts, timelines, live scoring, and dashboard stats through FastAPI.
7. `dashboard/app.py` consumes only the API and presents the demo console.

Hidden columns `is_attack_scenario` and `attack_type` are kept only for validation. They are not used as model input features or dashboard logic.

## Run

From the repository parent directory:

```powershell
pip install -r cyberpulse\requirements.txt

python cyberpulse\data_generator\generate_telemetry.py
python cyberpulse\data_generator\generate_transactions.py
python cyberpulse\data_generator\inject_attack_scenarios.py

python cyberpulse\features\session_features.py
python cyberpulse\models\isolation_forest.py
python cyberpulse\explainability\rule_based_explainer.py
python cyberpulse\quantum_risk\crypto_rules.py

python -m uvicorn cyberpulse.backend.main:app --host 127.0.0.1 --port 8000
python -m streamlit run cyberpulse\dashboard\app.py --server.headless true --server.port 8501
```

Open:

- API: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`
- Dashboard: `http://127.0.0.1:8501`

## API

- `GET /alerts` returns sessions sorted by `risk_score`, with explanation and quantum-risk fields.
- `GET /user/{user_id}/timeline` returns merged telemetry and transaction events for one user.
- `POST /score-session` scores a supplied session feature payload for live simulation.
- `GET /stats` returns dashboard headline metrics and validation stats.

## Current Validation Run

- Generated `7,830` telemetry rows and `3,410` transaction rows after attack injection.
- Injected `540` attack rows across both streams, about `5%` of the combined data.
- Built `9,928` correlated sessions, including `120` injected attack sessions.
- Isolation Forest placed `100.0%` of injected attack sessions in the top `5%` risk band.
- Median injected attack risk was `99.8`; median normal risk was `4.2`.
- Quantum engine flagged `140` High and `246` Medium quantum-risk sessions.
- FastAPI `/docs` returned HTTP `200`; Streamlit dashboard returned HTTP `200`.

## Expected Outcomes Mapping

| Expected outcome | CyberPulse implementation |
| --- | --- |
| Correlates cybersecurity telemetry with transactional behaviour | `session_features.py` joins logins, device/IP/geo/crypto metadata, and transactions into user sessions; the dashboard timeline overlays markers and transaction bars on one time axis. |
| Detects cyber threats proactively | Isolation Forest scores every session and `/alerts` ranks high-risk sessions before an analyst opens a user timeline. |
| Identifies fraud patterns | Engineered fraud signals include high amount z-score, new beneficiary, transaction velocity, credential-stuffing sequence, and device change. |
| Detects quantum-related attack indicators | `crypto_rules.py` flags TLS `< 1.2`, weak cipher suites, RSA keys `< 2048`, and SHA-1 certificates, with harvest-now-decrypt-later explanations. |
| Reduces false positives | The prototype combines unsupervised anomaly scoring with rule validation, so single noisy signals are not enough by themselves. In this run, `/stats` estimates a `69.8%` reduction versus alerting on any single signal. |
| Provides explainable AI-driven threat intelligence | Rule-based explanations cite concrete causes such as impossible travel, failed-login bursts, high-value transfers, new beneficiaries, device changes, and weak crypto. |

## Attack Scenarios

The injector creates four balanced scenario families:

- Impossible travel followed by high-value transfer.
- Multiple failed logins, then success, then new-beneficiary transfer.
- Weak/deprecated crypto paired with a large transaction.
- Device fingerprint change followed by transaction velocity.

The dashboard's "Simulate an attack" control sends a live feature payload to `POST /score-session`, so the demo can show real-time scoring rather than only static CSV output.

## Known Limitations and Next Steps

- Synthetic data is representative but not a substitute for bank-specific telemetry distributions.
- The model is unsupervised, but contamination and validation are tuned against injected labels for demo confidence.
- The live simulation returns a score but does not persist a new alert into the feed.
- No authentication, RBAC, audit logging, or production data governance is included.
- Quantum risk is rule-based and should be extended with real certificate inventory, asset criticality, and post-quantum migration planning.
- Optional `shap_explainer.py` is included as a fallback attribution helper; full SHAP integration can be added if the package is installed.
