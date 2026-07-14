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
  if (level === "High") return "border-riskHigh/30 text-riskHigh bg-riskHigh/5";
  if (level === "Medium") return "border-riskMedium/30 text-riskMedium bg-riskMedium/5";
  return "border-riskLow/30 text-riskLow bg-riskLow/5";
}

function CopyCodeBlock({ code, title }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  }

  return (
    <div className="space-y-1.5 animate-reveal">
      <div className="flex items-center justify-between">
        <span className="text-[0.62rem] font-bold uppercase tracking-wider text-muted/95">{title}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[0.6rem] font-bold uppercase tracking-wider text-amber hover:text-amber/80 flex items-center gap-1 transition-colors focus:outline-none"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>Copied</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              <span>Copy config</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 bg-[#06090d] text-[11px] font-mono text-[#a5b4fc] rounded border border-white/5 overflow-x-auto shadow-inner">
        <code>{code}</code>
      </pre>
    </div>
  );
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
    `flex-1 text-center py-3 text-[10px] font-extrabold uppercase tracking-widest border-b-2 transition-all relative ${
      activeTab === tab
        ? "border-amber text-amber bg-[#ffaa22]/3 font-black"
        : "border-white/5 text-muted hover:text-text hover:border-white/10"
    }`;

  return (
    <>
      {/* Background Overlay Backdrop */}
      {alert && (
        <div 
          className="fixed inset-0 z-30 bg-[#070a0e]/60 backdrop-blur-[4px] transition-opacity duration-300"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "fixed right-0 top-0 z-40 h-full w-full max-w-[460px] border-l border-white/5 bg-[#0e131b]/95 backdrop-blur-md shadow-drawer transition-transform duration-300 cubic-bezier(0.16, 1, 0.3, 1)",
          alert ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        aria-hidden={!alert}
        aria-label="Alert detail drawer"
      >
        {alert && (
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="border-b border-white/5 px-6 py-4.5 bg-[#0a0e15]/40">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="soc-label">Selected alert</span>
                  <h2 className="soc-mono mt-1 text-lg font-black text-text">{alert.user_id}</h2>
                  <div className="soc-mono text-[0.65rem] text-muted font-semibold mt-0.5">{alert.session_id}</div>
                </div>
                <button 
                  type="button" 
                  className="p-2 border border-white/10 hover:border-amber/40 hover:text-amber rounded text-muted transition-all duration-200" 
                  onClick={onClose} 
                  aria-label="Close alert drawer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-white/5 bg-[#070a0e]/40">
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
            <div className="flex-1 space-y-6 overflow-auto px-6 py-5 scrollbar-thin">
              {loading && (
                <div className="space-y-4 py-8">
                  <div className="h-6 w-3/4 animate-pulse bg-steel/30 rounded" />
                  <div className="h-20 w-full animate-pulse bg-steel/20 rounded" />
                  <div className="h-20 w-full animate-pulse bg-steel/20 rounded" />
                </div>
              )}

              {error && <div className="text-xs text-riskHigh font-semibold py-4 bg-riskHigh/5 border border-riskHigh/20 px-3.5 rounded">{error}</div>}

              {!loading && !error && activeTab === "details" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-white/5 bg-[#070a0e]/50 p-4 rounded-md">
                      <span className="soc-label">Risk score</span>
                      <div className="soc-mono mt-1 text-3xl font-black text-amber">
                        {Number(alert.risk_score || 0).toFixed(1)}
                      </div>
                    </div>
                    <div className="border border-white/5 bg-[#070a0e]/50 p-4 rounded-md flex flex-col justify-between">
                      <span className="soc-label">Quantum risk</span>
                      <span
                        className={`soc-mono mt-2 inline-flex items-center justify-center border px-2.5 py-1 text-xs font-black uppercase rounded ${quantumClass(
                          alert.quantum_risk_level,
                        )}`}
                      >
                        {alert.quantum_risk_level}
                      </span>
                    </div>
                  </div>

                  <section className="space-y-1.5">
                    <span className="soc-label">Full explanation</span>
                    <p className="text-xs leading-relaxed text-text/80 bg-white/2 border border-white/3 p-3.5 rounded">{alert.explanation}</p>
                  </section>

                  <section className="space-y-1.5">
                    <span className="soc-label">Quantum note</span>
                    <p className="text-xs leading-relaxed text-muted bg-[#06090d] border border-white/3 p-3.5 rounded">{alert.quantum_risk_explanation}</p>
                  </section>

                  <section className="space-y-3">
                    <span className="soc-label">Contributing signals</span>
                    <div className="space-y-2.5">
                      {weightedContributions.length === 0 ? (
                        <div className="text-xs text-muted">No structured feature contribution list returned.</div>
                      ) : (
                        weightedContributions.map((item) => {
                          const barColor = item.severity === "high" ? "bg-riskHigh" : "bg-riskMedium";
                          const glowShadow = item.severity === "high" ? "shadow-[0_0_6px_#ef4444]" : "shadow-[0_0_6px_#f59e0b]";
                          const badgeColor = item.severity === "high" ? "text-riskHigh border-riskHigh/20 bg-riskHigh/5" : "text-riskMedium border-riskMedium/20 bg-riskMedium/5";
                          return (
                            <div key={`${item.feature}-${item.value}`} className="border border-white/5 bg-[#06090d] p-4.5 rounded space-y-3 animate-reveal">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-bold text-text">{item.feature}</span>
                                <span className={`soc-mono text-[0.58rem] border px-2 py-0.5 uppercase tracking-widest font-black rounded ${badgeColor}`}>
                                  {item.severity}
                                </span>
                              </div>
                              
                              {/* Progress Bar & Contribution Percentage */}
                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-[0.62rem] text-muted">
                                  <span>Contribution weight</span>
                                  <span className="font-extrabold text-text">{item.percentage}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-steel rounded-full overflow-hidden">
                                  <div className={`h-full ${barColor} ${glowShadow} rounded-full transition-all duration-500`} style={{ width: `${item.percentage}%` }} />
                                </div>
                              </div>

                              <div className="soc-mono text-[0.68rem] text-muted leading-relaxed bg-[#0d131a] p-2.5 rounded border border-white/3">
                                {item.value}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <span className="soc-label">Session features</span>
                    <dl className="grid grid-cols-2 gap-3.5 text-xs">
                      {[
                        ["Geo velocity", alert.geo_velocity_flag],
                        ["Failed logins", alert.failed_login_count],
                        ["Device change", alert.device_change_flag],
                        ["Txn velocity", alert.transaction_velocity],
                        ["Amount z-score", Number(alert.transaction_amount_zscore || 0).toFixed(2)],
                        ["Weak crypto", alert.weak_crypto_flag],
                      ].map(([label, value]) => (
                        <div key={label} className="border border-white/5 bg-[#070a0e]/50 px-3.5 py-3 rounded-md">
                          <dt className="text-[0.62rem] font-bold uppercase tracking-wider text-muted">{label}</dt>
                          <dd className="soc-mono mt-1 text-sm font-bold text-text">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                </>
              )}

              {!loading && !error && activeTab === "copilot" && copilotData && (
                <div className="space-y-5">
                  <div className="border-l-2 border-amber pl-4 py-1">
                    <span className="text-[0.58rem] font-black uppercase tracking-wider text-muted">Incident Classification</span>
                    <h4 className="text-sm font-bold text-text leading-tight">{copilotData.classification}</h4>
                    <span className="soc-mono text-[0.65rem] text-amber font-extrabold">{copilotData.incident_id} ({copilotData.severity})</span>
                  </div>

                  <div className="border border-white/5 bg-[#06090d] p-4.5 text-xs leading-relaxed text-text/80 rounded shadow-inner">
                    <span className="block mb-2 font-mono text-[0.6rem] font-extrabold uppercase tracking-wider text-muted">🤖 AI Incident Summary</span>
                    {copilotData.executive_summary}
                  </div>

                  <div className="space-y-3">
                    <span className="soc-label">Evidence Analysis</span>
                    {copilotData.technical_findings.map((f, i) => (
                      <div key={`finding-${i}`} className="border border-white/5 bg-[#070a0e]/50 p-4.5 rounded">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-text">{f.name}</span>
                          <span className="font-mono text-[0.6rem] border border-riskHigh/20 text-riskHigh bg-riskHigh/5 px-2 py-0.5 rounded font-black">{f.rating}</span>
                        </div>
                        <div className="soc-mono mt-2 text-[0.65rem] text-muted font-bold">Evidence: {f.evidence}</div>
                        <p className="mt-2 text-xs text-text/70 leading-relaxed border-t border-white/3 pt-2">{f.description}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <span className="soc-label">Remediation Action Plan</span>
                    <ul className="list-decimal pl-4 text-xs text-text/70 space-y-3 leading-relaxed">
                      {copilotData.remediations.map((r, i) => (
                        <li key={`rem-${i}`} className="pl-1.5">{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {!loading && !error && activeTab === "pqc" && pqcData && (
                <div className="space-y-5">
                  <div>
                    <span className="soc-label">Cryptographic Vulnerabilities</span>
                    <div className="mt-3 space-y-3">
                      {pqcData.vulnerabilities.map((v, i) => (
                        <div key={`vuln-${i}`} className="border border-riskHigh/20 bg-riskHigh/5 p-4 rounded space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-riskHigh">{v.type}</span>
                            <span className="font-mono text-[0.58rem] bg-riskHigh/10 border border-riskHigh/20 px-2 py-0.5 rounded text-riskHigh font-black">{v.risk_level}</span>
                          </div>
                          <div className="font-mono text-[0.68rem] text-text/75 leading-snug">Detected: {v.detected_value}</div>
                          <p className="text-[11px] text-muted leading-relaxed border-t border-white/3 pt-1.5">{v.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-white/5 bg-[#070a0e]/50 p-4.5 rounded-md space-y-3 shadow-inner">
                    <span className="soc-label">Target Architecture Upgrade</span>
                    <dl className="text-xs space-y-3">
                      <div className="border-b border-white/3 pb-2 flex justify-between items-center gap-2">
                        <dt className="text-muted">Quantum-Safe Key Agreement:</dt>
                        <dd className="font-mono text-text font-black">{pqcData.target_architecture.key_exchange}</dd>
                      </div>
                      <div className="border-b border-white/3 pb-2 flex justify-between items-center gap-2">
                        <dt className="text-muted">Target Authentication Signature:</dt>
                        <dd className="font-mono text-text font-black">{pqcData.target_architecture.signature_scheme}</dd>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <dt className="text-muted">Protocol Baseline:</dt>
                        <dd className="font-mono text-text font-black">{pqcData.target_architecture.tls_version}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="space-y-4">
                    <CopyCodeBlock 
                      title="Recommended Handshake Config" 
                      code={pqcData.nginx_config} 
                    />
                    <CopyCodeBlock 
                      title="OpenSSL PQC Handshake Commands" 
                      code={pqcData.openssl_commands} 
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer Controls */}
            <div className="border-t border-white/5 px-6 py-4.5 space-y-3 bg-[#0a0e15]/40">
              <button
                type="button"
                onClick={downloadStix}
                className="soc-button flex w-full justify-center items-center gap-2 rounded shadow-md"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Export STIX 2.1 JSON</span>
              </button>
              <Link
                to={`/user/${encodeURIComponent(alert.user_id)}?session=${encodeURIComponent(alert.session_id)}`}
                state={{ alert }}
                className="soc-button-primary inline-flex w-full justify-center rounded shadow-md"
              >
                View Timeline
              </Link>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
