/**
 * ImmigrationClock — brand tokens.
 *
 * Single source of truth for the identity. `build.mjs` generates every logo,
 * banner, favicon, icon and social template from these values, so a colour is
 * changed in exactly one place and the whole system follows.
 *
 * The product dashboard is dark (see tailwind.config.ts `ink` palette). This
 * file describes the *brand* surface — white-background, navy-forward, used for
 * logos, social, email, decks and documentation. The two are reconciled in
 * BRAND-GUIDE.md under "Two surfaces, one system".
 */

export const color = {
  // ── Core ────────────────────────────────────────────────────────────────
  navy: {
    950: "#0A1B2D", // deepest — banner gradients, full-bleed panels
    900: "#102A43", // PRIMARY. Headlines, wordmark, logo container.
    800: "#1B3A57",
    700: "#274D6E",
    600: "#35648C",
    500: "#4A7FA8",
  },

  // ── Accent (the "signal" ramp) ──────────────────────────────────────────
  // 500 is the specified accent. 400 exists because 500 only reaches 3.84:1 on
  // navy-900 — it is not safe for small marks or text on dark. Use 400 there.
  blue: {
    900: "#062B69",
    800: "#0B3D91",
    700: "#1560D8",
    600: "#2470F0",
    500: "#2D7FF9", // ACCENT. Links, active state, primary arc on light.
    400: "#5B9DFF", // accent for dark surfaces (5.37:1 on navy-900)
    300: "#8FBDFF",
    200: "#BBD7FF",
    100: "#D9E8FF",
    50: "#EFF5FF",
  },

  // ── Neutrals (cool, navy-tinted — never pure grey) ──────────────────────
  neutral: {
    0: "#FFFFFF", // BACKGROUND
    50: "#F7F9FC",
    100: "#EEF2F7",
    200: "#DEE5EE",
    300: "#C6D0DD",
    400: "#9AA8BB",
    // 500 is the darkest grey that still reads as "secondary". It was #6B7A91
    // until brand/contrast.mjs measured that at 4.36:1 — under AA. Source
    // names and "data through" dates are set in this colour, and the text a
    // reader needs in order to judge a number must not be the least legible
    // thing on the page. Same reasoning as the slate-500 override in
    // tailwind.config.ts.
    500: "#68778D", // secondary text — 4.55:1 on white
    600: "#51617A", // metadata, source lines — 6.29:1 on white
    700: "#3B4C63",
    900: "#102A43", // = navy-900, body text on white
  },

  // ── Status. Freshness of DATA ONLY — never "good/bad" about immigration ──
  status: {
    live: "#0E9F6E", // updating on schedule
    liveInk: "#046C4E", // text-safe version of the above on white
    stale: "#B45309", // past its expected refresh
    archive: "#6B7A91", // point-in-time / no longer updated
  },

  // ── Categorical series for charts. Direction-neutral by design. ─────────
  //
  // Six hues, used strictly in order. Past four series a legend stops working
  // and the answer is small multiples, not a seventh colour.
  //
  // These encode *identity* (which country, which employer), never *direction*.
  // Nothing here means good or bad. See BRAND-GUIDE.md → "The colour rule".
  series: [
    "#102A43", // navy
    "#2D7FF9", // blue
    "#00A0A0", // teal
    "#7B61FF", // indigo
    "#C77700", // amber
    "#C2255C", // rose — replaced #8FBDFF, which measured 1.93:1 on white
  ],

  // The same six for dark surfaces. The light-surface set is unusable on navy
  // (#102A43 on #102A43 is a joke), so the dashboard gets its own tints. Every
  // one of these clears 5:1 on navy-900 and on the product's ink-950.
  seriesDark: [
    "#C6D0DD",
    "#5B9DFF",
    "#34D3C4",
    "#A78BFA",
    "#F0A93B",
    "#FF7CA3",
  ],
};

export const font = {
  // Resolved at render time. Inter first; Segoe UI Variable / SF are the
  // closest system substitutes, so unbranded fallback stays on-tone.
  sans: "Inter, 'Inter Tight', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, Consolas, monospace",
};

/** Tagline — locked wording. The bullet is U+2022 with hair spaces around it. */
export const TAGLINE = "Facts First • Sources Included";
export const NAME = "ImmigrationClock";
export const DOMAIN = "immigrationclock.com";
