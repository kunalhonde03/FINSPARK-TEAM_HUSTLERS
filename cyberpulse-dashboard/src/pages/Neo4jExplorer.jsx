import { useEffect, useState, useRef, useMemo } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import {
  getNeo4jStatus,
  saveNeo4jConfig,
  syncNeo4jDatabase,
  getNeo4jGraph,
  runCypherQuery,
} from "../api/client.js";

// Custom node 3D geometry creator with highlighting logic
function createNodeMesh(node, highlightedIds, activeNode) {
  let geometry;
  let color = "#5e9eff";

  switch (node.type) {
    case "user":
      geometry = new THREE.SphereGeometry(node.is_compromised ? 8 : 6, 16, 16);
      color = node.is_compromised ? "#ff4a4a" : "#3b82f6";
      break;
    case "session":
      geometry = new THREE.DodecahedronGeometry(5.5);
      color = "#c084fc"; // Purple
      break;
    case "transaction":
      geometry = new THREE.SphereGeometry(3.5, 12, 12);
      color = "#06b6d4"; // Teal
      break;
    case "beneficiary":
      geometry = new THREE.BoxGeometry(8.5, 8.5, 8.5);
      color = node.risk_level === "High" ? "#fbbf24" : "#10b981"; // Gold vs Green
      break;
    case "ipaddress":
      geometry = new THREE.ConeGeometry(4, 8.5, 8);
      color = "#34d399"; // Emerald
      break;
    case "device":
      geometry = new THREE.CylinderGeometry(3, 3, 8.5, 8);
      color = "#f97316"; // Orange
      break;
    default:
      geometry = new THREE.SphereGeometry(5, 8, 8);
      color = "#94a3b8";
  }

  // Highlighting & Opacity Calculations
  const hasActiveFilter = !!activeNode;
  const isHighlighted = !hasActiveFilter || highlightedIds.has(node.id);
  const opacity = isHighlighted ? 1.0 : 0.12;
  const transparent = opacity < 1.0;

  const material = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.15,
    metalness: 0.85,
    emissive: color,
    emissiveIntensity: isHighlighted ? 0.25 : 0.02,
    opacity: opacity,
    transparent: transparent,
  });

  return new THREE.Mesh(geometry, material);
}

