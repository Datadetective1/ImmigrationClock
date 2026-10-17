// =============================================================================
// THEME TOKENS — dark unchanged, light legible, light only behind the flag
//
// Every palette class (ink-*, white, slate-*, accent, status-*) now reads a CSS
// variable from globals.css. These tests pin the dark values to the site as it
// always looked, require WCAG AA for text in the light theme, and require that
// light applies only under <html data-theme="auto"> (FEATURE_UX_V2).
// =============================================================================

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { flagOn } from "@/lib/flags";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function block(selectorStart: string): Record<string, number[]> {
  const at = css.indexOf(selectorStart);
  expect(at, selectorStart).toBeGreaterThan(-1);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  const vars: Record<string, number[]> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(\d+) (\d+) (\d+);/g)) vars[m[1]] = [+m[2], +m[3], +m[4]];
  return vars;
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("dark: the site as it has always looked", () => {
  const dark = block(":root,\n:root[data-theme=\"auto\"] {");
  it("keeps the original palette", () => {
    const original: Record<string, string> = {
      "ink-950": "#05070d", "ink-900": "#0a0e1a", "ink-850": "#0f1424", "ink-800": "#141a2e", "ink-700": "#1c2440", "ink-600": "#27304f",
      contrast: "#ffffff", "slate-500": "#8b98ad", accent: "#38bdf8", "accent-soft": "#7dd3fc",
      "status-red": "#f43f5e", "status-amber": "#f59e0b", "status-green": "#22c55e",
    };
    for (const [k, h] of Object.entries(original)) expect(dark[k], k).toEqual(hex(h));
  });
});

describe("light: legible, and only behind the flag", () => {
  const light = block("@media (prefers-color-scheme: light)");

  it("applies only to <html data-theme=\"auto\">", () => {
    const media = css.slice(css.indexOf("@media (prefers-color-scheme: light)"));
    expect(media.slice(0, 120)).toMatch(/:root\[data-theme="auto"\]/);
    expect(flagOn("ux_v2", {})).toBe(false);
    expect(flagOn("ux_v2", { FEATURE_UX_V2: "true" })).toBe(true);
    expect(readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8")).toMatch(/data-theme=\{themed \? "auto" : undefined\}/);
  });

  it("meets WCAG AA (4.5:1) for text on the page and on panels", () => {
    for (const surface of ["ink-950", "ink-850"]) {
      for (const text of ["contrast", "slate-100", "slate-200", "slate-300", "slate-400", "slate-500", "accent", "accent-soft", "status-red", "status-amber", "status-green", "fuchsia-300"]) {
        expect(contrast(light[text], light[surface]), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps button text on the accent legible", () => {
    // bg-accent text-ink-950 is the site's primary button.
    expect(contrast(light["ink-950"], light.accent)).toBeGreaterThanOrEqual(4.5);
  });
});
