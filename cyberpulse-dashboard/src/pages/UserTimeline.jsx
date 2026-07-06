import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import TimelineChart from "../components/TimelineChart.jsx";
import { getAlerts, getUserTimeline } from "../api/client.js";

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function isContributor(event, alert) {
  if (!alert?.explanation) return false;
  const explanation = alert.explanation.toLowerCase();
  if (event.event_type === "transaction") {
    return (
      explanation.includes("transfer") ||
      explanation.includes("beneficiary") ||
      explanation.includes("transaction velocity") ||
      explanation.includes("high-value")
    );
  }
  const detail = `${event.detail || ""} ${event.login_status || ""} ${event.tls_version || ""} ${
    event.cipher_suite || ""
  }`.toLowerCase();
  return (
    (explanation.includes("impossible travel") && event.geo_location) ||
    (explanation.includes("failed-login") && detail.includes("fail")) ||
    (explanation.includes("device") && event.device_fingerprint) ||
    (explanation.includes("weak crypto") && (detail.includes("tls") || detail.includes("rsa")))
  );
}

function eventTone(event) {
  if (event.highlighted) return "border-amber bg-amber/10";
  if (event.event_type === "transaction") return "border-border bg-base";
  if (event.login_status === "fail") return "border-riskHigh/50 bg-riskHigh/10";
  return "border-border bg-base";
}

export default function UserTimeline() {
  const { id } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");
  const [events, setEvents] = useState([]);
  const [alertContext, setAlertContext] = useState(location.state?.alert || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadTimeline() {
      setLoading(true);
      setError("");
      try {
        const payload = await getUserTimeline(id);
        let context = location.state?.alert || null;
        if (!context && sessionId) {
          const alerts = await getAlerts({ minRisk: 0, limit: 2000 });
          context = alerts.find((alert) => alert.session_id === sessionId) || null;
        }
        if (!alive) return;
        setAlertContext(context);
        setEvents(payload.events || []);
      } catch (err) {
        if (!alive) return;
        setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadTimeline();
    return () => {
      alive = false;
    };
  }, [id, location.state, sessionId]);

  const highlightedEvents = useMemo(
    () =>
      events.map((event) => ({
        ...event,
        highlighted: isContributor(event, alertContext),
      })),
    [events, alertContext],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="soc-label">User timeline</div>
          <h1 className="soc-mono mt-2 text-2xl font-semibold tracking-normal text-text">{id}</h1>
          {alertContext && (
            <div className="mt-2 max-w-4xl text-sm text-muted">
              Context: {alertContext.explanation}
            </div>
          )}
        </div>
        <Link to="/" className="soc-button w-fit">
          Back to overview
        </Link>
      </div>

      {loading && <div className="soc-panel h-[420px] animate-pulse bg-panelSoft" />}

      {error && (
        <div className="soc-panel border-riskHigh/50 px-4 py-5 text-riskHigh">
          Timeline channel failed. Confirm the backend is running and the user ID exists.
        </div>
      )}

      {!loading && !error && (
        <>
          <TimelineChart events={highlightedEvents} />

          <section className="soc-panel overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <div className="soc-label">Chronological event log</div>
              <div className="mt-1 text-sm text-muted">
                Highlighted rows match the active alert explanation where session context is available.
              </div>
            </div>
            <div className="max-h-[520px] overflow-auto">
              {highlightedEvents.map((event) => (
                <div
                  key={`${event.event_type}-${event.id}-${event.timestamp}`}
                  className={`grid gap-3 border-b px-4 py-3 md:grid-cols-[210px_140px_1fr] ${eventTone(event)}`}
                >
                  <div className="soc-mono text-sm text-muted">{formatTimestamp(event.timestamp)}</div>
                  <div className="soc-mono text-xs uppercase tracking-[0.12em] text-text">
                    {event.event_type}
                  </div>
                  <div>
                    <div className="text-sm text-text">{event.detail}</div>
                    {event.highlighted && (
                      <div className="soc-mono mt-1 text-xs uppercase tracking-[0.14em] text-amber">
                        risk contributor
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
