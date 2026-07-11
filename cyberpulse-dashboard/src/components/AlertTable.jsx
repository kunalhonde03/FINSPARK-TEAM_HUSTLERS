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

function riskTone(score) {
  if (score >= 85) return "bg-riskHigh text-riskHigh";
  if (score >= 50) return "bg-riskMedium text-riskMedium";
  return "bg-riskLow text-riskLow";
}

function quantumClass(level) {
  if (level === "High") return "border-riskHigh/60 text-riskHigh";
  if (level === "Medium") return "border-riskMedium/70 text-riskMedium";
  return "border-riskLow/60 text-riskLow";
}

function ExplanationCell({ alert, expanded, onToggle }) {
  return (
    <button
      type="button"
      className="block w-full text-left text-sm leading-5 text-text/90 focus-visible:outline-2 focus-visible:outline-amber"
      onClick={(event) => {
        event.stopPropagation();
        onToggle(alert.session_id);
      }}
      aria-expanded={expanded}
    >
      <span className={expanded ? "" : "line-clamp-2"}>
        {alert.explanation || "No explanation returned by backend."}
      </span>
      <span className="mt-1 block text-[0.68rem] uppercase tracking-[0.14em] text-muted">
        {expanded ? "Collapse explanation" : "Expand explanation"}
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
    return <div className="soc-panel h-[420px] animate-pulse bg-panelSoft" />;
  }

  if (error) {
    return (
      <div className="soc-panel border-riskHigh/50 px-4 py-5 text-riskHigh">
        Alert feed is offline. Confirm the backend is running at http://127.0.0.1:8000 and reload.
      </div>
    );
  }

  return (
    <section className="soc-panel overflow-hidden" aria-label="Alert feed">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="soc-label">Alert feed</div>
          <div className="mt-1 font-mono text-sm text-muted">
            Showing {processed.length.toLocaleString()} of {alerts.length.toLocaleString()} fetched sessions
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-muted">
            Quantum risk
            <select
              value={quantumFilter}
              onChange={(event) => setQuantumFilter(event.target.value)}
              className="mt-1 w-full border border-border bg-base px-2 py-2 font-mono text-sm text-text"
            >
              <option>All</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </label>

          <label className="text-xs text-muted">
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="mt-1 w-full border border-border bg-base px-2 py-2 font-mono text-sm text-text"
            />
          </label>

          <label className="text-xs text-muted">
            End date
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="mt-1 w-full border border-border bg-base px-2 py-2 font-mono text-sm text-text"
            />
          </label>

          <button
            type="button"
            className="soc-button self-end"
            onClick={() => setSortDir((current) => (current === "desc" ? "asc" : "desc"))}
          >
            Risk {sortDir === "desc" ? "highest first" : "lowest first"}
          </button>
        </div>
      </div>

      {processed.length === 0 ? (
        <div className="px-4 py-10 text-sm text-muted">
          No sessions match this filter set. Widen the date range or include more quantum-risk levels.
        </div>
      ) : (
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="sticky top-0 z-10 border-b border-border bg-panel">
              <tr className="text-[0.68rem] uppercase tracking-[0.14em] text-muted">
                <th className="px-4 py-3 font-semibold">User ID</th>
                <th className="px-4 py-3 font-semibold">Timestamp</th>
                <th className="px-4 py-3 font-semibold">Risk score</th>
                <th className="px-4 py-3 font-semibold">Explanation</th>
                <th className="px-4 py-3 font-semibold">Quantum risk</th>
                <th className="px-4 py-3 font-semibold">Triage</th>
              </tr>
            </thead>
            <tbody>
              {processed.map((alert) => {
                const tone = riskTone(Number(alert.risk_score || 0));
                const riskColor = tone.split(" ")[0];
                const expandedRow = expanded.has(alert.session_id);
                return (
                  <tr
                    key={alert.session_id}
                    tabIndex={0}
                    onClick={() => onSelect(alert)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onSelect(alert);
                    }}
                    className="cursor-pointer border-b border-border transition-colors hover:bg-panelSoft focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="soc-mono text-sm font-semibold text-text">{alert.user_id}</div>
                      <div className="soc-mono mt-1 text-[0.68rem] text-muted">{alert.session_id}</div>
                    </td>
                    <td className="soc-mono px-4 py-3 align-top text-sm text-muted">
                      {formatTimestamp(alert.timestamp || alert.session_start)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="soc-mono text-sm font-bold text-text">
                        {Number(alert.risk_score || 0).toFixed(1)}
                      </div>
                      <div className="mt-2 h-1.5 w-28 bg-steel">
                        <div
                          className={`h-full ${riskColor}`}
                          style={{ width: `${Math.min(100, Number(alert.risk_score || 0))}%` }}
                        />
                      </div>
                    </td>
                    <td className="max-w-[520px] px-4 py-3 align-top">
                      <ExplanationCell
                        alert={alert}
                        expanded={expandedRow}
                        onToggle={toggleExpanded}
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-flex border px-2 py-1 font-mono text-xs font-semibold uppercase tracking-[0.1em] ${quantumClass(
                          alert.quantum_risk_level,
                        )}`}
                      >
                        {alert.quantum_risk_level || "Unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        <span className="text-[0.68rem] uppercase tracking-[0.14em] text-muted">
                          {alert.triage_status || "new"}
                        </span>
                        <select
                          value={alert.triage_status || "new"}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => onTriageChange?.(alert.session_id, event.target.value, alert.triage_note || "")}
                          className="border border-border bg-base px-2 py-2 font-mono text-sm text-text"
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
