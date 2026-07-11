import { useState } from "react";
import { scoreSession } from "../api/client.js";

const SCENARIOS = [
  {
    id: "impossible-travel",
    name: "Impossible travel",
    short: "Mumbai to Berlin, then a new high-value transfer.",
    payload: {
      geo_velocity_flag: 1,
      geo_velocity_detail: "Mumbai -> Berlin in 12 min",
      failed_login_count: 0,
      max_failed_attempts_last_10min: 0,
      device_change_flag: 0,
      time_since_last_known_device_ip_minutes: 0,
      transaction_amount_zscore: 9,
      max_transaction_amount: 200000,
      total_transaction_amount: 200000,
      new_beneficiary_flag: 1,
      transaction_velocity: 1,
      weak_crypto_flag: 0,
      crypto_deprecated_signal_count: 0,
      login_event_count: 2,
      successful_login_count: 2,
      unique_geo_count: 2,
      unique_device_count: 1,
    },
  },
  {
    id: "credential-stuffing",
    name: "Credential stuffing",
    short: "Failed-login burst, successful login, new beneficiary transfer.",
    payload: {
      geo_velocity_flag: 0,
      failed_login_count: 5,
      max_failed_attempts_last_10min: 5,
      device_change_flag: 1,
      time_since_last_known_device_ip_minutes: 0,
      transaction_amount_zscore: 6.2,
      max_transaction_amount: 150000,
      total_transaction_amount: 150000,
      new_beneficiary_flag: 1,
      transaction_velocity: 1,
      weak_crypto_flag: 0,
      crypto_deprecated_signal_count: 0,
      login_event_count: 6,
      successful_login_count: 1,
      unique_geo_count: 1,
      unique_device_count: 2,
    },
  },
  {
    id: "weak-crypto",
    name: "Weak crypto session",
    short: "TLS 1.0, RSA-1024, SHA-1 certificate with large transfer.",
    payload: {
      geo_velocity_flag: 0,
      failed_login_count: 0,
      max_failed_attempts_last_10min: 0,
      device_change_flag: 0,
      time_since_last_known_device_ip_minutes: 0,
      transaction_amount_zscore: 7.5,
      max_transaction_amount: 175000,
      total_transaction_amount: 175000,
      new_beneficiary_flag: 0,
      transaction_velocity: 1,
      weak_crypto_flag: 1,
      crypto_deprecated_signal_count: 4,
      login_event_count: 1,
      successful_login_count: 1,
      unique_geo_count: 1,
      unique_device_count: 1,
      tls_version: "TLS 1.0",
      cipher_suite: "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
      cert_key_length: 1024,
      cert_signature_alg: "SHA-1",
    },
  },
  {
    id: "fingerprint-velocity",
    name: "Fingerprint velocity",
    short: "Device change followed by repeated transactions in one session.",
    payload: {
      geo_velocity_flag: 0,
      failed_login_count: 0,
      max_failed_attempts_last_10min: 0,
      device_change_flag: 1,
      time_since_last_known_device_ip_minutes: 0,
      transaction_amount_zscore: 4.8,
      max_transaction_amount: 85000,
      total_transaction_amount: 240000,
      new_beneficiary_flag: 1,
      transaction_velocity: 4,
      weak_crypto_flag: 0,
      crypto_deprecated_signal_count: 0,
      login_event_count: 2,
      successful_login_count: 2,
      unique_geo_count: 1,
      unique_device_count: 2,
    },
  },
];

