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

export function getAlerts({ minRisk = 0, limit = 1000 } = {}) {
  return request("/alerts", {
    params: {
      min_risk: minRisk,
      limit,
    },
  });
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

