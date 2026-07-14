import { useEffect, useState, useMemo } from "react";
import { getMuleTrackerData } from "../api/client.js";

export default function MuleTracker() {
  const [data, setData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    async function loadMuleData() {
      setLoading(true);
      setError("");
      try {
        const payload = await getMuleTrackerData();
        setData(payload);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadMuleData();
  }, []);

  // Compute a force-directed graph layout so the view feels more like a relationship explorer
  const layout = useMemo(() => {
    if (!data.nodes.length) return { nodes: [], links: [] };

    const width = 960;
    const height = 580;
    const nodes = data.nodes.map((node, index) => ({
      ...node,
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
    }));

    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    nodes.forEach((node, index) => {
      const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
      const radius = node.type === "beneficiary" ? 120 : 180;
      node.x = width / 2 + Math.cos(angle) * radius;
      node.y = height / 2 + Math.sin(angle) * radius;
    });

    const links = data.links
      .map((link) => ({
        ...link,
        sourceNode: nodeById.get(link.source),
        targetNode: nodeById.get(link.target),
      }))
      .filter((link) => link.sourceNode && link.targetNode);

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    for (let step = 0; step < 140; step += 1) {
      nodes.forEach((node) => {
        node.vx *= 0.9;
        node.vy *= 0.9;
        node.x += node.vx;
        node.y += node.vy;
        node.x = clamp(node.x, 40, width - 40);
        node.y = clamp(node.y, 40, height - 40);
      });

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy) || 1;
          const minDistance = a.type === "beneficiary" || b.type === "beneficiary" ? 110 : 70;
          if (distance < minDistance) {
            const force = ((minDistance - distance) / minDistance) * 0.9;
            const vx = (dx / distance) * force;
            const vy = (dy / distance) * force;
            a.vx -= vx;
            a.vy -= vy;
            b.vx += vx;
            b.vy += vy;
          }
        }
      }

      links.forEach((link) => {
        const source = link.sourceNode;
        const target = link.targetNode;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.hypot(dx, dy) || 1;
        const targetDistance = source.type === "beneficiary" || target.type === "beneficiary" ? 220 : 170;
        const springForce = (distance - targetDistance) * 0.006;
        const nx = (dx / distance) * springForce;
        const ny = (dy / distance) * springForce;
        source.vx -= nx;
        source.vy -= ny;
        target.vx += nx;
        target.vy += ny;
      });
    }

    return {
      nodes: nodes.map((node) => ({ ...node })),
      links: links.map((link) => ({
        ...link,
        sourceNode: nodeById.get(link.source),
        targetNode: nodeById.get(link.target),
      })),
    };
  }, [data]);

  const connectedNodeIds = useMemo(() => {
    if (!hoveredNode) return new Set();
    const set = new Set([hoveredNode.id]);
    data.links.forEach(l => {
      if (l.source === hoveredNode.id) set.add(l.target);
      if (l.target === hoveredNode.id) set.add(l.source);
    });
    return set;
  }, [hoveredNode, data.links]);

  if (loading) {
    return <div className="soc-panel h-[480px] animate-pulse bg-panelSoft" />;
  }

  if (error) {
    return (
      <div className="soc-panel border-riskHigh/50 px-4 py-5 text-riskHigh">
        Mule tracker network offline. Verify backend is online.
      </div>
    );
  }

  const activeNodeInfo = selectedNode || hoveredNode || layout.nodes.find(n => n.type === "beneficiary");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <div className="soc-label">Security Analytics</div>
        <h1 className="text-2xl font-semibold tracking-normal text-text">
          Money Mule Ring Tracker
        </h1>
        <p className="max-w-3xl text-sm text-muted">
          Visual correlation mapping of multiple compromised accounts transferring money to the same beneficiary (mule hub). 
          Hover over nodes to inspect transaction links and trace high-probability fraud networks.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Network Canvas Panel */}
        <div className="soc-panel relative overflow-hidden bg-[#0d0f12] p-4">
          <div className="absolute left-4 top-4 z-10 flex gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-[#5e9eff]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#5e9eff]" /> Sender Account
            </span>
            <span className="flex items-center gap-1.5 text-riskHigh">
              <span className="h-2.5 w-2.5 rounded-full bg-riskHigh" /> Compromised Sender
            </span>
            <span className="flex items-center gap-1.5 text-amber">
              <span className="h-2.5 w-2.5 rounded-full bg-amber" /> Mule Hub (Beneficiary)
            </span>
          </div>

          <svg viewBox="0 0 960 580" className="h-auto w-full">
            <defs>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Links/Edges */}
            <g>
              {layout.links.map((link, idx) => {
                const isHighlighted = hoveredNode 
                  ? (link.source === hoveredNode.id || link.target === hoveredNode.id)
                  : true;
                return (
                  <g key={`link-${idx}`} className="transition-opacity duration-200">
                    <line
                      x1={link.sourceNode.x}
                      y1={link.sourceNode.y}
                      x2={link.targetNode.x}
                      y2={link.targetNode.y}
                      stroke={isHighlighted ? "#ffb020" : "#1a222d"}
                      strokeWidth={isHighlighted ? 2.5 : 1}
                      strokeDasharray={link.sourceNode.is_compromised && isHighlighted ? "5, 5" : "none"}
                      className={isHighlighted && link.sourceNode.is_compromised ? "animate-pulse" : ""}
                    />
                    {isHighlighted && (
                      <circle
                        r="3.5"
                        fill="#ffb020"
                        className="animate-[pulse_1.5s_infinite]"
                      >
                        <animateMotion
                          dur="3s"
                          repeatCount="indefinite"
                          path={`M ${link.sourceNode.x} ${link.sourceNode.y} L ${link.targetNode.x} ${link.targetNode.y}`}
                        />
                      </circle>
                    )}
                  </g>
                );
              })}
            </g>

            {/* Nodes */}
            <g>
              {layout.nodes.map((node) => {
                const isHovered = hoveredNode?.id === node.id;
                const isDimmed = hoveredNode && !connectedNodeIds.has(node.id);
                
                let fillColor = "#5e9eff"; // User default
                if (node.type === "user") {
                  if (node.is_compromised) fillColor = "#ff4a4a"; // Compromised user
                } else {
                  fillColor = "#ffb020"; // Mule beneficiary
                }

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer transition-all duration-200"
                    style={{ opacity: isDimmed ? 0.25 : 1 }}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onClick={() => setSelectedNode(node)}
                  >
                    {/* Ring glow for selected or hovered */}
                    {(isHovered || selectedNode?.id === node.id) && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.type === "beneficiary" ? 22 : 15}
                        fill="none"
                        stroke={fillColor}
                        strokeWidth="2"
                        filter="url(#glow)"
                      />
                    )}

                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.type === "beneficiary" ? 14 : 9}
                      fill={fillColor}
                      stroke="#0d0f12"
                      strokeWidth="2"
                    />

                    <text
                      x={node.x}
                      y={node.type === "beneficiary" ? node.y + 26 : node.y - 15}
                      textAnchor="middle"
                      fill="#e2e8f0"
                      className="font-mono text-[10px] font-bold"
                    >
                      {node.id}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Tooltip Details Panel */}
        <div className="soc-panel flex flex-col justify-between bg-panel p-5">
          {activeNodeInfo ? (
            <div className="space-y-4">
              <div>
                <span className="soc-label">
                  {activeNodeInfo.type === "beneficiary" ? "Mule Hub Account" : "Compromised User"}
                </span>
                <h3 className="soc-mono mt-1 text-xl font-bold text-text">
                  {activeNodeInfo.id}
                </h3>
              </div>

              <div className="border-t border-border pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-border bg-base px-3 py-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted">Risk Score</span>
                    <div className="soc-mono text-lg font-bold text-amber">
                      {activeNodeInfo.risk_score?.toFixed(1)}/100
                    </div>
                  </div>
                  <div className="border border-border bg-base px-3 py-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted">Risk Tier</span>
                    <div className="soc-mono text-lg font-bold text-text">
                      {activeNodeInfo.risk_level}
                    </div>
                  </div>
                </div>
              </div>

              {activeNodeInfo.type === "beneficiary" ? (
                <div className="space-y-3">
                  <div className="border border-border bg-base px-3 py-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted">Total Cash Received</span>
                    <div className="soc-mono text-base font-bold text-[#10b981]">
                      INR {activeNodeInfo.total_received?.toLocaleString()}
                    </div>
                  </div>

                  <div className="border border-border bg-base px-3 py-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted">Transaction Count</span>
                    <div className="soc-mono text-base font-bold text-text">
                      {activeNodeInfo.txn_count} incoming wires
                    </div>
                  </div>

                  <div className="border border-border bg-base px-3 py-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted">Account Status</span>
                    <div className="soc-mono text-xs font-bold text-text">
                      {activeNodeInfo.is_new ? "🔴 NEW REGISTRATION (HIGH RISK)" : "🟢 ESTABLISHED WALLET"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="border border-border bg-base px-3 py-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted">Client Classification</span>
                    <div className="soc-mono text-xs font-bold text-text">
                      {activeNodeInfo.is_compromised 
                        ? "🔴 COMPROMISED (CREDENTIAL HIJACKING INDICATOR)" 
                        : "🟢 UNCOMPROMISED SENDER"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-sm text-muted">
              Select or hover over a network node to inspect its fraud profile.
            </div>
          )}

          <div className="border-t border-border pt-4 text-[11px] text-muted">
            🔴 High-risk nodes are linked by dotted orange trace patterns showing real-time fund flows.
          </div>
        </div>
      </div>
    </div>
  );
}
