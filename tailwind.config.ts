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
        // ACCESSIBILITY OVERRIDE — do not revert to Tailwind's default #64748b.
        //
        // `text-slate-500` is used across the platform for the secondary text
        // that carries our most important trust signals: source names, "data
        // through" dates, freshness labels, and limitations. Tailwind's default
        // slate-500 measures 4.23:1 on ink-950 and 3.85:1 on ink-850 — below the
        // WCAG AA 4.5:1 threshold for body text. Information a reader needs in
        // order to judge whether to believe a figure must not be the least
        // legible thing on the page.
        //
        // This value measures 6.90:1 on ink-950 and 6.28:1 on ink-850. Every
        // other colour in this palette already passes AA against both surfaces.
        slate: {
          500: "#8b98ad",
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
