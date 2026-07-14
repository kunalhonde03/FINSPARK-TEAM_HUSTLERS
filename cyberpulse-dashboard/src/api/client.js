import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_CYBERPULSE_API_BASE || "http://127.0.0.1:8000";

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

function readableError(error) {
  if (error.response) {
    return `Backend returned ${error.response.status}. Check the CyberPulse API process and request parameters.`;
  }
  if (error.code === "ECONNABORTED") {
    return "Backend request timed out. Confirm FastAPI is running on port 8000.";
  }
  return "Backend is not reachable. Start FastAPI with: python -m uvicorn cyberpulse.backend.main:app --host 127.0.0.1 --port 8000";
}

async function request(path, config = {}) {
  try {
    const response = await client.request({ url: path, ...config });
    return response.data;
  } catch (error) {
    const message = readableError(error);
    const wrapped = new Error(message);
    wrapped.original = error;
    throw wrapped;
  }
}

export function getHealth() {
  return request("/health");
}

export function getStats() {
  return request("/stats");
}

export function updateTriage(sessionId, status, note = "") {
  return request("/triage", {
    method: "POST",
    data: {
      session_id: sessionId,
      status,
      note,
    },
  });
}

export function getAlerts({ minRisk = 0, maxRisk = 100, quantumRiskLevel = null, userId = null, triageStatus = null, startDate = null, endDate = null, limit = 1000 } = {}) {
  return request("/alerts", {
    params: {
      min_risk: minRisk,
      max_risk: maxRisk,
      quantum_risk_level: quantumRiskLevel,
      user_id: userId,
      triage_status: triageStatus,
      start_date: startDate,
      end_date: endDate,
      limit,
    },
  });
}

export function getCryptoInventory() {
  return request("/crypto-inventory");
}

export function getUserTimeline(userId) {
  return request(`/user/${encodeURIComponent(userId)}/timeline`);
}

export function scoreSession(payload) {
  return request("/score-session", {
    method: "POST",
    data: payload,
  });
}

export function getCopilotReport(sessionId) {
  return request(`/alerts/${encodeURIComponent(sessionId)}/copilot-report`);
}

export function getPqcPlaybook(sessionId) {
  return request(`/alerts/${encodeURIComponent(sessionId)}/pqc-playbook`);
}

export function getStixExportUrl(sessionId) {
  return `${API_BASE_URL}/alerts/${encodeURIComponent(sessionId)}/stix`;
}

export function getMuleTrackerData() {
  return request("/mule-tracker");
}

export function getNeo4jStatus() {
  return request("/neo4j/status");
}

export function saveNeo4jConfig(config) {
  return request("/neo4j/config", {
    method: "POST",
    data: config,
  });
}

export function syncNeo4jDatabase() {
  return request("/neo4j/sync", {
    method: "POST",
  });
}

// ========== NOTIFICATION RULES ENDPOINTS ==========

export function listNotificationRules() {
  return request("/notification-rules");
}

export function createNotificationRule({ name, condition_type, condition_value, notification_target, enabled = true }) {
  return request("/notification-rules", {
    method: "POST",
    data: {
      name,
      condition_type,
      condition_value,
      notification_target,
      enabled,
    },
  });
}

export function deleteNotificationRule(ruleId) {
  return request(`/notification-rules/${encodeURIComponent(ruleId)}`, {
    method: "DELETE",
  });
}

export function testNotificationRule(alertPayload) {
  return request("/notification-rules/test", {
    method: "POST",
    data: alertPayload,
  });
}

// ========== MODEL METRICS ENDPOINTS ==========

export function getModelMetrics(limit = 10) {
  return request("/model/metrics", {
    params: { limit },
  });
}

export function getModelPerformance() {
  return request("/model/performance");
}

export function recordModelMetrics() {
  return request("/model/metrics/record", {
    method: "POST",
  });
}

export function getNeo4jGraph() {
  return request("/neo4j/graph");
}

export function runCypherQuery(cypherQuery) {
  return request("/neo4j/query", {
    method: "POST",
    data: { query: cypherQuery },
  });
}

export function checkDistributionDrift(shiftThreshold = 0.15) {
  return request("/model/drift-detection", {
    params: { shift_threshold: shiftThreshold },
  });
}

export function getLatestHighRiskAlerts(minRisk = 80) {
  return request("/model/alerts-stream/latest", {
    params: { min_risk: minRisk },
  });
}

// ========== WEBSOCKET ALERTS ==========

let alertWebSocket = null;

export function connectWebSocketAlerts(onMessage, onError = null) {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${window.location.host}/ws/alerts`;
  
  try {
    alertWebSocket = new WebSocket(wsUrl);
    
    alertWebSocket.onmessage = (event) => {
      try {
        const alert = JSON.parse(event.data);
        onMessage(alert);
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };
    
    alertWebSocket.onerror = (error) => {
      console.error("WebSocket error:", error);
      if (onError) onError(error);
    };
    
    alertWebSocket.onclose = () => {
      console.log("WebSocket disconnected");
      alertWebSocket = null;
    };
    
    return alertWebSocket;
  } catch (error) {
    console.error("Failed to create WebSocket:", error);
    if (onError) onError(error);
    return null;
  }
}

export function disconnectWebSocketAlerts() {
  if (alertWebSocket && alertWebSocket.readyState === WebSocket.OPEN) {
    alertWebSocket.close();
    alertWebSocket = null;
  }
}
