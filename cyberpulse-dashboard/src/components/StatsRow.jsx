function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toLocaleString();
}

function IconSessions() {
  return (
    <svg className="w-5 h-5 text-cyberBlue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function IconAlerts() {
  return (
    <svg className="w-5 h-5 text-amber animate-[pulse_2s_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function IconQuantum() {
  return (
    <svg className="w-5 h-5 text-riskHigh" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" />
    </svg>
  );
}

function IconDetection() {
  return (
    <svg className="w-5 h-5 text-riskLow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function StatBlock({ label, value, suffix = "", tone = "default", icon }) {
  const toneClass =
    tone === "amber" ? "text-amber" : tone === "red" ? "text-riskHigh" : "text-text";
  
  const borderAccent = 
    tone === "amber" 
      ? "border-l-riskMedium/40" 
      : tone === "red" 
      ? "border-l-riskHigh/40" 
      : tone === "green" 
      ? "border-l-riskLow/40" 
      : "border-l-cyberBlue/40";

  return (
    <div className={`soc-panel-interactive border-l-4 ${borderAccent} min-h-[96px] px-5 py-4 flex flex-col justify-between hover:shadow-glow/10`}>
      <div className="flex items-center justify-between gap-3">
        <span className="soc-label">{label}</span>
        <div className="p-1.5 bg-white/3 rounded-md border border-white/5">
          {icon}
        </div>
      </div>
      <div className={`soc-mono mt-3 text-3xl font-extrabold tracking-tight font-display ${toneClass}`}>
        {value}
        {suffix}
      </div>
    </div>
  );
}

export default function StatsRow({ stats, loading, error }) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="soc-panel h-[96px] animate-pulse bg-panelSoft/50" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="soc-panel border-riskHigh/30 bg-riskHigh/5 px-5 py-4 text-sm text-riskHigh/90 backdrop-blur-md rounded-md flex items-center gap-3">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>Telemetry channel unavailable. Confirm the FastAPI backend is running on port 8000, then reload.</span>
      </div>
    );
  }

  const detectionRate =
    stats?.validation_attack_recall_top_5_pct ??
    (stats?.estimated_false_positive_reduction_pct
      ? Math.max(0, 100 - Number(stats.estimated_false_positive_reduction_pct)).toFixed(1)
      : null);

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 animate-reveal" aria-label="CyberPulse statistics">
      <StatBlock 
        label="Total sessions analyzed" 
        value={formatNumber(stats?.total_sessions)} 
        icon={<IconSessions />}
      />
      <StatBlock 
        label="Alerts flagged" 
        value={formatNumber(stats?.flagged_count)} 
        tone="amber" 
        icon={<IconAlerts />}
      />
      <StatBlock
        label="High quantum-risk sessions"
        value={formatNumber(stats?.high_quantum_risk_count)}
        tone="red"
        icon={<IconQuantum />}
      />
      <StatBlock
        label="Detection rate"
        value={detectionRate === null ? "--" : Number(detectionRate).toFixed(1)}
        suffix={detectionRate === null ? "" : "%"}
        tone="green"
        icon={<IconDetection />}
      />
    </section>
  );
}
