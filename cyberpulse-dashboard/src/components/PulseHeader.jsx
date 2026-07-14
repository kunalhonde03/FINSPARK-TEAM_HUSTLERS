import { NavLink } from "react-router-dom";

function statusCopy(status) {
  if (status === "online") return "Backend linked";
  if (status === "offline") return "Backend offline";
  return "Checking backend";
}

function pulseSpeed(stats) {
  const flagged = Number(stats?.flagged_count || 0);
  const highQuantum = Number(stats?.high_quantum_risk_count || 0);
  if (highQuantum > 100 || flagged > 220) return "1.35s";
  if (flagged > 100) return "1.9s";
  return "2.8s";
}

export default function PulseHeader({ status, stats, lastChecked }) {
  const navClass = ({ isActive }) =>
    [
      "border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors",
      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber",
      isActive
        ? "border-amber text-amber bg-amber/10"
        : "border-border text-muted hover:border-borderStrong hover:text-text",
    ].join(" ");

  return (
    <header className="border-b border-border bg-base/95">
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="border-l-2 border-amber pl-3">
            <div className="font-mono text-lg font-bold uppercase tracking-[0.18em] text-text">
              CyberPulse
            </div>
            <div className="text-xs uppercase tracking-[0.12em] text-muted">
              Banking threat correlation console
            </div>
          </div>

          <div
            className="hidden h-10 min-w-[240px] flex-1 overflow-hidden border border-border bg-panel md:block"
            style={{ "--pulse-speed": pulseSpeed(stats) }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 420 42" className="h-full w-full">
              <line x1="0" y1="21" x2="420" y2="21" stroke="rgba(255,255,255,0.08)" />
              <g className="animate-pulseTrace">
                <polyline
                  points="0,21 38,21 52,20 60,9 70,34 81,21 124,21 136,17 150,21 194,21 206,12 216,30 226,21 282,21 296,19 310,21 350,21 365,7 378,35 390,21 420,21"
                  fill="none"
                  stroke="#E8A33D"
                  strokeWidth="1.8"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                />
              </g>
            </svg>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <nav className="flex flex-wrap gap-2" aria-label="Primary">
            <NavLink to="/" className={navClass}>
              Overview
            </NavLink>
            <NavLink to="/simulate" className={navClass}>
              Simulate
            </NavLink>
            <NavLink to="/mule-tracker" className={navClass}>
              Mule Tracker
            </NavLink>
            <NavLink to="/neo4j-explorer" className={navClass}>
              Neo4j 3D Explorer
            </NavLink>
          </nav>

          <div className="flex items-center gap-3 border border-border bg-panel px-3 py-2">
            <span
              className={[
                "h-2.5 w-2.5",
                status === "online" ? "bg-riskLow" : status === "offline" ? "bg-riskHigh" : "bg-riskMedium",
              ].join(" ")}
              aria-hidden="true"
            />
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-text">
                {statusCopy(status)}
              </div>
              <div className="font-mono text-[0.68rem] text-muted">
                {lastChecked ? lastChecked.toLocaleTimeString() : "awaiting signal"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
