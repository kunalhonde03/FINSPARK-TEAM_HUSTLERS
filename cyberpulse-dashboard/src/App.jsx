import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import PulseHeader from "./components/PulseHeader.jsx";
import { getHealth, getStats } from "./api/client.js";
import Overview from "./pages/Overview.jsx";
import UserTimeline from "./pages/UserTimeline.jsx";
import Simulate from "./pages/Simulate.jsx";
import QuantumRoadmap from "./pages/QuantumRoadmap.jsx";

export default function App() {
  const [backendStatus, setBackendStatus] = useState("checking");
  const [headerStats, setHeaderStats] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  useEffect(() => {
    let alive = true;

    async function checkBackend() {
      try {
        await getHealth();
        const stats = await getStats();
        if (!alive) return;
        setHeaderStats(stats);
        setBackendStatus("online");
        setLastChecked(new Date());
      } catch {
        if (!alive) return;
        setBackendStatus("offline");
        setLastChecked(new Date());
      }
    }

    checkBackend();
    const timer = window.setInterval(checkBackend, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-base text-text">
      <PulseHeader status={backendStatus} stats={headerStats} lastChecked={lastChecked} />
      <main className="mx-auto w-full max-w-[1560px] px-4 pb-8 pt-4 lg:px-6">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/user/:id" element={<UserTimeline />} />
          <Route path="/simulate" element={<Simulate />} />
          <Route path="/quantum-roadmap" element={<QuantumRoadmap />} />
        </Routes>
      </main>
    </div>
  );
}
