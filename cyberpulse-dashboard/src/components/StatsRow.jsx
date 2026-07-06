function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toLocaleString();
}

function StatBlock({ label, value, suffix = "", tone = "default" }) {
  const toneClass =
    tone === "amber" ? "text-amber" : tone === "red" ? "text-riskHigh" : "text-text";
  return (
    <div className="soc-panel min-h-[86px] px-4 py-3">
      <div className="soc-label">{label}</div>
      <div className={`soc-mono mt-2 text-2xl font-semibold ${toneClass}`}>
        {value}
        {suffix}
      </div>
    </div>
  );
}

export default function StatsRow({ stats, loading, error }) {
  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="soc-panel h-[86px] animate-pulse bg-panelSoft" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="soc-panel border-riskHigh/50 px-4 py-3 text-sm text-riskHigh">
        Stats channel unavailable. Start the FastAPI backend on port 8000, then refresh this console.
      </div>
    );
  }

  const detectionRate =
    stats?.validation_attack_recall_top_5_pct ??
    (stats?.estimated_false_positive_reduction_pct
      ? Math.max(0, 100 - Number(stats.estimated_false_positive_reduction_pct)).toFixed(1)
      : null);

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="CyberPulse statistics">
      <StatBlock label="Total sessions analyzed" value={formatNumber(stats?.total_sessions)} />
      <StatBlock label="Alerts flagged" value={formatNumber(stats?.flagged_count)} tone="amber" />
      <StatBlock
        label="High quantum-risk sessions"
        value={formatNumber(stats?.high_quantum_risk_count)}
        tone="red"
      />
      <StatBlock
        label="Detection rate"
        value={detectionRate === null ? "--" : Number(detectionRate).toFixed(1)}
        suffix={detectionRate === null ? "" : "%"}
      />
    </section>
  );
}
