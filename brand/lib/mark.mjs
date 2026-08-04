/**
 * The ImmigrationClock mark — "The Dial".
 *
 * A measuring instrument, not a wall clock. Three concentric layers of
 * information, which is the whole thesis of the product:
 *
 *   1. graduations (outer ticks)  — the scale you are measuring against
 *   2. the sweep (accent arc)     — the period actually covered by the data
 *   3. the hand                   — where the reading stands right now
 *
 * The arc always runs 12 → 3. It is a quarter, never a half or a full ring:
 * a full ring would claim complete coverage, and this product is explicit that
 * its data is partial and lagged. The mark is honest about that.
 *
 * Three optical cuts, because a naive scale-down does not survive contact with
 * a browser tab:
 *
 *   regular (≥32px)  full mark — graduations, sweep, hand
 *   small   (20–32)  graduations dropped, strokes thickened
 *   micro   (≤16)    hand and dot dropped as well
 *
 * The micro cut is not timidity. At 16px the gap between the hand's cap and
 * the ring's inner edge works out to 0.90px, which antialiasing turns into a
 * navy blob — the mark stops being a dial and becomes a smudge. What survives
 * is the ring and the blue quarter-sweep, so that is what micro keeps. It is
 * still unmistakably this mark and not a generic circle.
 */

import { color } from "../tokens.mjs";

const rad = (deg) => ((deg - 90) * Math.PI) / 180;
const pt = (cx, cy, r, deg) => [
  +(cx + r * Math.cos(rad(deg))).toFixed(3),
  +(cy + r * Math.sin(rad(deg))).toFixed(3),
];

/**
 * @param {object} o
 * @param {"regular"|"small"|"micro"} o.optical
 * @param {string} o.ringColor    the un-swept portion of the dial
 * @param {string} o.arcColor     the swept quarter (the accent)
 * @param {string} o.handColor
 * @param {string} [o.tickColor]
 */
export function dial({
  optical = "regular",
  ringColor,
  arcColor,
  handColor,
  tickColor,
}) {
  const C = 32;
  const micro = optical === "micro";
  const small = optical === "small" || micro;

  const R = micro ? 22 : small ? 24 : 23;
  const SW = micro ? 9 : small ? 6.4 : 4.6;
  const handR = small ? 13 : 15.5;
  const dotR = small ? 3.4 : 2.8;

  const [ax, ay] = pt(C, C, R, 0); // arc start, 12 o'clock
  const [bx, by] = pt(C, C, R, 90); // arc end, 3 o'clock
  const [hx, hy] = pt(C, C, handR, 0); // hand tip, points to 12

  const parts = [];

  // Graduations. Cardinal points only — four is a scale, twelve is a clock,
  // and we are not selling a clock.
  if (!small && tickColor) {
    for (const deg of [0, 90, 180, 270]) {
      const [x1, y1] = pt(C, C, 27.5, deg);
      const [x2, y2] = pt(C, C, 30.2, deg);
      parts.push(
        `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${tickColor}" stroke-width="2.4" stroke-linecap="round"/>`
      );
    }
  }

  // The dial, unswept.
  parts.push(
    `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${ringColor}" stroke-width="${SW}"/>`
  );

  // The sweep. Butt cap at 12 so the hand reads as its origin; round cap at 3
  // so it terminates rather than points.
  parts.push(
    `<path d="M${ax} ${ay}A${R} ${R} 0 0 1 ${bx} ${by}" fill="none" stroke="${arcColor}" stroke-width="${SW}" stroke-linecap="round"/>`
  );

  // The reading. Omitted at micro — see the optical-cut note above.
  if (!micro) {
    parts.push(
      `<path d="M${C} ${C}L${hx} ${hy}" stroke="${handColor}" stroke-width="${SW}" stroke-linecap="round"/>`
    );
    parts.push(`<circle cx="${C}" cy="${C}" r="${dotR}" fill="${handColor}"/>`);
  }

  return parts.join("\n    ");
}

/** The mark inside its navy container. Used wherever a square avatar is required. */
export function badge({
  size = 64,
  radius = 0.234, // 15/64 — a superellipse-adjacent squircle, not a circle
  bg = color.navy[900],
  optical = "regular",
  ringColor = "rgba(255,255,255,0.30)",
  arcColor = color.blue[400],
  handColor = "#FFFFFF",
  tickColor = "rgba(255,255,255,0.42)",
  inset = 0.7,
} = {}) {
  const r = (radius * 64).toFixed(2);
  const s = inset;
  const t = 32 - 32 * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="ImmigrationClock">
  <rect width="64" height="64" rx="${r}" fill="${bg}"/>
  <g transform="translate(${t.toFixed(3)} ${t.toFixed(3)}) scale(${s})">
    ${dial({ optical, ringColor, arcColor, handColor, tickColor })}
  </g>
</svg>
`;
}

/** The bare glyph, no container. For light backgrounds and single-colour use. */
export function glyph({
  size = 64,
  optical = "regular",
  ringColor = color.neutral[300],
  arcColor = color.blue[500],
  handColor = color.navy[900],
  tickColor = color.neutral[300],
} = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="ImmigrationClock">
  ${dial({ optical, ringColor, arcColor, handColor, tickColor })}
</svg>
`;
}
