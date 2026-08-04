/**
 * Verifies every colour pairing the brand guide claims is accessible.
 *
 *   node brand/contrast.mjs        → table
 *   node brand/contrast.mjs --ci   → exits 1 if any required pairing fails
 *
 * A style guide that asserts "AA compliant" without a check is a style guide
 * that is wrong within two months of someone nudging a hex value.
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { color } from "./tokens.mjs";

const srgb = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
};
const lum = (hex) => {
  const [r, g, b] = srgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const W = color.neutral[0];
const N9 = color.navy[900];
const N95 = color.navy[950];

/** [label, fg, bg, minimum required] */
const PAIRS = [
  ["Body text on white", N9, W, 4.5],
  ["Secondary text on white", color.neutral[500], W, 4.5],
  ["Metadata / source line on white", color.neutral[600], W, 4.5],
  // blue-500 is the brand accent and measures 3.81:1 on white — fine for
  // graphics, short of AA for body-size text. It is therefore never used for
  // text on white; blue-600 is the text cut. The accent is not "wrong", it is
  // scoped. See BRAND-GUIDE.md → "Where the accent is allowed".
  ["Link / inline text (blue-600) on white", color.blue[600], W, 4.5],
  ["Link hover (blue-700) on white", color.blue[700], W, 4.5],
  ["Eyebrow (blue-600) on white", color.blue[600], W, 4.5],
  ["White on navy-900", W, N9, 4.5],
  ["White on navy-950", W, N95, 4.5],
  ["blue-200 on navy-900 (tagline)", color.blue[200], N9, 4.5],
  ["blue-300 on navy-900", color.blue[300], N9, 4.5],
  ["blue-400 on navy-900 (small marks)", color.blue[400], N9, 3.0],
  ["Live status text on white", color.status.liveInk, W, 4.5],
  ["Stale status text on white", color.status.stale, W, 4.5],
  ["Archive status text on white", color.neutral[600], W, 4.5],
  ["Navy-900 on blue-50", N9, color.blue[50], 4.5],
  ["blue-800 on blue-50 (delta chip)", color.blue[800], color.blue[50], 4.5],
];

/** Non-text UI: borders, chart marks, icon strokes. WCAG 1.4.11 → 3:1. */
const GRAPHIC = [
  ["Accent arc (blue-500) on white", color.blue[500], W, 3.0],
  ["Accent arc (blue-400) on navy-900", color.blue[400], N9, 3.0],
  ["Ring (neutral-300) on white", color.neutral[300], W, 1.5],
  ...color.series.map((c, i) => [`Chart series ${i + 1} on white`, c, W, 3.0]),
  ...color.seriesDark.map((c, i) => [
    `Chart series ${i + 1} on navy-900`,
    c,
    N9,
    3.0,
  ]),
];

export function report() {
  let failed = 0;
  const rows = [];
  for (const [label, fg, bg, min] of [...PAIRS, ...GRAPHIC]) {
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) failed++;
    rows.push(
      `${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(6)}:1  (min ${min})  ${label}  ${fg} on ${bg}`
    );
  }
  return { rows, failed, total: rows.length };
}

// Only print when run directly — guide.mjs imports `ratio` from this module and
// should not get a contrast table dumped into its output as a side effect.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { rows, failed, total } = report();
  console.log(rows.join("\n"));
  console.log(
    `\n${total - failed}/${total} pairings pass.` +
      (failed ? `  ${failed} FAILING.` : "")
  );
  if (failed && process.argv.includes("--ci")) process.exit(1);
}
