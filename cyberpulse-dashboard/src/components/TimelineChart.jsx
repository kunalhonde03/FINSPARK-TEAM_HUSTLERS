import {
  Bar,
  Cell,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function markerColor(event) {
  if (event.highlighted) return "#E8A33D";
  if (event.login_status === "fail") return "#D64545";
  return "#3EB489";
}

function TelemetryShape(props) {
  const { cx, cy, payload } = props;
  const fill = markerColor(payload);
  const size = payload.highlighted ? 6 : 4.6;
  return (
    <g>
      <rect
        x={cx - size}
        y={cy - size}
        width={size * 2}
        height={size * 2}
        transform={`rotate(45 ${cx} ${cy})`}
        fill={fill}
        stroke={payload.highlighted ? "#0B0F13" : "rgba(255,255,255,0.36)"}
        strokeWidth={payload.highlighted ? 2 : 1}
      />
    </g>
  );
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload.find((item) => item.payload?.event_type) || payload[0];
  const event = point.payload;
  return (
    <div className="border border-borderStrong bg-base px-3 py-2 text-xs shadow-drawer">
      <div className="soc-mono font-semibold text-text">{formatTime(event.timestamp)}</div>
      <div className="mt-1 text-muted">{event.detail || event.event_type}</div>
      {event.amount !== undefined && event.amount !== null && (
        <div className="soc-mono mt-1 text-amber">INR {Number(event.amount).toLocaleString()}</div>
      )}
    </div>
  );
}

export default function TimelineChart({ events }) {
  if (!events?.length) {
    return (
      <div className="soc-panel px-4 py-8 text-sm text-muted">
        No timeline events were returned for this user.
      </div>
    );
  }

  const ordered = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const maxAmount = Math.max(1, ...ordered.map((event) => Number(event.amount || 0)));
  const markerY = maxAmount * 1.14;
  const chartData = ordered.map((event) => ({
    ...event,
    timeValue: new Date(event.timestamp).getTime(),
    amount: event.event_type === "transaction" ? Number(event.amount || 0) : null,
  }));
  const telemetryData = chartData
    .filter((event) => event.event_type === "telemetry")
    .map((event) => ({ ...event, markerY }));

  return (
    <div className="soc-panel px-3 py-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <div className="soc-label">Correlated timeline</div>
          <div className="mt-1 text-sm text-muted">Transaction bars share the axis with telemetry markers.</div>
        </div>
        <div className="hidden gap-3 text-xs text-muted sm:flex">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 bg-riskLow" /> success
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 bg-riskHigh" /> failed login
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 bg-amber" /> risk contributor
          </span>
        </div>
      </div>
      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 18, bottom: 18, left: 4 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="timeValue"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatTime}
              stroke="#8A96A3"
              tick={{ fill: "#8A96A3", fontSize: 11, fontFamily: "Consolas, monospace" }}
            />
            <YAxis
              domain={[0, markerY * 1.18]}
              stroke="#8A96A3"
              tick={{ fill: "#8A96A3", fontSize: 11, fontFamily: "Consolas, monospace" }}
              tickFormatter={(value) => `${Math.round(value / 1000)}k`}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(232,163,61,0.28)" }} />
            <Bar dataKey="amount" fill="#34546B" maxBarSize={14} radius={0}>
              {chartData.map((entry) => (
                <Cell
                  key={`cell-${entry.id}-${entry.timestamp}`}
                  fill={entry.highlighted ? "#E8A33D" : "#34546B"}
                />
              ))}
            </Bar>
            <Scatter data={telemetryData} dataKey="markerY" shape={<TelemetryShape />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