export default function Neo4jExplorer() {
  const fgRef = useRef();

  // Neo4j Status States
  const [dbStatus, setDbStatus] = useState("checking");
  const [dbStats, setDbStats] = useState({ nodes: 0, relationships: 0 });
  const [credentials, setCredentials] = useState({
    uri: "bolt://localhost:7687",
    username: "neo4j",
    password: "",
    database: "neo4j",
  });

  // Data States
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [isMock, setIsMock] = useState(false);
  const [isEmptyDb, setIsEmptyDb] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & Physics States
  const [visibleTypes, setVisibleTypes] = useState({
    user: true,
    session: true,
    beneficiary: true,
    transaction: false, // OFF by default to avoid clutter
    ipaddress: false,   // OFF by default to avoid clutter
    device: false,      // OFF by default to avoid clutter
  });
  const [physics, setPhysics] = useState({
    linkDistance: 90,
    repulsionCharge: -300,
  });

  // Search & Interaction States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [isolatedNodeId, setIsolatedNodeId] = useState(null); // Node double-click isolation
  const [autoOrbit, setAutoOrbit] = useState(true);

  // Cypher Console & Side Drawer
  const [cypherQuery, setCypherQuery] = useState(
    "MATCH (n)\nOPTIONAL MATCH (n)-[r]->(m)\nRETURN n, r, m\nLIMIT 150"
  );
  const [queryError, setQueryError] = useState("");
  const [queryLoading, setQueryLoading] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  // Load backend details
  useEffect(() => {
    checkConnection();
    loadGraph();
  }, []);

  // Update Force graph layout when physics properties change
  useEffect(() => {
    if (fgRef.current) {
      const linkForce = fgRef.current.d3Force("link");
      if (linkForce) linkForce.distance(physics.linkDistance);
      
      const chargeForce = fgRef.current.d3Force("charge");
      if (chargeForce) chargeForce.strength(physics.repulsionCharge);
      
      fgRef.current.d3ReheatSimulation();
    }
  }, [physics.linkDistance, physics.repulsionCharge]);

  // Handle auto-orbiting camera rotation
  useEffect(() => {
    if (!autoOrbit) return;
    let angle = 0;
    const distance = 420;
    const timer = setInterval(() => {
      if (fgRef.current) {
        angle += 0.003;
        fgRef.current.cameraPosition({
          x: distance * Math.sin(angle),
          z: distance * Math.cos(angle),
        });
      }
    }, 30);
    return () => clearInterval(timer);
  }, [autoOrbit]);

  async function checkConnection() {
    try {
      const res = await getNeo4jStatus();
      setDbStatus(res.status);
      if (res.status === "online") {
        setDbStats({ nodes: res.nodes, relationships: res.relationships });
        setCredentials({
          uri: res.uri,
          username: res.username,
          password: "",
          database: res.database || "neo4j",
        });
      }
    } catch {
      setDbStatus("offline");
    }
  }

  async function loadGraph() {
    setLoading(true);
    setError("");
    try {
      const res = await getNeo4jGraph();
      setGraphData({ nodes: res.nodes, links: res.links });
      setIsMock(!!res.is_mock);
      setIsEmptyDb(!!res.is_empty_db);
    } catch (err) {
      setError(err.message || "Failed to load graph.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveConfig(e) {
    e.preventDefault();
    setDbStatus("checking");
    try {
      await saveNeo4jConfig(credentials);
      await checkConnection();
      await loadGraph();
      setIsConfigOpen(false);
    } catch {
      setDbStatus("offline");
      alert("Failed to connect database.");
    }
  }

  async function handleSync() {
    setSyncLoading(true);
    setSyncStatus("Scheduling sync...");
    try {
      const res = await syncNeo4jDatabase();
      setSyncStatus(res.message || "Sync started in background.");
      setTimeout(async () => {
        await checkConnection();
        await loadGraph();
        setSyncLoading(false);
        setSyncStatus("");
      }, 5000);
    } catch (err) {
      setSyncStatus(`Sync failed: ${err.message}`);
      setSyncLoading(false);
    }
  }

  async function executeCypher() {
    if (!cypherQuery.trim()) return;
    setQueryLoading(true);
    setQueryError("");
    setSelectedNode(null);
    setIsolatedNodeId(null);
    try {
      const res = await runCypherQuery(cypherQuery);
      if (!res.nodes || res.nodes.length === 0) {
        setQueryError("Query returned 0 nodes.");
      } else {
        setGraphData({ nodes: res.nodes, links: res.links });
      }
    } catch (err) {
      setQueryError(err.message || "Query failed.");
    } finally {
      setQueryLoading(false);
    }
  }

  // Stable cloned graph data to prevent D3 in-place layout crashes on data-structure updates
  const cleanGraphData = useMemo(() => {
    return {
      nodes: graphData.nodes.map((n) => ({ ...n })),
      links: graphData.links.map((l) => ({
        ...l,
        source: typeof l.source === "object" ? l.source.id : l.source,
        target: typeof l.target === "object" ? l.target.id : l.target,
      })),
    };
  }, [graphData]);

  // Fast ID-to-Type map lookup
  const nodeTypeMap = useMemo(() => {
    const map = new Map();
    graphData.nodes.forEach((n) => map.set(n.id, n.type));
    return map;
  }, [graphData.nodes]);

  // Node visibility validation helper
  const isNodeVisible = (node) => {
    if (!node) return false;
    if (isolatedNodeId) {
      const neighbors = new Set([isolatedNodeId]);
      graphData.links.forEach((link) => {
        const src = typeof link.source === "object" ? link.source.id : link.source;
        const tgt = typeof link.target === "object" ? link.target.id : link.target;
        if (src === isolatedNodeId) neighbors.add(tgt);
        if (tgt === isolatedNodeId) neighbors.add(src);
      });
      return node.id === isolatedNodeId || neighbors.has(node.id);
    }
    return visibleTypes[node.type];
  };

  // Link visibility validation helper
  const isLinkVisible = (link) => {
    if (!link) return false;
    const src = typeof link.source === "object" ? link.source.id : link.source;
    const tgt = typeof link.target === "object" ? link.target.id : link.target;

    const srcType = nodeTypeMap.get(src);
    const tgtType = nodeTypeMap.get(tgt);

    if (isolatedNodeId) {
      const neighbors = new Set([isolatedNodeId]);
      graphData.links.forEach((l) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        if (s === isolatedNodeId) neighbors.add(t);
        if (t === isolatedNodeId) neighbors.add(s);
      });
      const isSrcOk = src === isolatedNodeId || neighbors.has(src);
      const isTgtOk = tgt === isolatedNodeId || neighbors.has(tgt);
      return isSrcOk && isTgtOk;
    }

    return visibleTypes[srcType] && visibleTypes[tgtType];
  };

  // Highlighting Maps
  const highlightedIds = useMemo(() => {
    const active = selectedNode || hoveredNode;
    if (!active) return new Set();

    const ids = new Set([active.id]);
    graphData.links.forEach((link) => {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      if (src === active.id) ids.add(tgt);
      if (tgt === active.id) ids.add(src);
    });
    return ids;
  }, [selectedNode, hoveredNode, graphData.links]);

  const activeNode = selectedNode || hoveredNode;

  // Search Submit Handler
  function handleSearchSubmit(e) {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const matched = graphData.nodes.find((n) =>
      n.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (matched) {
      setSelectedNode(matched);
      if (fgRef.current) {
        const zoomDist = 80;
        const ratio = 1 + zoomDist / Math.hypot(matched.x || 0, matched.y || 0, matched.z || 0);
        fgRef.current.cameraPosition(
          { x: (matched.x || 0) * ratio, y: (matched.y || 0) * ratio, z: (matched.z || 0) * ratio },
          matched,
          1500
        );
      }
    } else {
      alert("No matching node found.");
    }
  }

  // Reset all filters and camera views
  function handleResetFilters() {
    setIsolatedNodeId(null);
    setSelectedNode(null);
    setSearchQuery("");
    setVisibleTypes({
      user: true,
      session: true,
      beneficiary: true,
      transaction: false,
      ipaddress: false,
      device: false,
    });
    if (fgRef.current) {
      fgRef.current.zoomToFit(800);
    }
  }

  // Node tooltips
  const nodeLabelHTML = (node) => {
    const riskField = node.risk_score
      ? `<div>Risk Rating: <span class="text-amber font-mono font-bold">${node.risk_score.toFixed(1)}/100</span></div>`
      : "";
    const quantumField = node.quantum_risk_level
      ? `<div>Post-Quantum Risk: <span class="text-purple-400 font-mono font-bold">${node.quantum_risk_level}</span></div>`
      : "";
    const amountField = node.amount
      ? `<div>Transacted: <span class="text-emerald-400 font-mono">INR ${node.amount.toLocaleString()}</span></div>`
      : "";
    const compromiseAlert = node.is_compromised
      ? `<div class="text-[#ff4a4a] font-bold mt-1 text-[10px]">⚠️ ATTACK VECTOR INDICATOR</div>`
      : "";

    return `
      <div style="
        background: rgba(20, 26, 33, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 4px;
        padding: 10px;
        color: #e6edf3;
        font-family: monospace;
        font-size: 11px;
        pointer-events: none;
        max-width: 260px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.6);
      ">
        <strong style="color: #e8a33d; text-transform: uppercase;">${node.type}: ${node.id}</strong>
        <div style="border-bottom: 1px solid rgba(255, 255, 255, 0.08); margin: 6px 0;"></div>
        ${riskField}
        ${quantumField}
        ${amountField}
        ${node.explanation ? `<div style="color:#a855f7; margin-top:2px;">Alert: ${node.explanation}</div>` : ""}
        ${node.channel ? `<div>Portal: ${node.channel}</div>` : ""}
        ${compromiseAlert}
      </div>
    `;
  };

  return (
    <div className="space-y-4">
      {/* Sleek Top Banner */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="soc-label">Threat intelligence Graph</div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            Neo4j 3D Graph Console
          </h1>
          <p className="max-w-3xl text-xs text-muted">
            Double-click a node to isolate its relationships. Hover over connections to trace transactions. 
            Default settings hide IP/Device endpoints to prevent visual congestion.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setIsConfigOpen(true)} className="soc-button text-xs py-1.5 flex items-center gap-1.5">
            <span>⚙️</span> DB Settings
          </button>
          <button onClick={handleResetFilters} className="soc-button text-xs py-1.5 text-amber hover:bg-amber/5 font-mono">
            🔄 Reset View
          </button>
        </div>
      </div>

      {isMock && (
        <div className="border-l-2 border-amber bg-panel/60 backdrop-blur px-4 py-2 text-[11px] text-muted font-mono flex items-center justify-between">
          <span>⚠️ DB OFFLINE. Running locally on cached telemetry. Start Neo4j Desktop to enable Cypher Console.</span>
          <button onClick={() => setIsConfigOpen(true)} className="text-amber font-bold hover:underline">Link database</button>
        </div>
      )}

      {/* Main 3D Canvas Sandbox Area */}
      <div className="relative soc-panel w-full h-[620px] bg-[#070a0e] overflow-hidden">
        
        {/* Full-width 3D Canvas rendering */}
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted font-mono animate-pulse gap-2">
            <div className="h-6 w-6 border-2 border-amber border-t-transparent rounded-full animate-spin"></div>
            Spacial Force-Directed Node Optimization...
          </div>
        ) : (
          <div className="w-full h-full">
            <ForceGraph3D
              ref={fgRef}
              graphData={cleanGraphData}
              nodeVisibility={isNodeVisible}
              linkVisibility={isLinkVisible}
              onEngineInit={() => {
                if (fgRef.current) {
                  const linkForce = fgRef.current.d3Force("link");
                  if (linkForce) linkForce.distance(physics.linkDistance);
                  const chargeForce = fgRef.current.d3Force("charge");
                  if (chargeForce) chargeForce.strength(physics.repulsionCharge);
                }
              }}
              nodeThreeObject={(node) => createNodeMesh(node, highlightedIds, activeNode)}
              nodeLabel={nodeLabelHTML}
              backgroundColor="#070a0e"
              linkColor={(link) => {
                if (!activeNode) return "rgba(255,255,255,0.06)";
                const src = typeof link.source === "object" ? link.source.id : link.source;
                const tgt = typeof link.target === "object" ? link.target.id : link.target;
                return src === activeNode.id || tgt === activeNode.id
                  ? "rgba(232, 163, 61, 0.65)"
                  : "rgba(255,255,255,0.01)";
              }}
              linkWidth={(link) => {
                if (!activeNode) return 1.5;
                const src = typeof link.source === "object" ? link.source.id : link.source;
                const tgt = typeof link.target === "object" ? link.target.id : link.target;
                return src === activeNode.id || tgt === activeNode.id ? 2.5 : 0.8;
              }}
              linkDirectionalParticles={(link) => {
                if (!activeNode) return link.amount ? 3 : 1;
                const src = typeof link.source === "object" ? link.source.id : link.source;
                const tgt = typeof link.target === "object" ? link.target.id : link.target;
                return src === activeNode.id || tgt === activeNode.id ? 6 : 0;
              }}
              linkDirectionalParticleWidth={(link) =>
                link.amount ? Math.min(4, Math.max(1, link.amount / 150000)) : 1
              }
              linkDirectionalParticleSpeed={(link) =>
                link.amount ? Math.min(0.01, Math.max(0.002, link.amount / 50000000)) : 0.003
              }
              linkDirectionalParticleColor={() => "#fbbf24"}
              onNodeClick={(node) => {
                if (node && !isNodeVisible(node)) return;
                setSelectedNode(node);
                if (fgRef.current) {
                  const zoomDist = 80;
                  const ratio = 1 + zoomDist / Math.hypot(node.x, node.y, node.z);
                  fgRef.current.cameraPosition(
                    { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
                    node,
                    1500
                  );
                }
              }}
              onNodeDoubleClick={(node) => {
                if (node && !isNodeVisible(node)) return;
                // Toggle isolation mode
                if (isolatedNodeId === node.id) {
                  setIsolatedNodeId(null);
                } else {
                  setIsolatedNodeId(node.id);
                  setSelectedNode(node);
                }
              }}
              onNodeHover={(node) => {
                if (node && !isNodeVisible(node)) return;
                setHoveredNode(node);
              }}
              width={1400}
              height={620}
            />
          </div>
        )}

        {/* OVERLAY 1: Top Center Filter Pill Bar (Frosted Glass) */}
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 flex gap-2 bg-[#141a21]/80 backdrop-blur-md border border-borderStrong p-1.5 rounded shadow-lg">
          {Object.keys(visibleTypes).map((type) => {
            const labelMap = {
              user: "Users",
              session: "Sessions",
              beneficiary: "Mule Hubs",
              transaction: "Wires/Txns",
              ipaddress: "IP Addr",
              device: "Devices",
            };
            const active = visibleTypes[type];
            return (
              <button
                key={type}
                onClick={() => {
                  setVisibleTypes({ ...visibleTypes, [type]: !active });
                }}
                className={`px-3 py-1 font-mono text-[10px] font-bold uppercase transition-colors rounded ${
                  active
                    ? "bg-amber text-[#0b0f13]"
                    : "text-muted hover:text-text hover:bg-panelSoft/50"
                }`}
              >
                {labelMap[type]}
              </button>
            );
          })}
        </div>

        {/* OVERLAY 2: Top Right Search Bar */}
        <div className="absolute top-4 right-4 z-10 w-[260px]">
          <form onSubmit={handleSearchSubmit} className="flex bg-[#141a21]/90 backdrop-blur border border-borderStrong rounded shadow-lg overflow-hidden">
            <input
              type="text"
              placeholder="Search User / Session ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent px-3 py-1.5 text-xs text-text focus:outline-none placeholder:text-muted/40 font-mono"
            />
            <button type="submit" className="px-3 border-l border-borderStrong text-xs text-muted hover:text-amber font-mono">
              Find
            </button>
          </form>
        </div>

        {/* OVERLAY 3: Floating Left Physics & Controller Panel */}
        <div className="absolute top-4 left-4 z-10 w-[240px] bg-[#141a21]/85 backdrop-blur border border-borderStrong p-4 rounded shadow-lg space-y-4 font-mono">
          <div className="text-[10px] uppercase font-bold text-amber tracking-wider border-b border-borderStrong pb-1 flex justify-between items-center">
            <span>Graph Config</span>
            {isolatedNodeId && <span className="text-[#ff4a4a]">ISOLATED</span>}
          </div>
          
          <div className="space-y-3 text-[10px]">
            {/* Spacing Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-muted">
                <span>Node Spacing</span>
                <span className="text-text">{physics.linkDistance}px</span>
              </div>
              <input
                type="range"
                min="40"
                max="220"
                value={physics.linkDistance}
                onChange={(e) => setPhysics({ ...physics, linkDistance: parseInt(e.target.value) })}
                className="w-full accent-amber"
              />
            </div>

            {/* Repulsion Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-muted">
                <span>Repulsion Force</span>
                <span className="text-text">{Math.abs(physics.repulsionCharge)}</span>
              </div>
              <input
                type="range"
                min="-600"
                max="-100"
                value={physics.repulsionCharge}
                onChange={(e) => setPhysics({ ...physics, repulsionCharge: parseInt(e.target.value) })}
                className="w-full accent-amber"
              />
            </div>
            
            {/* Rotation toggle */}
            <div className="flex justify-between items-center pt-2">
              <span className="text-muted">Auto Orbit</span>
              <button
                onClick={() => setAutoOrbit(!autoOrbit)}
                className={`px-2 py-0.5 border text-[9px] uppercase font-bold ${
                  autoOrbit ? "border-amber text-amber bg-amber/5" : "border-borderStrong text-muted"
                }`}
              >
                {autoOrbit ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <div className="text-[9px] text-muted leading-relaxed">
            💡 Adjust gravity sliders to expand graph nodes and declutter spacing. Double-click any node to center.
          </div>
        </div>

        {/* OVERLAY 4: Floating Right Detail Inspector */}
        <div className="absolute right-4 bottom-4 top-[64px] z-10 w-[300px] bg-[#141a21]/90 backdrop-blur-md border border-borderStrong p-5 rounded shadow-drawer flex flex-col justify-between overflow-y-auto">
          {activeNode ? (
            <div className="space-y-4">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber font-mono">
                  {activeNode.type} Details
                </span>
                <h3 className="font-mono text-sm font-bold text-text truncate mt-0.5">
                  {activeNode.id}
                </h3>
              </div>

              <div className="border-t border-borderStrong pt-4 space-y-3 font-mono text-xs">
                {activeNode.risk_score !== undefined && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-base border border-border px-2.5 py-1.5">
                      <span className="text-[9px] uppercase text-muted block">Risk Score</span>
                      <span className="font-bold text-amber">{activeNode.risk_score.toFixed(1)}</span>
                    </div>
                    <div className="bg-base border border-border px-2.5 py-1.5">
                      <span className="text-[9px] uppercase text-muted block">Risk Tier</span>
                      <span className="font-bold text-text">{activeNode.risk_level || "Low"}</span>
                    </div>
                  </div>
                )}

                {activeNode.type === "user" && (
                  <div className="bg-base border border-border px-3 py-2 space-y-1">
                    <span className="text-[9px] uppercase text-muted block">Status</span>
                    <strong className={activeNode.is_compromised ? "text-[#ff4a4a]" : "text-emerald-400"}>
                      {activeNode.is_compromised ? "⚠️ COMPROMISED IDENT" : "🟢 VERIFIED SENDER"}
                    </strong>
                  </div>
                )}

                {activeNode.type === "session" && (
                  <div className="space-y-2">
                    <div className="bg-base border border-border px-3 py-2 space-y-1 text-[11px] leading-relaxed">
                      <span className="text-[9px] uppercase text-muted block">Explainer</span>
                      <div>{activeNode.explanation}</div>
                    </div>
                    <div className="bg-base border border-border px-3 py-1.5 flex justify-between items-center text-[11px]">
                      <span className="text-[9px] uppercase text-muted">Quantum Risk:</span>
                      <strong className="text-purple-400">{activeNode.quantum_risk_level}</strong>
                    </div>
                    <div className="bg-base border border-border px-3 py-2 text-[10px] space-y-1 text-muted">
                      <div>Failed Logins: {activeNode.failed_login_count}</div>
                      <div>Device change: {activeNode.device_changed ? "Yes" : "No"}</div>
                      <div>Travel alert: {activeNode.geo_velocity_flag ? "High" : "No"}</div>
                    </div>
                  </div>
                )}

                {activeNode.type === "transaction" && (
                  <div className="space-y-2">
                    <div className="bg-base border border-border px-3 py-2">
                      <span className="text-[9px] uppercase text-muted block">Amount</span>
                      <strong className="text-emerald-400 text-sm">INR {activeNode.amount.toLocaleString()}</strong>
                    </div>
                    <div className="bg-base border border-border px-3 py-2 text-[10px] space-y-0.5 text-muted">
                      <div>Channel: {activeNode.channel}</div>
                      <div>Category: {activeNode.merchant_category}</div>
                      <div className="truncate">Timestamp: {activeNode.timestamp}</div>
                    </div>
                  </div>
                )}

                {activeNode.type === "beneficiary" && (
                  <div className="space-y-2">
                    <div className="bg-base border border-border px-3 py-2">
                      <span className="text-[9px] uppercase text-muted block">Total Received</span>
                      <strong className="text-emerald-400 text-sm">INR {(activeNode.total_received || 0).toLocaleString()}</strong>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-muted">
                      <div className="bg-base border border-border px-2.5 py-1.5">
                        <span>Wires: {activeNode.txn_count || 0}</span>
                      </div>
                      <div className="bg-base border border-border px-2.5 py-1.5">
                        <span>Wallet: {activeNode.is_new ? "NEW" : "OLD"}</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeNode.type === "ipaddress" && (
                  <div className="bg-base border border-border px-3 py-2">
                    <span className="text-[9px] uppercase text-muted block">Host Node IP</span>
                    <strong className="text-text">{activeNode.value}</strong>
                  </div>
                )}

                {activeNode.type === "device" && (
                  <div className="bg-base border border-border px-3 py-2">
                    <span className="text-[9px] uppercase text-muted block">Device Signature</span>
                    <strong className="text-text text-[10px] block truncate">{activeNode.id}</strong>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center text-xs text-muted font-mono my-auto py-8">
              🔍 Left-click node to inspect attributes.<br/><br/>
              🔍 Double-click to isolate neighbor connections.
            </div>
          )}

          {/* Footer Stats summary in overlay */}
          <div className="border-t border-borderStrong pt-4 mt-4 space-y-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted font-mono block">Database Stats</span>
            <div className="grid grid-cols-3 gap-1 bg-base border border-border p-1 rounded font-mono text-[10px] text-center">
              <div>
                <span className="text-muted block text-[8px]">DB</span>
                <span className={`font-bold ${dbStatus === "online" ? "text-emerald-400" : "text-riskHigh"}`}>{dbStatus}</span>
              </div>
              <div>
                <span className="text-muted block text-[8px]">Nodes</span>
                <span className="text-text font-bold">{cleanGraphData.nodes.filter(isNodeVisible).length}</span>
              </div>
              <div>
                <span className="text-muted block text-[8px]">Links</span>
                <span className="text-text font-bold">{cleanGraphData.links.filter(isLinkVisible).length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* OVERLAY 5: Sliding Bottom Center Cypher Console (Frosted Glass) */}
        <div className="absolute bottom-4 left-4 right-[320px] z-10 bg-[#141a21]/90 backdrop-blur-md border border-borderStrong p-3.5 rounded shadow-lg space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber font-mono">Cypher Query console</span>
            {!isMock && (
              <div className="flex gap-1">
                <button
                  onClick={() => setCypherQuery("MATCH (n:User)-[r]->(s:Session) RETURN n,r,s LIMIT 60")}
                  className="text-[9px] border border-borderStrong hover:border-amber px-2 py-0.5 font-mono text-muted uppercase"
                >
                  Logins
                </button>
                <button
                  onClick={() => setCypherQuery("MATCH (t:Transaction)-[r]->(b:Beneficiary) RETURN t,r,b LIMIT 80")}
                  className="text-[9px] border border-borderStrong hover:border-amber px-2 py-0.5 font-mono text-muted uppercase"
                >
                  Mules
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <textarea
              value={cypherQuery}
              onChange={(e) => setCypherQuery(e.target.value)}
              disabled={isMock || queryLoading}
              className="flex-1 font-mono text-[11px] bg-[#0b0f13] border border-borderStrong p-2 text-text rounded focus:outline-none focus:border-amber placeholder:text-muted/30 resize-none h-[42px]"
              placeholder={isMock ? "Start database in Neo4j Desktop to run queries..." : "Write Cypher query..."}
            />
            <button
              onClick={executeCypher}
              disabled={isMock || queryLoading || !cypherQuery.trim()}
              className="soc-button-primary uppercase font-bold text-[10px] tracking-wider px-3.5 flex items-center justify-center shrink-0 disabled:opacity-40"
            >
              {queryLoading ? "..." : "Execute"}
            </button>
          </div>
          {queryError && <div className="text-[10px] text-riskHigh font-mono">{queryError}</div>}
        </div>
      </div>

      {/* Setup Config Sliding Drawer Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm">
          <div className="h-full w-full max-w-[400px] border-l border-borderStrong bg-panel shadow-drawer p-6 flex flex-col justify-between overflow-y-auto reveal">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-md font-bold text-text uppercase tracking-wider font-mono">Database Settings</h2>
                <button
                  onClick={() => setIsConfigOpen(false)}
                  className="text-muted hover:text-text font-bold text-md font-mono"
                >
                  ✕
                </button>
              </div>

              <div className="border border-border bg-panelSoft p-4 rounded text-[11px] space-y-1.5 text-muted font-mono leading-relaxed">
                <div className="font-bold text-amber">NEO4J DESKTOP SETUP:</div>
                <div>1. Ensure local DBMS is <span className="text-emerald-400">Started</span>.</div>
                <div>2. default URI: <code className="text-text">bolt://localhost:7687</code>.</div>
                <div>3. Enter the database password configured in Neo4j Desktop.</div>
                <div>4. Click **Sync Database** to rebuild records.</div>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-muted font-mono">Bolt URI</label>
                  <input
                    type="text"
                    required
                    value={credentials.uri}
                    onChange={(e) => setCredentials({ ...credentials, uri: e.target.value })}
                    className="w-full bg-[#0b0f13] border border-borderStrong p-2 text-xs font-mono text-text focus:outline-none focus:border-amber rounded"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-muted font-mono">Username</label>
                  <input
                    type="text"
                    required
                    value={credentials.username}
                    onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                    className="w-full bg-[#0b0f13] border border-borderStrong p-2 text-xs font-mono text-text focus:outline-none focus:border-amber rounded"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-muted font-mono">Database Name</label>
                  <input
                    type="text"
                    required
                    value={credentials.database}
                    onChange={(e) => setCredentials({ ...credentials, database: e.target.value })}
                    className="w-full bg-[#0b0f13] border border-borderStrong p-2 text-xs font-mono text-text focus:outline-none focus:border-amber rounded"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-muted font-mono">Password</label>
                  <input
                    type="password"
                    placeholder="Enter database password"
                    value={credentials.password}
                    onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                    className="w-full bg-[#0b0f13] border border-borderStrong p-2 text-xs font-mono text-text focus:outline-none focus:border-amber rounded"
                  />
                </div>
                <button
                  type="submit"
                  className="soc-button-primary w-full uppercase font-bold text-xs tracking-wider py-2"
                >
                  Link DBMS Server
                </button>
              </form>

              {dbStatus === "online" && (
                <div className="border-t border-borderStrong pt-6 space-y-4 font-mono">
                  <div>
                    <h3 className="text-xs uppercase font-bold text-text">Import & Sync</h3>
                    <p className="text-[10px] text-muted mt-1 leading-relaxed">
                      Rebuild telemetry graphs by converting CyberPulse datasets into nodes/edges.
                    </p>
                  </div>
                  <button
                    onClick={handleSync}
                    disabled={syncLoading}
                    className="soc-button w-full text-xs py-2 uppercase border-amber text-amber hover:bg-amber/5 font-bold disabled:opacity-50"
                  >
                    {syncLoading ? "Importing..." : "Sync Database"}
                  </button>
                  {syncStatus && <div className="text-[10px] text-amber text-center">{syncStatus}</div>}
                </div>
              )}
            </div>

            <div className="text-[9px] font-mono text-muted text-center pt-8">
              CyberPulse Console v0.1.0 • Neo4j Driver Client
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
