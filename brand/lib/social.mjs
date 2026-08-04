/**
 * Banners and post templates.
 *
 * Every layout here is centred or left-aligned away from the platform's own
 * chrome. LinkedIn overlaps the bottom-left of a cover with the org logo card;
 * X overlaps the bottom-left with the avatar. Nothing important goes there.
 */

import { color, font, TAGLINE, NAME, DOMAIN } from "../tokens.mjs";
import { dial } from "./mark.mjs";

/**
 * Advance-width estimate, used only to centre and right-align.
 *
 * Measured against Inter: mixed-case sentence text averages 0.478 em/char,
 * uppercase averages 0.62. A single constant put chips and pills ~50px off
 * their margin, so the two cases are separated. Values are rounded up a hair
 * — over-estimating leaves a gap, under-estimating causes a collision.
 */
export const approxW = (text, size, tracking = 0, upper = false) =>
  text.length * size * (upper ? 0.635 : 0.5) + text.length * tracking;

/** Full-bleed navy field. The brand's dark surface. */
export function navyField(w, h, id = "bg") {
  return `<defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color.navy[950]}"/>
      <stop offset="0.55" stop-color="${color.navy[900]}"/>
      <stop offset="1" stop-color="${color.navy[800]}"/>
    </linearGradient>
    <radialGradient id="${id}-glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${color.blue[500]}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${color.blue[500]}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${id}-clip"><rect width="${w}" height="${h}"/></clipPath>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#${id})"/>`;
}

/**
 * Wraps the decorative layer (glow, watermark dials) in an explicit clip.
 *
 * A root <svg> hides overflow per spec, so browsers already crop the bleed —
 * but SVG-to-PNG converters vary, and a watermark that silently escapes the
 * canvas in one exporter is the kind of bug that ships to a company page.
 * Clipping makes the intent explicit rather than inherited.
 */
export const decor = (parts, id = "bg") =>
  `<g clip-path="url(#${id}-clip)">${parts}</g>`;

/**
 * Oversized dial used as a watermark. Bleeds off-canvas on purpose — a
 * partially visible instrument reads as scale, a fully visible one reads as
 * decoration.
 */
export function ghostDial({ cx, cy, size, opacity = 0.09 }) {
  const s = size / 64;
  return `<g transform="translate(${(cx - size / 2).toFixed(1)} ${(cy - size / 2).toFixed(1)}) scale(${s.toFixed(4)})" opacity="${opacity}">
    ${dial({
      ringColor: "#FFFFFF",
      arcColor: color.blue[300],
      handColor: "#FFFFFF",
      tickColor: "#FFFFFF",
    })}
  </g>`;
}

/** Agency provenance chips. The single most on-brand decoration we have. */
export function sourceChips({
  x,
  y,
  items = ["USCIS", "ICE", "CBP", "STATE DEPT", "BLS"],
  size = 15,
  onDark = true,
}) {
  let cursor = x;
  const out = [];
  const padX = size * 0.95;
  const h = size * 2.3;
  for (const label of items) {
    const tw = approxW(label, size, size * 0.09, true);
    const w = tw + padX * 2;
    out.push(
      `<g><rect x="${cursor.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" fill="${onDark ? "rgba(255,255,255,0.07)" : color.neutral[100]}" stroke="${onDark ? "rgba(255,255,255,0.14)" : color.neutral[200]}"/><text x="${(cursor + w / 2).toFixed(1)}" y="${(y + h / 2 + size * 0.35).toFixed(1)}" text-anchor="middle" font-family="${font.sans}" font-size="${size}" font-weight="600" letter-spacing="${(size * 0.09).toFixed(2)}" fill="${onDark ? color.blue[200] : color.neutral[600]}">${label}</text></g>`
    );
    cursor += w + size * 0.62;
  }
  return { svg: out.join("\n    "), width: cursor - x - size * 0.62, height: h };
}

/** Width of a pill, so callers can right-align it flush to a margin. */
export const pillWidth = (label, size = 15) =>
  approxW(label, size, size * 0.09, true) + size * 3.3;

/** A live-data pill: dot + label. Colour is never the only signal it carries. */
export function livePill({ x, y, label = "UPDATED DAILY", onDark = true, size = 15 }) {
  const h = size * 2.3;
  const w = pillWidth(label, size);
  return `<g><rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" fill="${onDark ? "rgba(14,159,110,0.14)" : "#E6F6EF"}" stroke="${onDark ? "rgba(14,159,110,0.35)" : "#BFE7D6"}"/><circle cx="${(x + size * 1.15).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" r="${(size * 0.29).toFixed(2)}" fill="${color.status.live}"/><text x="${(x + size * 1.85).toFixed(1)}" y="${(y + h / 2 + size * 0.35).toFixed(1)}" font-family="${font.sans}" font-size="${size}" font-weight="600" letter-spacing="${(size * 0.09).toFixed(2)}" fill="${onDark ? "#7FD9B6" : color.status.liveInk}">${label}</text></g>`;
}

/* ───────────────────────── Banners ───────────────────────── */

/**
 * LinkedIn company cover — 1128 × 191.
 * One centred row. At 191px tall anything else reads as clutter; a single
 * rule of type is the letterhead move and it is what Stripe/Linear would do.
 */
