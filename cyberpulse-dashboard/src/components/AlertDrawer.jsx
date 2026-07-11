import { Link } from "react-router-dom";
import { useMemo } from "react";

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

          <div className="flex-1 space-y-5 overflow-auto px-5 py-5">
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
          </div>

          <div className="border-t border-border px-5 py-4">
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
