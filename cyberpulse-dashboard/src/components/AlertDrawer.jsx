import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMemo } from "react";
import { getCopilotReport, getPqcPlaybook, getStixExportUrl } from "../api/client.js";

function parseContributions(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function quantumClass(level) {
  if (level === "High") return "border-riskHigh text-riskHigh";
  if (level === "Medium") return "border-riskMedium text-riskMedium";
  return "border-riskLow text-riskLow";
}

export default function AlertDrawer({ alert, onClose }) {
  const weightedContributions = useMemo(() => {
    const raw = parseContributions(alert?.feature_contributions);
    if (raw.length === 0) return [];
    
    // Severity weights: high = 3, medium = 2, default/other = 1
    const weighted = raw.map(item => {
      let weight = 1;
      if (item.severity === "high") weight = 3;
      else if (item.severity === "medium") weight = 2;
      return { ...item, weight };
    });
    
    const sum = weighted.reduce((acc, item) => acc + item.weight, 0);
    return weighted.map(item => ({
      ...item,
      percentage: sum > 0 ? Math.round((item.weight / sum) * 100) : 0
    }));
  }, [alert]);

  const [activeTab, setActiveTab] = useState("details");
  const [copilotData, setCopilotData] = useState(null);
  const [pqcData, setPqcData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset states when the selected alert changes
  useEffect(() => {
    setActiveTab("details");
    setCopilotData(null);
    setPqcData(null);
    setError("");
  }, [alert]);

  // Load tab-specific dynamic report contents from FastAPI
  useEffect(() => {
    if (!alert) return;

    async function loadTabData() {
      setLoading(true);
      setError("");
      try {
        if (activeTab === "copilot" && !copilotData) {
          const report = await getCopilotReport(alert.session_id);
          setCopilotData(report);
        } else if (activeTab === "pqc" && !pqcData) {
          const playbook = await getPqcPlaybook(alert.session_id);
          setPqcData(playbook);
        }
      } catch (err) {
        setError("Failed to retrieve incident intelligence details.");
      } finally {
        setLoading(false);
      }
    }

    loadTabData();
  }, [activeTab, alert]);

  // STIX 2.1 Exporter
  async function downloadStix() {
    if (!alert) return;
    try {
      const url = getStixExportUrl(alert.session_id);
      const response = await fetch(url);
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `stix-threat-${alert.session_id}.json`;
      link.click();
    } catch (err) {
      console.error(err);
      window.alert("STIX 2.1 Threat export failed.");
    }
  }

  const tabClass = (tab) =>
    `flex-1 text-center py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-colors ${
      activeTab === tab
        ? "border-amber text-amber bg-amber/5"
        : "border-border text-muted hover:text-text hover:border-borderStrong"
    }`;

  return (
    <aside
      className={[
        "fixed right-0 top-0 z-40 h-full w-full max-w-[460px] border-l border-border bg-panel shadow-drawer transition-transform duration-200",
        alert ? "translate-x-0" : "translate-x-full",
      ].join(" ")}
      aria-hidden={!alert}
      aria-label="Alert detail drawer"
    >
      {alert && (
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="soc-label">Selected alert</div>
                <div className="soc-mono mt-2 text-lg font-bold text-text">{alert.user_id}</div>
                <div className="soc-mono text-xs text-muted">{alert.session_id}</div>
              </div>
              <button type="button" className="soc-button" onClick={onClose} aria-label="Close alert drawer">
                Close
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-border bg-base/30">
            <button type="button" onClick={() => setActiveTab("details")} className={tabClass("details")}>
              Details
            </button>
            <button type="button" onClick={() => setActiveTab("copilot")} className={tabClass("copilot")}>
              AI Copilot
            </button>
            <button type="button" onClick={() => setActiveTab("pqc")} className={tabClass("pqc")}>
              PQC Playbook
            </button>
          </div>

          {/* Tab Contents */}
          <div className="flex-1 space-y-5 overflow-auto px-5 py-5">
            {loading && (
              <div className="space-y-4 py-8">
                <div className="h-6 w-3/4 animate-pulse bg-steel/30" />
                <div className="h-20 w-full animate-pulse bg-steel/20" />
                <div className="h-20 w-full animate-pulse bg-steel/20" />
              </div>
            )}

            {error && <div className="text-sm text-riskHigh font-semibold py-4">{error}</div>}

            {!loading && !error && activeTab === "details" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-border bg-base px-3 py-3">
                    <div className="soc-label">Risk score</div>
                    <div className="soc-mono mt-2 text-3xl font-bold text-amber">
                      {Number(alert.risk_score || 0).toFixed(1)}
                    </div>
                  </div>
                  <div className="border border-border bg-base px-3 py-3">
                    <div className="soc-label">Quantum risk</div>
                    <div
                      className={`soc-mono mt-3 inline-flex border px-2 py-1 text-sm font-bold uppercase ${quantumClass(
                        alert.quantum_risk_level,
                      )}`}
                    >
                      {alert.quantum_risk_level}
                    </div>
                  </div>
                </div>

                <section>
                  <div className="soc-label">Full explanation</div>
                  <p className="mt-2 text-sm leading-6 text-text/90">{alert.explanation}</p>
                </section>

                <section>
                  <div className="soc-label">Quantum note</div>
                  <p className="mt-2 text-sm leading-6 text-text/80">{alert.quantum_risk_explanation}</p>
                </section>

                <section>
                  <div className="soc-label">Contributing signals</div>
                  <div className="mt-2 space-y-3">
                    {weightedContributions.length === 0 ? (
                      <div className="text-sm text-muted">No structured feature contribution list returned.</div>
                    ) : (
                      weightedContributions.map((item) => {
                        const barColor = item.severity === "high" ? "bg-riskHigh" : "bg-riskMedium";
                        const badgeColor = item.severity === "high" ? "text-riskHigh border-riskHigh/30" : "text-riskMedium border-riskMedium/30";
                        return (
                          <div key={`${item.feature}-${item.value}`} className="border border-border bg-base p-3 rounded-[3px] space-y-2 animate-reveal">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold text-text">{item.feature}</span>
                              <span className={`soc-mono text-[0.6rem] border px-1.5 py-0.5 uppercase tracking-wider font-bold bg-base/50 ${badgeColor}`}>
                                {item.severity}
                              </span>
                            </div>
                            
                            {/* Progress Bar & Contribution Percentage */}
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
                      })
                    )}
                  </div>
                </section>

                <section>
                  <div className="soc-label">Session features</div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    {[
                      ["Geo velocity", alert.geo_velocity_flag],
                      ["Failed logins", alert.failed_login_count],
                      ["Device change", alert.device_change_flag],
                      ["Txn velocity", alert.transaction_velocity],
                      ["Amount z-score", Number(alert.transaction_amount_zscore || 0).toFixed(2)],
                      ["Weak crypto", alert.weak_crypto_flag],
                    ].map(([label, value]) => (
                      <div key={label} className="border border-border bg-base px-2 py-2">
                        <dt className="text-muted">{label}</dt>
                        <dd className="soc-mono mt-1 text-text">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </>
            )}

            {!loading && !error && activeTab === "copilot" && copilotData && (
              <div className="space-y-4">
                <div className="border-l-2 border-amber pl-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Incident Classification</span>
                  <h4 className="text-base font-bold text-text">{copilotData.classification}</h4>
                  <span className="soc-mono text-xs text-amber font-semibold">{copilotData.incident_id} ({copilotData.severity})</span>
                </div>

                <div className="border border-border bg-[#0d0f12] p-4 text-xs leading-5 text-text/90 rounded-sm">
                  <span className="block mb-2 font-mono text-[10px] uppercase text-muted">🤖 AI Incident Summary</span>
                  {copilotData.executive_summary}
                </div>

                <div className="space-y-2">
                  <span className="soc-label">Evidence Analysis</span>
                  {copilotData.technical_findings.map((f, i) => (
                    <div key={`finding-${i}`} className="border border-border bg-base p-3 rounded-sm">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-text">{f.name}</span>
                        <span className="font-mono text-[10px] text-riskHigh font-semibold">{f.rating}</span>
                      </div>
                      <div className="soc-mono mt-1 text-[10px] text-muted font-bold">Evidence: {f.evidence}</div>
                      <p className="mt-1 text-[11px] text-text/80">{f.description}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <span className="soc-label">Remediation Action Plan</span>
                  <ul className="list-decimal pl-4 text-xs text-text/80 space-y-2">
                    {copilotData.remediations.map((r, i) => (
                      <li key={`rem-${i}`} className="leading-5">{r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {!loading && !error && activeTab === "pqc" && pqcData && (
              <div className="space-y-4">
                <div>
                  <span className="soc-label">Cryptographic Vulnerabilities</span>
                  <div className="mt-2 space-y-2">
                    {pqcData.vulnerabilities.map((v, i) => (
                      <div key={`vuln-${i}`} className="border border-riskHigh/20 bg-riskHigh/5 p-3 rounded-sm">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-riskHigh">{v.type}</span>
                          <span className="font-mono text-[10px] bg-riskHigh/10 px-1.5 py-0.5 rounded text-riskHigh font-bold">{v.risk_level}</span>
                        </div>
                        <div className="font-mono mt-1 text-[10px] text-text/80">Detected: {v.detected_value}</div>
                        <p className="mt-1 text-[11px] text-muted">{v.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-border bg-base p-3 rounded-sm space-y-2">
                  <span className="soc-label">Target Architecture Upgrade</span>
                  <dl className="text-xs space-y-2">
                    <div>
                      <dt className="text-muted">Quantum-Safe Key Agreement:</dt>
                      <dd className="font-mono text-text font-semibold">{pqcData.target_architecture.key_exchange}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Target Authentication Signature:</dt>
                      <dd className="font-mono text-text font-semibold">{pqcData.target_architecture.signature_scheme}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Protocol Baseline:</dt>
                      <dd className="font-mono text-text font-semibold">{pqcData.target_architecture.tls_version}</dd>
                    </div>
                  </dl>
                </div>

                <div className="space-y-2">
                  <span className="soc-label">Recommended Handshake Config</span>
                  <pre className="p-3 bg-[#0d0f12] text-[10px] font-mono text-amber rounded-sm overflow-x-auto">
                    {pqcData.nginx_config}
                  </pre>
                </div>

                <div className="space-y-2">
                  <span className="soc-label">OpenSSL PQC Handshake Commands</span>
                  <pre className="p-3 bg-[#0d0f12] text-[10px] font-mono text-muted rounded-sm overflow-x-auto">
                    {pqcData.openssl_commands}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="border-t border-border px-5 py-4 space-y-3">
            <button
              type="button"
              onClick={downloadStix}
              className="soc-button flex w-full justify-center items-center gap-1.5"
            >
              📥 Export STIX 2.1 JSON
            </button>
            <Link
              to={`/user/${encodeURIComponent(alert.user_id)}?session=${encodeURIComponent(alert.session_id)}`}
              state={{ alert }}
              className="soc-button-primary inline-flex w-full justify-center"
            >
              View Timeline
            </Link>
          </div>
        </div>
      )}
    </aside>
  );
}