export function linkedinCompanyBanner() {
  const W = 1128;
  const H = 191;
  const markSize = 54;
  const fs = 33;
  const tagFs = 21;
  const gap = 18;
  const sep = 30;
  const wordW = fs * 8.35;
  const tagW = approxW(TAGLINE, tagFs, tagFs * 0.02);
  const total = markSize + gap + wordW + sep + 1 + sep + tagW;
  const x0 = (W - total) / 2;
  const cy = H / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${navyField(W, H)}
  ${decor(`<ellipse cx="${W}" cy="0" rx="620" ry="420" fill="url(#bg-glow)"/>
  ${ghostDial({ cx: 1052, cy: 96, size: 300, opacity: 0.1 })}
  ${ghostDial({ cx: 78, cy: 96, size: 260, opacity: 0.06 })}`)}
  <g transform="translate(${x0.toFixed(1)} ${(cy - markSize / 2).toFixed(1)}) scale(${(markSize / 64).toFixed(5)})">
    ${dial({ ringColor: "rgba(255,255,255,0.30)", arcColor: color.blue[400], handColor: "#FFFFFF", tickColor: "rgba(255,255,255,0.45)" })}
  </g>
  <text x="${(x0 + markSize + gap).toFixed(1)}" y="${(cy + fs * 0.355).toFixed(1)}" font-family="${font.sans}" font-size="${fs}" font-weight="700" letter-spacing="${(-0.02 * fs).toFixed(2)}" fill="#FFFFFF">${NAME}</text>
  <rect x="${(x0 + markSize + gap + wordW + sep).toFixed(1)}" y="${(cy - 22).toFixed(1)}" width="1" height="44" fill="rgba(255,255,255,0.22)"/>
  <text x="${(x0 + markSize + gap + wordW + sep + 1 + sep).toFixed(1)}" y="${(cy + tagFs * 0.355).toFixed(1)}" font-family="${font.sans}" font-size="${tagFs}" font-weight="500" letter-spacing="${(tagFs * 0.02).toFixed(2)}" fill="${color.blue[200]}">${TAGLINE}</text>
</svg>
`;
}

/**
 * LinkedIn personal / profile cover — 1584 × 396.
 * Room for the full argument: name, tagline, provenance.
 */
export function linkedinPersonalBanner() {
  const W = 1584;
  const H = 396;
  const markSize = 76;
  const fs = 52;
  const gap = 26;
  const wordW = fs * 8.35;
  const total = markSize + gap + wordW;
  const x0 = (W - total) / 2;

  const chips = sourceChips({ x: 0, y: 0, size: 17 });
  const chipX = (W - chips.width) / 2;
  const tagFs = 25;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${navyField(W, H)}
  ${decor(`<ellipse cx="${W * 0.82}" cy="0" rx="760" ry="520" fill="url(#bg-glow)"/>
  ${ghostDial({ cx: 1420, cy: 198, size: 460, opacity: 0.1 })}
  ${ghostDial({ cx: 150, cy: 198, size: 380, opacity: 0.055 })}`)}
  <g transform="translate(${x0.toFixed(1)} 108) scale(${(markSize / 64).toFixed(5)})">
    ${dial({ ringColor: "rgba(255,255,255,0.30)", arcColor: color.blue[400], handColor: "#FFFFFF", tickColor: "rgba(255,255,255,0.45)" })}
  </g>
  <text x="${(x0 + markSize + gap).toFixed(1)}" y="164" font-family="${font.sans}" font-size="${fs}" font-weight="700" letter-spacing="${(-0.02 * fs).toFixed(2)}" fill="#FFFFFF">${NAME}</text>
  <text x="${W / 2}" y="232" text-anchor="middle" font-family="${font.sans}" font-size="${tagFs}" font-weight="500" letter-spacing="${(tagFs * 0.03).toFixed(2)}" fill="${color.blue[200]}">${TAGLINE}</text>
  <g transform="translate(${chipX.toFixed(1)} 276)">${chips.svg}</g>
</svg>
`;
}

/**
 * X / Twitter header — 1500 × 500.
 * Left-aligned editorial block starting at x=340 to clear the avatar, which X
 * overlays at the bottom-left. Vertical content stays inside 100–400 because
 * mobile crops the top and bottom bands.
 */
export function xBanner() {
  const W = 1500;
  const H = 500;
  const X = 340;
  const markSize = 68;
  const fs = 46;
  const gap = 22;
  const chips = sourceChips({ x: 0, y: 0, size: 16 });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${navyField(W, H)}
  ${decor(`<ellipse cx="${W * 0.86}" cy="${H * 0.1}" rx="700" ry="520" fill="url(#bg-glow)"/>
  ${ghostDial({ cx: 1290, cy: 250, size: 520, opacity: 0.11 })}`)}
  <g transform="translate(${X} 132) scale(${(markSize / 64).toFixed(5)})">
    ${dial({ ringColor: "rgba(255,255,255,0.30)", arcColor: color.blue[400], handColor: "#FFFFFF", tickColor: "rgba(255,255,255,0.45)" })}
  </g>
  <text x="${X + markSize + gap}" y="184" font-family="${font.sans}" font-size="${fs}" font-weight="700" letter-spacing="${(-0.02 * fs).toFixed(2)}" fill="#FFFFFF">${NAME}</text>
  <text x="${X}" y="264" font-family="${font.sans}" font-size="28" font-weight="500" letter-spacing="0.84" fill="${color.blue[200]}">${TAGLINE}</text>
  <text x="${X}" y="306" font-family="${font.sans}" font-size="19" font-weight="400" fill="rgba(255,255,255,0.55)">Live U.S. immigration, visa, enforcement and workforce data.</text>
  <g transform="translate(${X} 336)">${chips.svg}</g>
</svg>
`;
}
