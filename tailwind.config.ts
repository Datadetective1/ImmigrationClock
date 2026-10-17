import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // THEME. Every colour below is a CSS variable (src/app/globals.css), so
      // the existing class names re-colour for the light theme without touching
      // a component: `ink-*` are surfaces, `white` is the contrast colour (text,
      // hairlines, overlays), `slate-*` are text greys. The dark values are the
      // site as it has always looked; light applies only with FEATURE_UX_V2.
      colors: {
        ink: {
          950: "rgb(var(--ink-950) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
          850: "rgb(var(--ink-850) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
        },
        white: "rgb(var(--contrast) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
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
          100: "rgb(var(--slate-100) / <alpha-value>)",
          200: "rgb(var(--slate-200) / <alpha-value>)",
          300: "rgb(var(--slate-300) / <alpha-value>)",
          400: "rgb(var(--slate-400) / <alpha-value>)",
          500: "rgb(var(--slate-500) / <alpha-value>)",
          600: "rgb(var(--slate-600) / <alpha-value>)",
          700: "rgb(var(--slate-700) / <alpha-value>)",
        },
        // The "legal" category colour (timeline and explainer labels).
        fuchsia: {
          300: "rgb(var(--fuchsia-300) / <alpha-value>)",
          400: "rgb(var(--fuchsia-400) / <alpha-value>)",
        },
        status: {
          red: "rgb(var(--status-red) / <alpha-value>)",
          amber: "rgb(var(--status-amber) / <alpha-value>)",
          green: "rgb(var(--status-green) / <alpha-value>)",
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "var(--shadow-glow)",
        card: "var(--shadow-card)",
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
