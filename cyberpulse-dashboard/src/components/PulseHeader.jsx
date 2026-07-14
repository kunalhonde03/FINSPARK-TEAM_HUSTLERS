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
      "relative px-3.5 py-2.5 text-[0.7rem] font-bold uppercase tracking-[0.16em] transition-all duration-300",
      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber",
      isActive
        ? "text-amber font-extrabold"
        : "text-muted hover:text-text",
    ].join(" ");

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#070a0e]/85 backdrop-blur-lg shadow-xl">
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-5">
          <div className="border-l-2 border-amber pl-3.5">
            <div className="font-display text-lg font-black uppercase tracking-[0.2em] text-text bg-gradient-to-r from-text to-muted bg-clip-text">
              CyberPulse
            </div>
            <div className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted/80">
              Banking threat correlation console
            </div>
          </div>

          <div
            className="hidden h-10 min-w-[280px] flex-1 overflow-hidden border border-white/5 bg-[#0a0e15] md:block rounded-sm relative"
            style={{ "--pulse-speed": pulseSpeed(stats) }}
            aria-hidden="true"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#ffaa22]/3 to-transparent pointer-events-none" />
            <svg viewBox="0 0 420 42" className="h-full w-full">
              <defs>
                <filter id="telemetryGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="1.6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <linearGradient id="telemetryGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#ffaa22" />
                  <stop offset="40%" stopColor="#00e5ff" />
                  <stop offset="70%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#ffaa22" />
                </linearGradient>
              </defs>
              <line x1="0" y1="21" x2="420" y2="21" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <g className="animate-pulseTrace">
                <polyline
                  points="0,21 38,21 52,20 60,9 70,34 81,21 124,21 136,17 150,21 194,21 206,12 216,30 226,21 282,21 296,19 310,21 350,21 365,7 378,35 390,21 420,21"
                  fill="none"
                  stroke="url(#telemetryGrad)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#telemetryGlow)"
                />
              </g>
            </svg>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <nav className="flex flex-wrap gap-1" aria-label="Primary">
            {[
              { to: "/", label: "Overview" },
              { to: "/simulate", label: "Simulate" },
              { to: "/methodology", label: "Methodology" },
              { to: "/mule-tracker", label: "Mule Tracker" },
              { to: "/neo4j-explorer", label: "Neo4j 3D" },
              { to: "/quantum-roadmap", label: "Quantum" }
            ].map((link) => (
              <NavLink key={link.to} to={link.to} className={navClass}>
                {({ isActive }) => (
                  <>
                    <span className="relative z-10">{link.label}</span>
                    {isActive && (
                      <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-gradient-to-r from-amber/40 via-amber to-amber/40 shadow-[0_0_8px_#ffaa22] rounded-full" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3 border border-white/5 bg-[#0e131b]/60 px-3.5 py-2 backdrop-blur-sm rounded-md shadow-inner">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                status === "online" ? "bg-riskLow" : status === "offline" ? "bg-riskHigh" : "bg-riskMedium"
              }`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                status === "online" ? "bg-riskLow" : status === "offline" ? "bg-riskHigh" : "bg-riskMedium"
              }`} />
            </span>
            <div>
              <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-text">
                {statusCopy(status)}
              </div>
              <div className="font-mono text-[0.65rem] text-muted">
                {lastChecked ? lastChecked.toLocaleTimeString() : "awaiting signal"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
