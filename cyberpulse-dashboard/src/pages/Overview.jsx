import { useEffect, useState } from "react";
import AlertDrawer from "../components/AlertDrawer.jsx";
import AlertTable from "../components/AlertTable.jsx";
import StatsRow from "../components/StatsRow.jsx";
import { API_BASE_URL, getAlerts, getStats, updateTriage } from "../api/client.js";

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAlert, setSelectedAlert] = useState(null);

  async function loadOverview() {
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
    loadOverview();
  }, []);

  async function handleTriageChange(sessionId, status, note) {
    try {
      await updateTriage(sessionId, status, note);
      setAlerts((current) => current.map((alert) => (alert.session_id === sessionId ? { ...alert, triage_status: status, triage_note: note } : alert)));
    } catch (err) {
      setError(err.message);
    }
  }

  function handleExport(format) {
    const url = `${API_BASE_URL}/export/alerts.${format}?min_risk=0&limit=1500`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="soc-label">Overview</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-text">
            Cybersecurity telemetry and transaction risk
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="soc-button w-fit" onClick={loadOverview}>
            Refresh feed
          </button>
          <button type="button" className="soc-button w-fit" onClick={() => handleExport("csv")}>
            Export CSV
          </button>
          <button type="button" className="soc-button w-fit" onClick={() => handleExport("pdf")}>
            Export PDF
          </button>
        </div>
      </div>

      <StatsRow stats={stats} loading={loading} error={error} />
      <AlertTable alerts={alerts} loading={loading} error={error} onSelect={setSelectedAlert} onTriageChange={handleTriageChange} />
      <AlertDrawer alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
    </div>
  );
}
