import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dashboard surface palette (dark, US-Debt-Clock inspired but modern)
        ink: {
          950: "#05070d",
          900: "#0a0e1a",
          850: "#0f1424",
          800: "#141a2e",
          700: "#1c2440",
          600: "#27304f",
        },
        accent: {
          DEFAULT: "#38bdf8",
          soft: "#7dd3fc",
        },
        status: {
          red: "#f43f5e",
          amber: "#f59e0b",
          green: "#22c55e",
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(56,189,248,0.15), 0 8px 40px -12px rgba(56,189,248,0.25)",
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 30px -18px rgba(0,0,0,0.9)",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
