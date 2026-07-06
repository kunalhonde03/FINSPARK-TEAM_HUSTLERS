/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0B0F13",
        panel: "#141A21",
        panelSoft: "#18212A",
        border: "rgba(255,255,255,0.08)",
        borderStrong: "rgba(255,255,255,0.16)",
        muted: "#8A96A3",
        text: "#E6EDF3",
        amber: "#E8A33D",
        riskLow: "#3EB489",
        riskMedium: "#E8A33D",
        riskHigh: "#D64545",
        steel: "#23303B",
      },
      fontFamily: {
        sans: ["Inter", "IBM Plex Sans", "Segoe UI", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "IBM Plex Mono", "Consolas", "monospace"],
      },
      boxShadow: {
        drawer: "-18px 0 60px rgba(0,0,0,0.45)",
      },
      keyframes: {
        pulseTrace: {
          "0%": { transform: "translateX(-42%)" },
          "100%": { transform: "translateX(42%)" },
        },
        reveal: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseTrace: "pulseTrace var(--pulse-speed, 2.8s) linear infinite",
        reveal: "reveal 360ms ease-out both",
      },
    },
  },
  plugins: [],
};