function quantumClass(level) {
  if (level === "High") return "border-riskHigh text-riskHigh";
  if (level === "Medium") return "border-riskMedium text-riskMedium";
  return "border-riskLow text-riskLow";
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function SimulatePanel() {
  const [selectedId, setSelectedId] = useState(SCENARIOS[0].id);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const selected = SCENARIOS.find((scenario) => scenario.id === selectedId) || SCENARIOS[0];

  async function runSimulation() {
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const [score] = await Promise.all([scoreSession(selected.payload), delay(720)]);
      setResult(score);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="soc-panel px-4 py-4">
        <div className="soc-label">Live scenario control</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-text">Simulate Attack</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Select one injected attack pattern and submit its engineered session features to the live FastAPI
          scoring endpoint.
        </p>

        <div className="mt-5 grid gap-3">
          {SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => setSelectedId(scenario.id)}
              className={[
                "border px-4 py-3 text-left transition-colors",
                selectedId === scenario.id
                  ? "border-amber bg-amber/10"
                  : "border-border bg-base hover:border-borderStrong",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-text">{scenario.name}</span>
                <span className="soc-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted">
                  {selectedId === scenario.id ? "armed" : "standby"}
                </span>
              </div>
              <div className="mt-1 text-sm text-muted">{scenario.short}</div>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="soc-button-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
          onClick={runSimulation}
          disabled={loading}
        >
          {loading ? "Scoring in progress..." : "Trigger scenario"}
        </button>
      </section>

      <section className="soc-panel min-h-[480px] px-4 py-4">
        <div className="soc-label">Live scoring output</div>

        {loading && (
          <div className="mt-8">
            <div className="font-mono text-sm uppercase tracking-[0.16em] text-amber">
              Correlating telemetry and transaction signals
            </div>
            <div className="mt-4 h-1.5 w-full overflow-hidden bg-steel">
              <div className="h-full w-1/2 animate-pulseTrace bg-amber" />
            </div>
            <div className="mt-4 text-sm text-muted">
              Running anomaly score, rule explanation, and quantum-risk rules.
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 border border-riskHigh/60 bg-base px-4 py-3 text-sm text-riskHigh">
            {error}
          </div>
        )}

        {!loading && !result && !error && (
          <div className="mt-8 border border-border bg-base px-4 py-8 text-sm text-muted">
            No scenario has been submitted in this session. Trigger one to show the live backend score.
          </div>
        )}

        {result && (
          <div className="mt-5 animate-reveal space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="border border-border bg-base px-4 py-4">
                <div className="soc-label">Risk score</div>
                <div className="soc-mono mt-2 text-5xl font-bold text-amber">
                  {Number(result.risk_score || 0).toFixed(1)}
                </div>
              </div>
              <div className="border border-border bg-base px-4 py-4">
                <div className="soc-label">Quantum risk</div>
                <div
                  className={`soc-mono mt-4 inline-flex border px-3 py-2 text-sm font-bold uppercase tracking-[0.12em] ${quantumClass(
                    result.quantum_risk_level,
                  )}`}
                >
                  {result.quantum_risk_level}
                </div>
              </div>
            </div>

            <div>
              <div className="soc-label">Explanation</div>
              <p className="mt-2 text-sm leading-6 text-text/90">{result.explanation}</p>
            </div>

            <div>
              <div className="soc-label">Quantum note</div>
              <p className="mt-2 text-sm leading-6 text-text/80">{result.quantum_risk_explanation}</p>
            </div>

            <div>
              <div className="soc-label">Contributing signals</div>
              <div className="mt-2 space-y-3">
                {(() => {
                  const raw = result.feature_contributions || [];
                  if (raw.length === 0) {
                    return <div className="text-sm text-muted">No structured feature contribution list returned.</div>;
                  }
                  
                  const weighted = raw.map(item => {
                    let weight = 1;
                    if (item.severity === "high") weight = 3;
                    else if (item.severity === "medium") weight = 2;
                    return { ...item, weight };
                  });
                  
                  const sum = weighted.reduce((acc, item) => acc + item.weight, 0);
                  const items = weighted.map(item => ({
                    ...item,
                    percentage: sum > 0 ? Math.round((item.weight / sum) * 100) : 0
                  }));

                  return items.map((item) => {
                    const barColor = item.severity === "high" ? "bg-riskHigh" : "bg-riskMedium";
                    const badgeColor = item.severity === "high" ? "text-riskHigh border-riskHigh/30" : "text-riskMedium border-riskMedium/30";
                    return (
                      <div key={`${item.feature}-${item.value}`} className="border border-border bg-base p-3 rounded-[3px] space-y-2 animate-reveal">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-text">{item.feature}</span>
                          <span className={`soc-mono text-[0.6rem] border px-1.5 py-0.5 uppercase tracking-wider font-bold bg-base/50 ${badgeColor}`}>
                            {item.severity || "medium"}
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[0.68rem] text-muted">
                            <span>Contribution weight</span>
                            <span className="font-bold text-text">{item.percentage}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-steel">
                            <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${item.percentage}%` }} />
                          </div>
                        </div>

                        <div className="soc-mono text-xs text-muted leading-4 bg-panel/30 p-1.5 border border-border/40">
                          {item.value}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
