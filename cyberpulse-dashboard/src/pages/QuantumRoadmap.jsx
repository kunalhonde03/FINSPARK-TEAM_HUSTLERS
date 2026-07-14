import { useEffect, useMemo, useState } from "react";
import VulnerabilityPieChart from "../components/VulnerabilityPieChart.jsx";
import InventoryTable from "../components/InventoryTable.jsx";
import { getCryptoInventory } from "../api/client.js";
import { getAlerts, getStats } from "../api/client.js";

export default function QuantumRoadmap() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadQuantumData() {
    setLoading(true);
    setError("");
    try {
      const [statsPayload, alertsPayload] = await Promise.all([
        getStats(),
        getAlerts({ minRisk: 0, limit: 1500 }),
      ]);
      setStats(statsPayload);
      setAlerts(alertsPayload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQuantumData();
  }, []);

  const pieData = useMemo(() => {
    const vulnerable = alerts.filter((alert) => alert.quantum_risk_level === "High").length;
    const medium = alerts.filter((alert) => alert.quantum_risk_level === "Medium").length;
    const safe = Math.max(0, alerts.length - vulnerable - medium);

    return [
      { name: "Quantum-safe", value: safe, color: "#3ee7a3" },
      { name: "Needs review", value: medium, color: "#e8a33d" },
      { name: "High risk", value: vulnerable, color: "#f76c6c" },
    ];
  }, [alerts]);

  const [inventory, setInventory] = useState(null);

  async function loadInventory() {
    try {
      const inv = await getCryptoInventory();
      setInventory(inv);
    } catch (err) {
      // keep inventory null on error
    }
  }

  useEffect(() => {
    loadInventory();
  }, []);

  const vulnerableSessions = alerts.filter((alert) => alert.quantum_risk_level === "High").length;
  const mediumSessions = alerts.filter((alert) => alert.quantum_risk_level === "Medium").length;
  const safeSessions = Math.max(0, alerts.length - vulnerableSessions - mediumSessions);
  const migrationCoverage = alerts.length ? Math.round((safeSessions / alerts.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="soc-label">Quantum roadmap</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-text">
            Post-quantum cryptography migration and audit console
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            This view highlights legacy cryptographic configurations that are still present in active sessions and ranks the migration work needed to strengthen the bank’s defenses.
          </p>
        </div>
        <button type="button" className="soc-button w-fit" onClick={loadQuantumData}>
          Refresh audit view
        </button>
      </div>

      {loading ? (
        <div className="soc-panel h-40 animate-pulse bg-panelSoft" />
      ) : error ? (
        <div className="soc-panel border-riskHigh/50 px-4 py-3 text-sm text-riskHigh">{error}</div>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="soc-panel px-4 py-3">
              <div className="soc-label">Sessions reviewed</div>
              <div className="soc-mono mt-2 text-2xl font-semibold text-text">{alerts.length}</div>
            </div>
            <div className="soc-panel px-4 py-3">
              <div className="soc-label">High-risk sessions</div>
              <div className="soc-mono mt-2 text-2xl font-semibold text-riskHigh">{vulnerableSessions}</div>
            </div>
            <div className="soc-panel px-4 py-3">
              <div className="soc-label">Medium-risk sessions</div>
              <div className="soc-mono mt-2 text-2xl font-semibold text-amber">{mediumSessions}</div>
            </div>
            <div className="soc-panel px-4 py-3">
              <div className="soc-label">Coverage</div>
              <div className="soc-mono mt-2 text-2xl font-semibold text-text">{migrationCoverage}%</div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <VulnerabilityPieChart data={pieData} />

            <div className="space-y-3">
              <div className="soc-panel p-4">
                <div className="soc-label">Executive summary</div>
                <div className="mt-3 text-sm text-muted">
                  {stats?.high_quantum_risk_count ? (
                    <>
                      The bank currently has <span className="font-semibold text-text">{stats.high_quantum_risk_count}</span> sessions flagged for quantum-vulnerable crypto posture. Migration should begin with the most exposed channels and certificate inventory.
                    </>
                  ) : (
                    <>The current session mix appears mostly aligned with modern crypto controls, but legacy inventory should still be reviewed for shadow systems.</>
                  )}
                </div>
              </div>
              {inventory ? (
                <InventoryTable inventory={inventory} />
              ) : (
                <div className="soc-panel p-4 text-sm text-muted">Inventory not available</div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
