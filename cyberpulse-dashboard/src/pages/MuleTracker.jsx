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
    return <div className="soc-panel h-[480px] animate-pulse bg-panelSoft/50" />;
  }

  if (error) {
    return (
      <div className="soc-panel border-riskHigh/30 bg-riskHigh/5 px-5 py-6 text-riskHigh/90 backdrop-blur-md rounded-md flex items-center gap-3">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>Mule tracker network offline. Verify backend is online.</span>
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

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Network Canvas Panel */}
        <div className="soc-panel relative overflow-hidden bg-[#06090e] p-5 border border-white/5">
          <div className="absolute left-5 top-5 z-10 flex flex-wrap gap-4 text-[10px] font-mono bg-[#070a0e]/75 backdrop-blur px-3 py-2 rounded border border-white/5">
            <span className="flex items-center gap-1.5 text-cyberBlue">
              <span className="h-2 w-2 rounded-full bg-cyberBlue" /> Sender Account
            </span>
            <span className="flex items-center gap-1.5 text-riskHigh">
              <span className="h-2 w-2 rounded-full bg-riskHigh animate-ping" /> Compromised Sender
            </span>
            <span className="flex items-center gap-1.5 text-amber">
              <span className="h-2 w-2 rounded-full bg-amber" /> Mule Hub (Beneficiary)
            </span>
          </div>

          <svg viewBox="0 0 960 580" className="h-auto w-full">
            <defs>
              <filter id="glow" x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur stdDeviation="5.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Tactical Radar Background Matrix */}
            <g opacity="0.12">
              <circle cx="480" cy="290" r="100" fill="none" stroke="#00e5ff" strokeWidth="0.8" strokeDasharray="3, 3" />
              <circle cx="480" cy="290" r="200" fill="none" stroke="#00e5ff" strokeWidth="0.8" strokeDasharray="4, 4" />
              <circle cx="480" cy="290" r="300" fill="none" stroke="#00e5ff" strokeWidth="0.8" />
              <line x1="80" y1="290" x2="880" y2="290" stroke="#00e5ff" strokeWidth="0.8" strokeDasharray="5, 5" />
              <line x1="480" y1="50" x2="480" y2="530" stroke="#00e5ff" strokeWidth="0.8" strokeDasharray="5, 5" />
            </g>

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
                      stroke={isHighlighted ? "#ffaa22" : "rgba(255,255,255,0.03)"}
                      strokeWidth={isHighlighted ? 2.5 : 0.8}
                      strokeDasharray={link.sourceNode.is_compromised && isHighlighted ? "5, 5" : "none"}
                      className={isHighlighted && link.sourceNode.is_compromised ? "animate-pulse" : ""}
                    />
                    {isHighlighted && (
                      <circle
                        r="3.5"
                        fill="#ffaa22"
                        className="animate-pulse"
                      >
                        <animateMotion
                          dur="3.2s"
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
                
                let fillColor = "#00e5ff"; // User default (cyberBlue)
                if (node.type === "user") {
                  if (node.is_compromised) fillColor = "#ef4444"; // Compromised user
                } else {
                  fillColor = "#ffaa22"; // Mule beneficiary
                }

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer transition-all duration-200"
                    style={{ opacity: isDimmed ? 0.2 : 1 }}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onClick={() => setSelectedNode(node)}
                  >
                    {/* Glowing highlight indicator */}
                    {(isHovered || selectedNode?.id === node.id) && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.type === "beneficiary" ? 22 : 15}
                        fill="none"
                        stroke={fillColor}
                        strokeWidth="2"
                        filter="url(#glow)"
                        className="animate-[pulse_1.8s_infinite]"
                      />
                    )}

                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.type === "beneficiary" ? 14 : 9}
                      fill={fillColor}
                      stroke="#06090e"
                      strokeWidth="2.5"
                    />

                    <text
                      x={node.x}
                      y={node.type === "beneficiary" ? node.y + 28 : node.y - 15}
                      textAnchor="middle"
                      fill="#e2e8f0"
                      className="font-mono text-[9px] font-extrabold select-none pointer-events-none text-glow"
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
        <div className="soc-panel flex flex-col justify-between p-5.5 bg-[#0e131b]/90 backdrop-blur border border-white/5">
          {activeNodeInfo ? (
            <div className="space-y-5">
              <div className="border-b border-white/5 pb-4">
                <span className="soc-label">
                  {activeNodeInfo.type === "beneficiary" ? "Mule Hub Account" : "Compromised User"}
                </span>
                <h3 className="soc-mono mt-1 text-lg font-black text-text">
                  {activeNodeInfo.id}
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="border border-white/5 bg-[#070a0e]/60 px-3.5 py-3 rounded">
                  <span className="text-[9px] uppercase tracking-wider text-muted font-bold">Risk Score</span>
                  <div className="soc-mono text-base font-black text-amber mt-1">
                    {activeNodeInfo.risk_score?.toFixed(1)}/100
                  </div>
                  <div className="mt-2 h-1.5 w-full bg-steel rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        activeNodeInfo.risk_score >= 80 ? "bg-riskHigh" : activeNodeInfo.risk_score >= 50 ? "bg-riskMedium" : "bg-riskLow"
                      }`}
                      style={{ width: `${activeNodeInfo.risk_score}%` }}
                    />
                  </div>
                </div>
                <div className="border border-white/5 bg-[#070a0e]/60 px-3.5 py-3 rounded flex flex-col justify-between">
                  <span className="text-[9px] uppercase tracking-wider text-muted font-bold">Risk Tier</span>
                  <div className="soc-mono text-sm font-extrabold text-text mt-2 uppercase tracking-wide">
                    {activeNodeInfo.risk_level}
                  </div>
                </div>
              </div>

              {activeNodeInfo.type === "beneficiary" ? (
                <div className="space-y-3 pt-2">
                  <div className="border border-white/5 bg-[#070a0e]/60 px-3.5 py-3 rounded">
                    <span className="text-[9px] uppercase tracking-wider text-muted font-bold">Total Cash Inflow</span>
                    <div className="soc-mono text-base font-black text-riskLow mt-1">
                      ₹ {activeNodeInfo.total_received?.toLocaleString()}
                    </div>
                  </div>

                  <div className="border border-white/5 bg-[#070a0e]/60 px-3.5 py-3 rounded">
                    <span className="text-[9px] uppercase tracking-wider text-muted font-bold">Transaction Ingests</span>
                    <div className="soc-mono text-xs font-bold text-text mt-1">
                      {activeNodeInfo.txn_count} wires mapped
                    </div>
                  </div>

                  <div className="border border-white/5 bg-[#070a0e]/60 px-3.5 py-3 rounded">
                    <span className="text-[9px] uppercase tracking-wider text-muted font-bold">Wallet Register Status</span>
                    <div className="soc-mono text-[10px] font-extrabold text-text mt-1">
                      {activeNodeInfo.is_new ? (
                        <span className="text-riskHigh">🔴 NEW REGISTRATION</span>
                      ) : (
                        <span className="text-riskLow">🟢 LEGACY RETAIL ACCOUNT</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="border border-white/5 bg-[#070a0e]/60 px-3.5 py-3 rounded">
                    <span className="text-[9px] uppercase tracking-wider text-muted font-bold">Client Verification</span>
                    <div className="soc-mono text-[10px] font-extrabold text-text mt-1">
                      {activeNodeInfo.is_compromised ? (
                        <span className="text-riskHigh">⚠️ HIJACK INDICATOR</span>
                      ) : (
                        <span className="text-riskLow">🛡️ ACCOUNT VALIDATED</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-xs text-muted/75 py-12">
              Select or hover over a network node to inspect its fraud profile.
            </div>
          )}

          <div className="border-t border-white/5 pt-4 text-[10px] text-muted/80 leading-relaxed font-mono mt-5">
            💡 Compromised nodes are flagged with dashed orange pulse flow links tracing wire endpoints.
          </div>
        </div>
      </div>
    </div>
  );
}
