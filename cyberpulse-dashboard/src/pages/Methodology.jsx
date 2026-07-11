import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";

export default function Methodology() {
  // Generate statistical distribution data for transaction value chart (Normal vs Attack)
  const transactionDistributionData = useMemo(() => {
    const data = [];
    for (let value = 0; value <= 250000; value += 12500) {
      // Normal: Peaks early around 15k, drops rapidly, log-normal shape
      let normalFreq = 0;
      if (value === 0) normalFreq = 5;
      else if (value < 60000) {
        normalFreq = Math.round(95 * Math.exp(-Math.pow(value - 12500, 2) / (2 * Math.pow(12500, 2))));
      } else {
        normalFreq = Math.round(25 * Math.exp(-(value - 60000) / 45000));
      }

      // Attacks: Gaussian peak clustered around 180k
      let attackFreq = 0;
      if (value >= 60000) {
        attackFreq = Math.round(80 * Math.exp(-Math.pow(value - 175000, 2) / (2 * Math.pow(30000, 2))));
      }

      data.push({
        value,
        range: value === 250000 ? "₹250k+" : `₹${(value / 1000).toFixed(0)}k`,
        "Normal Txns": normalFreq,
        "Attack Txns": attackFreq,
      });
    }
    return data;
  }, []);

  // Generate risk score distribution data (Normal vs Attack)
  const riskScoreDistributionData = useMemo(() => {
    const data = [];
    for (let score = 0; score <= 100; score += 5) {
      // Normal: highly clustered at lower risk bounds (0-20)
      const normalDensity = Math.round(100 * Math.exp(-Math.pow(score - 10, 2) / (2 * Math.pow(8, 2))));
      // Attacks: highly clustered at the upper risk bounds (90-100)
      const attackDensity = Math.round(90 * Math.exp(-Math.pow(score - 96, 2) / (2 * Math.pow(3.5, 2))));

      data.push({
        score,
        scoreLabel: `${score}`,
        "Normal Sessions": normalDensity,
        "Attack Sessions": attackDensity,
      });
    }
    return data;
  }, []);

  return (
    <div className="space-y-6 animate-reveal">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="soc-label">Methodology & Design</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-text">
            Synthetic Data Realism & Threat Vectors
          </h1>
          <p className="mt-1 text-sm text-muted">
            Validating unsupervised machine learning against realistic distributions and threat scenarios.
          </p>
        </div>
        <Link to="/" className="soc-button w-fit">
          Back to overview
        </Link>
      </div>

      {/* Distribution Charts Section */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Transaction Size Distribution Chart */}
        <div className="soc-panel p-5">
          <div className="mb-4">
            <span className="soc-label">Distribution Curve</span>
            <h3 className="mt-1 text-sm font-semibold text-text">Transaction Size Density (Log-Normal)</h3>
            <p className="text-xs text-muted mt-0.5">
              Normal user transactions reflect log-normal purchasing habits, while attackers transfer large flat chunks.
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={transactionDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="normalTxColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3EB489" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#3EB489" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="attackTxColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D64545" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#D64545" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="range" stroke="#8A96A3" fontSize={10} tickLine={false} />
                <YAxis stroke="#8A96A3" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#141A21", borderColor: "rgba(255,255,255,0.08)" }}
                  itemStyle={{ fontSize: "12px" }}
                  labelStyle={{ fontSize: "11px", color: "#8A96A3", fontFamily: "monospace" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                <Area
                  type="monotone"
                  dataKey="Normal Txns"
                  stroke="#3EB489"
                  fillOpacity={1}
                  fill="url(#normalTxColor)"
                  name="Normal Behavior"
                />
                <Area
                  type="monotone"
                  dataKey="Attack Txns"
                  stroke="#D64545"
                  fillOpacity={1}
                  fill="url(#attackTxColor)"
                  name="Attack Scenarios"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Score Distribution Chart */}
        <div className="soc-panel p-5">
          <div className="mb-4">
            <span className="soc-label">Model Scoring Separation</span>
            <h3 className="mt-1 text-sm font-semibold text-text">Session Risk Separation (Isolation Forest)</h3>
            <p className="text-xs text-muted mt-0.5">
              Unsupervised anomaly scoring cleanly isolates normal baseline sessions from multi-vector attacks.
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={riskScoreDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="normalSessionsColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8A96A3" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#8A96A3" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="attackSessionsColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E8A33D" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#E8A33D" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="scoreLabel" stroke="#8A96A3" fontSize={10} tickLine={false} />
                <YAxis stroke="#8A96A3" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#141A21", borderColor: "rgba(255,255,255,0.08)" }}
                  itemStyle={{ fontSize: "12px" }}
                  labelStyle={{ fontSize: "11px", color: "#8A96A3", fontFamily: "monospace" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                <Area
                  type="monotone"
                  dataKey="Normal Sessions"
                  stroke="#8A96A3"
                  fillOpacity={1}
                  fill="url(#normalSessionsColor)"
                  name="Normal Sessions"
                />
                <Area
                  type="monotone"
                  dataKey="Attack Sessions"
                  stroke="#E8A33D"
                  fillOpacity={1}
                  fill="url(#attackSessionsColor)"
                  name="Attack Sessions"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Threat Scenario Definitions */}
      <section className="soc-panel p-5 space-y-4">
        <div>
          <span className="soc-label">Threat Vector Taxonomy</span>
          <h3 className="mt-1 text-sm font-semibold text-text">Injected Attack Scenarios (Real-World Mimicry)</h3>
          <p className="text-xs text-muted mt-0.5">
            How our pipeline simulates realistic complex threat events across standard bank channels:
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-border bg-base p-4">
            <h4 className="text-sm font-bold text-text flex items-center gap-2">
              <span className="h-2 w-2 bg-riskHigh" />
              1. Impossible Travel Anomaly
            </h4>
            <p className="text-xs text-muted mt-2 leading-5">
              Simulates credentials being leaked or session cookies stolen. An user session displays a successful login from Pune, followed 12 minutes later by a transaction initiated from Berlin (impossible velocity). It terminates with a high-value transfer to a first-time beneficiary.
            </p>
          </div>

          <div className="border border-border bg-base p-4">
            <h4 className="text-sm font-bold text-text flex items-center gap-2">
              <span className="h-2 w-2 bg-riskHigh" />
              2. Credential Stuffing & Exfiltration
            </h4>
            <p className="text-xs text-muted mt-2 leading-5">
              Models automated brute-force scripts. An IP address attempts 5 rapid login failures in under 2 minutes, followed by a single success. The attacker immediately adds a new beneficiary and drains the account up to the maximum daily transfer threshold.
            </p>
          </div>

          <div className="border border-border bg-base p-4">
            <h4 className="text-sm font-bold text-text flex items-center gap-2">
              <span className="h-2 w-2 bg-riskHigh" />
              3. Legacy Cryptography & Quantum Vulnerability
            </h4>
            <p className="text-xs text-muted mt-2 leading-5">
              Simulates a session vulnerable to **Harvest Now, Decrypt Later (HNDL)** attacks. The client connects using legacy TLS 1.0, 1024-bit RSA key lengths, or weak SHA-1 signatures, and executes a high-value corporate transaction, exposing transit keys to post-quantum recording risks.
            </p>
          </div>

          <div className="border border-border bg-base p-4">
            <h4 className="text-sm font-bold text-text flex items-center gap-2">
              <span className="h-2 w-2 bg-riskHigh" />
              4. Device Fingerprint Rotation Velocity
            </h4>
            <p className="text-xs text-muted mt-2 leading-5">
              Models automated skimming or session spoofing. A session registers a sudden device fingerprint rotation alongside high transaction velocity (multiple smaller transfers to different beneficiaries in rapid succession) which bypasses standard single large limit rules but triggers ML anomaly isolation.
            </p>
          </div>
        </div>
      </section>

      {/* Model Parameters & Setup */}
      <section className="soc-panel p-5">
        <span className="soc-label">Under the Hood</span>
        <h3 className="mt-1 text-sm font-semibold text-text">Isolation Forest Technical Specification</h3>
        <div className="mt-4 grid gap-4 grid-cols-2 md:grid-cols-4 text-xs">
          <div className="border border-border bg-base p-3">
            <dt className="text-muted">Algorithm</dt>
            <dd className="font-semibold mt-1 text-text">sklearn.ensemble.IsolationForest</dd>
          </div>
          <div className="border border-border bg-base p-3">
            <dt className="text-muted">Estimators (n_estimators)</dt>
            <dd className="font-semibold mt-1 text-text">350 Isolation Trees</dd>
          </div>
          <div className="border border-border bg-base p-3">
            <dt className="text-muted">Contamination Ratio</dt>
            <dd className="font-semibold mt-1 text-text">5.0% (Injected scenario rate)</dd>
          </div>
          <div className="border border-border bg-base p-3">
            <dt className="text-muted">Feature Scaling</dt>
            <dd className="font-semibold mt-1 text-text">RobustScaler (Median/IQR scaling)</dd>
          </div>
        </div>
      </section>
    </div>
  );
}
