/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        base: "#070a0e",
        panel: "#0e131b",
        panelSoft: "#151c27",
        border: "rgba(255,255,255,0.05)",
        borderStrong: "rgba(255,255,255,0.12)",
        muted: "#7e8b9b",
        text: "#eef2f6",
        amber: "#ffaa22",
        riskLow: "#10b981",
        riskMedium: "#f59e0b",
        riskHigh: "#ef4444",
        steel: "#1e293b",
        cyberBlue: "#00e5ff",
        cyberPurple: "#8b5cf6",
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Inter", "sans-serif"],
        display: ["Outfit", "Space Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        drawer: "-20px 0 80px rgba(0,0,0,0.65)",
        glow: "0 0 20px rgba(255, 170, 34, 0.15)",
        glowBlue: "0 0 20px rgba(0, 229, 255, 0.15)",
      },
      keyframes: {
        pulseTrace: {
          "0%": { transform: "translateX(-42%)" },
          "100%": { transform: "translateX(42%)" },
        },
        reveal: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        pulseTrace: "pulseTrace var(--pulse-speed, 2.8s) linear infinite",
        reveal: "reveal 400ms cubic-bezier(0.16, 1, 0.3, 1) both",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
