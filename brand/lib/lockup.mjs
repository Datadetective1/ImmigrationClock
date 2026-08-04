/**
 * Wordmark and lockups.
 *
 * The wordmark is monotone. Two-tone wordmarks ("Immigration" navy + "Clock"
 * blue) are the most common way a data brand ends up looking like a startup
 * logo generator; the accent lives in the mark and nowhere else. The one
 * sanctioned exception is the dark social lockup, where a monotone white
 * wordmark next to a white-handed dial has no colour at all.
 *
 * Tracking is -0.02em. At 700 weight that is what separates "institutional"
 * from "shouty".
 */

import { font, color } from "../tokens.mjs";
import { dial } from "./mark.mjs";

/** Approximate advance width of the wordmark, for viewBox maths only. */
export const WORDMARK_RATIO = 8.35; // width ≈ fontSize × 8.35 at -0.02em

export function wordmark({
  x = 0,
  y = 0,
  size = 30,
  fill = color.navy[900],
  weight = 700,
} = {}) {
  return `<text x="${x}" y="${y}" font-family="${font.sans}" font-size="${size}" font-weight="${weight}" letter-spacing="${(-0.02 * size).toFixed(2)}" fill="${fill}">Immigration<tspan>Clock</tspan></text>`;
}

/**
 * Horizontal lockup. Clear space is 0.5× the mark height on every side and is
 * baked into the viewBox, so anyone placing this file cannot get it wrong.
 */
export function lockupHorizontal({
  markSize = 48,
  onDark = false,
  bg = null,
} = {}) {
  const pad = markSize * 0.5;
  const gap = markSize * 0.33;
  const fontSize = markSize * 0.625;
  const textW = fontSize * WORDMARK_RATIO;
  const w = Math.round(pad * 2 + markSize + gap + textW);
  const h = Math.round(markSize + pad * 2);
  const cy = h / 2;

  const markX = pad;
  const markY = cy - markSize / 2;
  const scale = markSize / 64;

  const inner = onDark
    ? dial({
        ringColor: "rgba(255,255,255,0.30)",
        arcColor: color.blue[400],
        handColor: "#FFFFFF",
        tickColor: "rgba(255,255,255,0.42)",
      })
    : dial({
        ringColor: color.neutral[300],
        arcColor: color.blue[500],
        handColor: color.navy[900],
        tickColor: color.neutral[300],
      });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="ImmigrationClock">
  ${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ""}
  <g transform="translate(${markX} ${markY.toFixed(2)}) scale(${scale.toFixed(5)})">
    ${inner}
  </g>
  ${wordmark({
    x: markX + markSize + gap,
    y: (cy + fontSize * 0.355).toFixed(2),
    size: fontSize,
    fill: onDark ? "#FFFFFF" : color.navy[900],
  })}
</svg>
`;
}

/** Stacked lockup. For square placements and anything under ~160px wide. */
export function lockupStacked({ markSize = 72, onDark = false } = {}) {
  const pad = markSize * 0.4;
  const fontSize = markSize * 0.36;
  const textW = fontSize * WORDMARK_RATIO;
  const w = Math.round(Math.max(markSize, textW) + pad * 2);
  const gap = markSize * 0.28;
  const h = Math.round(markSize + gap + fontSize + pad * 2);
  const scale = markSize / 64;

  const inner = onDark
    ? dial({
        ringColor: "rgba(255,255,255,0.30)",
        arcColor: color.blue[400],
        handColor: "#FFFFFF",
        tickColor: "rgba(255,255,255,0.42)",
      })
    : dial({
        ringColor: color.neutral[300],
        arcColor: color.blue[500],
        handColor: color.navy[900],
        tickColor: color.neutral[300],
      });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="ImmigrationClock">
  <g transform="translate(${((w - markSize) / 2).toFixed(2)} ${pad}) scale(${scale.toFixed(5)})">
    ${inner}
  </g>
  <text x="${w / 2}" y="${(pad + markSize + gap + fontSize * 0.78).toFixed(2)}" text-anchor="middle" font-family="${font.sans}" font-size="${fontSize.toFixed(2)}" font-weight="700" letter-spacing="${(-0.02 * fontSize).toFixed(2)}" fill="${onDark ? "#FFFFFF" : color.navy[900]}">ImmigrationClock</text>
</svg>
`;
}
