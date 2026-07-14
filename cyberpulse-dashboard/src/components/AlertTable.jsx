import { useMemo, useState } from "react";

function formatTimestamp(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function riskToneColor(score) {
  if (score >= 85) return "bg-riskHigh shadow-[0_0_6px_#ef4444]";
  if (score >= 50) return "bg-riskMedium shadow-[0_0_6px_#f59e0b]";
  return "bg-riskLow shadow-[0_0_6px_#10b981]";
}

function quantumClass(level) {
  if (level === "High") return "border-riskHigh/25 text-riskHigh bg-riskHigh/5";
  if (level === "Medium") return "border-riskMedium/25 text-riskMedium bg-riskMedium/5";
  return "border-riskLow/25 text-riskLow bg-riskLow/5";
}

function triageBadgeClass(status = "new") {
  const base = "inline-flex items-center text-[0.6rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded border w-fit ";
  if (status === "resolved") return base + "text-riskLow border-riskLow/20 bg-riskLow/5";
  if (status === "escalated") return base + "text-riskHigh border-riskHigh/20 bg-riskHigh/5";
  if (status === "investigating") return base + "text-riskMedium border-riskMedium/20 bg-riskMedium/5";
  return base + "text-cyberBlue border-cyberBlue/20 bg-cyberBlue/5";
}

function ExplanationCell({ alert, expanded, onToggle }) {
  return (
    <button
      type="button"
      className="block w-full text-left text-xs leading-relaxed text-text/80 focus-visible:outline-2 focus-visible:outline-amber bg-white/1 border border-white/2 hover:border-white/5 p-2 rounded transition-all duration-200"
      onClick={(event) => {
        event.stopPropagation();
        onToggle(alert.session_id);
      }}
      aria-expanded={expanded}
    >
      <span className={expanded ? "block text-text/90" : "line-clamp-2"}>
        {alert.explanation || "No explanation returned by backend."}
      </span>
      <span className="mt-1.5 flex items-center gap-1 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-muted hover:text-amber transition-colors">
        {expanded ? (
          <>
            <span>Collapse Details</span>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </>
        ) : (
          <>
            <span>Expand Details</span>
            <svg className="w-3 h-3 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </span>
    </button>
  );
}

export default function AlertTable({ alerts, loading, error, onSelect, onTriageChange }) {
  const [sortDir, setSortDir] = useState("desc");
  const [quantumFilter, setQuantumFilter] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());

  const processed = useMemo(() => {
    const start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    const end = endDate ? new Date(`${endDate}T23:59:59`).getTime() : null;

    return [...alerts]
      .filter((alert) => {
        if (quantumFilter !== "All" && alert.quantum_risk_level !== quantumFilter) return false;
        const timestamp = new Date(alert.timestamp || alert.session_start).getTime();
        if (start !== null && timestamp < start) return false;
        if (end !== null && timestamp > end) return false;
        return true;
      })
      .sort((a, b) => {
        const delta = Number(a.risk_score || 0) - Number(b.risk_score || 0);
        return sortDir === "asc" ? delta : -delta;
      });
  }, [alerts, quantumFilter, startDate, endDate, sortDir]);

  function toggleExpanded(sessionId) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  if (loading) {
    return <div className="soc-panel h-[420px] animate-pulse bg-panelSoft/50" />;
  }

  if (error) {
    return (
      <div className="soc-panel border-riskHigh/30 bg-riskHigh/5 px-5 py-6 text-riskHigh/90 backdrop-blur-md rounded-md flex items-center gap-3">
        <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>Alert feed is offline. Confirm the backend is running at http://127.0.0.1:8000 and reload.</span>
      </div>
    );
  }

  return (
    <section className="soc-panel overflow-hidden" aria-label="Alert feed">
      <div className="flex flex-col gap-4 border-b border-white/5 bg-[#0e131b]/60 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="soc-label">Alert feed</div>
          <div className="mt-1 font-mono text-[0.7rem] text-muted">
            Correlating <span className="text-text font-bold">{processed.length.toLocaleString()}</span> of {alerts.length.toLocaleString()} threat vectors
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted/90">Quantum risk</span>
            <select
              value={quantumFilter}
              onChange={(event) => setQuantumFilter(event.target.value)}
              className="cyber-input py-1.5 text-xs rounded"
            >
              <option value="All">All Levels</option>
              <option value="High">High Risk</option>
              <option value="Medium">Medium Risk</option>
              <option value="Low">Low Risk</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted/90">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="cyber-input py-1.5 text-xs rounded"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted/90">End date</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="cyber-input py-1.5 text-xs rounded"
            />
          </div>

          <button
            type="button"
            className="soc-button py-2 px-3 text-xs w-full flex items-center justify-center gap-1.5 rounded"
            onClick={() => setSortDir((current) => (current === "desc" ? "asc" : "desc"))}
          >
            <span>Risk Score</span>
            <svg 
              className={`w-3.5 h-3.5 text-amber transition-transform duration-300 ${sortDir === "asc" ? "rotate-180" : ""}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 13l-7 7-7-7m14-6l-7-7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {processed.length === 0 ? (
        <div className="px-5 py-16 text-center text-xs text-muted/80">
          No sessions match this filter set. Widen the date range or include more quantum-risk levels.
        </div>
      ) : (
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="sticky top-0 z-10 border-b border-white/5 bg-[#0e131b]">
              <tr className="text-[0.65rem] font-extrabold uppercase tracking-[0.16em] text-muted border-b border-white/5">
                <th className="px-5 py-3.5 font-bold">User ID</th>
                <th className="px-5 py-3.5 font-bold">Timestamp</th>
                <th className="px-5 py-3.5 font-bold">Risk score</th>
                <th className="px-5 py-3.5 font-bold">Explanation</th>
                <th className="px-5 py-3.5 font-bold">Quantum risk</th>
                <th className="px-5 py-3.5 font-bold">Triage Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/3 bg-base/10">
              {processed.map((alert) => {
                const score = Number(alert.risk_score || 0);
                const colorTone = riskToneColor(score);
                const expandedRow = expanded.has(alert.session_id);
                return (
                  <tr
                    key={alert.session_id}
                    tabIndex={0}
                    onClick={() => onSelect(alert)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onSelect(alert);
                    }}
                    className="cursor-pointer transition-colors duration-200 hover:bg-white/[0.015] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
                  >
                    <td className="px-5 py-4 align-top">
                      <div className="soc-mono text-sm font-semibold text-text">{alert.user_id}</div>
                      <div className="soc-mono mt-1 text-[0.65rem] text-muted font-bold">{alert.session_id}</div>
                    </td>
                    <td className="soc-mono px-5 py-4 align-top text-xs text-muted/90">
                      {formatTimestamp(alert.timestamp || alert.session_start)}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="soc-mono text-sm font-extrabold text-text">
                        {score.toFixed(1)}
                      </div>
                      <div className="mt-2 h-1.5 w-28 bg-steel rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${colorTone}`}
                          style={{ width: `${Math.min(100, score)}%` }}
                        />
                      </div>
                    </td>
                    <td className="max-w-[480px] px-5 py-4 align-top">
                      <ExplanationCell
                        alert={alert}
                        expanded={expandedRow}
                        onToggle={toggleExpanded}
                      />
                    </td>
                    <td className="px-5 py-4 align-top">
                      <span
                        className={`inline-flex border px-2 py-0.5 rounded font-mono text-[0.65rem] font-bold uppercase tracking-[0.08em] ${quantumClass(
                          alert.quantum_risk_level,
                        )}`}
                      >
                        {alert.quantum_risk_level || "Unknown"}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="flex flex-col gap-2">
                        {triageBadgeClass(alert.triage_status)}
                        <select
                          value={alert.triage_status || "new"}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => onTriageChange?.(alert.session_id, event.target.value, alert.triage_note || "")}
                          className="border border-white/5 bg-[#0a0e14] rounded px-2 py-1 font-mono text-[0.7rem] text-text/80 transition-all focus:border-amber/40 focus:outline-none"
                        >
                          <option value="new">New</option>
                          <option value="investigating">Investigating</option>
                          <option value="escalated">Escalated</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
