/**
 * Social post templates.
 *
 * Four layouts cover everything this brand needs to say:
 *   A. THE NUMBER    — one figure, sourced. The default post.
 *   B. THE STATEMENT — a plain-language finding on navy. For threads/quotes.
 *   C. THE CHART     — a comparison, portrait, for feed dwell time.
 *   D. THE CARD      — 1.91:1 link preview / OG image.
 *
 * Every one of them ends in a source line. That is not decoration; a post from
 * this account without a visible source is off-brand and should not ship.
 */

import { color, font, TAGLINE, DOMAIN } from "../tokens.mjs";
import { dial } from "./mark.mjs";
import {
  approxW,
  navyField,
  ghostDial,
  livePill,
  pillWidth,
  decor,
} from "./social.mjs";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function markRow({ x, y, size = 44, onDark = false }) {
  const fs = size * 0.6;
  return `<g transform="translate(${x} ${y}) scale(${(size / 64).toFixed(5)})">
    ${dial(
      onDark
        ? { ringColor: "rgba(255,255,255,0.30)", arcColor: color.blue[400], handColor: "#FFFFFF", tickColor: "rgba(255,255,255,0.45)" }
        : { ringColor: color.neutral[300], arcColor: color.blue[500], handColor: color.navy[900], tickColor: color.neutral[300] }
    )}
  </g>
  <text x="${x + size + size * 0.34}" y="${(y + size / 2 + fs * 0.355).toFixed(1)}" font-family="${font.sans}" font-size="${fs.toFixed(1)}" font-weight="700" letter-spacing="${(-0.02 * fs).toFixed(2)}" fill="${onDark ? "#FFFFFF" : color.navy[900]}">ImmigrationClock</text>`;
}

function sourceFooter({ w, y, source, asOf, onDark = false }) {
  const line = onDark ? "rgba(255,255,255,0.16)" : color.neutral[200];
  const label = onDark ? color.blue[300] : color.blue[600];
  const body = onDark ? "rgba(255,255,255,0.72)" : color.neutral[600];
  const M = 88;
  return `<rect x="${M}" y="${y}" width="${w - M * 2}" height="1" fill="${line}"/>
  <text x="${M}" y="${y + 44}" font-family="${font.sans}" font-size="20" font-weight="700" letter-spacing="2.4" fill="${label}">SOURCE</text>
  <text x="${M}" y="${y + 84}" font-family="${font.mono}" font-size="23" fill="${body}">${esc(source)}</text>
  <text x="${M}" y="${y + 120}" font-family="${font.mono}" font-size="23" fill="${body}">${esc(asOf)}</text>
  <text x="${w - M}" y="${y + 120}" text-anchor="end" font-family="${font.sans}" font-size="23" font-weight="600" fill="${onDark ? "rgba(255,255,255,0.5)" : color.neutral[500]}">${DOMAIN}</text>`;
}

/* ── A. THE NUMBER — 1080 × 1080, white ────────────────────────────────── */
export function postNumber({
  eyebrow = "H-1B PETITIONS · FY2024",
  value = "399,395",
  label = "approvals reported by USCIS",
  context = "India accounted for 283,397 of them.",
  delta = "6.2% vs FY2023",
  source = "USCIS H-1B Employer Data Hub",
  asOf = "Data through Sep 30, 2024",
} = {}) {
  const W = 1080;
  const M = 88;
  const numSize = value.length > 8 ? 132 : 158;
  const chipW = approxW(delta, 24, 0.5) + 96;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
  <rect width="${W}" height="${W}" fill="#FFFFFF"/>
  <rect x="0" y="0" width="${W}" height="10" fill="${color.navy[900]}"/>
  <rect x="0" y="0" width="270" height="10" fill="${color.blue[500]}"/>
  ${markRow({ x: M, y: 82, size: 46 })}
  ${livePill({ x: W - M - pillWidth("SOURCED FIGURE"), y: 92, label: "SOURCED FIGURE", onDark: false, size: 15 })}

  <text x="${M}" y="352" font-family="${font.sans}" font-size="24" font-weight="700" letter-spacing="3" fill="${color.blue[600]}">${esc(eyebrow)}</text>
  <text x="${M}" y="522" font-family="${font.mono}" font-size="${numSize}" font-weight="600" letter-spacing="-4" fill="${color.navy[900]}">${esc(value)}</text>
  <text x="${M}" y="596" font-family="${font.sans}" font-size="42" font-weight="500" fill="${color.neutral[700]}">${esc(label)}</text>
  <text x="${M}" y="656" font-family="${font.sans}" font-size="28" font-weight="400" fill="${color.neutral[500]}">${esc(context)}</text>

  <g>
    <rect x="${M}" y="710" width="${chipW.toFixed(0)}" height="60" rx="30" fill="${color.blue[50]}" stroke="${color.blue[100]}"/>
    <path d="M${M + 34} ${710 + 38}L${M + 46} ${710 + 22}L${M + 58} ${710 + 38}" fill="none" stroke="${color.blue[600]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="${M + 74}" y="${710 + 39}" font-family="${font.sans}" font-size="24" font-weight="600" fill="${color.blue[800]}">${esc(delta)}</text>
  </g>

  ${sourceFooter({ w: W, y: 850, source, asOf })}
</svg>
`;
}

/* ── B. THE STATEMENT — 1080 × 1080, navy ──────────────────────────────── */
export function postStatement({
  eyebrow = "WHAT CHANGED THIS MONTH",
  lines = [
    "ICE reported 271,484",
    "removals in FY2024 —",
    "the highest figure",
    "in a decade.",
  ],
  note = "Detention counts are a point-in-time figure, not an annual total.",
  source = "ICE Annual Report FY2024, Table 1",
  asOf = "Published Dec 2024 · retrieved Aug 2026",
} = {}) {
  const W = 1080;
  const M = 88;
  const fs = 66;
  const lead = 84;
  const top = 372;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
  ${navyField(W, W)}
  ${decor(`<ellipse cx="${W}" cy="0" rx="720" ry="640" fill="url(#bg-glow)"/>
  ${ghostDial({ cx: 968, cy: 880, size: 520, opacity: 0.08 })}`)}
  ${markRow({ x: M, y: 82, size: 46, onDark: true })}

  <rect x="${M}" y="286" width="72" height="4" fill="${color.blue[400]}"/>
  <text x="${M}" y="336" font-family="${font.sans}" font-size="24" font-weight="700" letter-spacing="3" fill="${color.blue[300]}">${esc(eyebrow)}</text>
  ${lines
    .map(
      (l, i) =>
        `<text x="${M}" y="${top + lead * (i + 1)}" font-family="${font.sans}" font-size="${fs}" font-weight="650" letter-spacing="-1.4" fill="#FFFFFF">${esc(l)}</text>`
    )
    .join("\n  ")}
  <text x="${M}" y="${top + lead * lines.length + 74}" font-family="${font.sans}" font-size="26" font-weight="400" fill="rgba(255,255,255,0.62)">${esc(note)}</text>

  ${sourceFooter({ w: W, y: 850, source, asOf, onDark: true })}
</svg>
`;
}

/* ── C. THE CHART — 1080 × 1350, white ─────────────────────────────────── */
export function postChart({
  eyebrow = "TOP H-1B SPONSORS · FY2024",
  title = "Who sponsors the most",
  subtitle = "Approvals reported to USCIS, initial and continuing",
  bars = [
    { label: "Amazon", value: 9265 },
    { label: "Cognizant", value: 6321 },
    { label: "Infosys", value: 5989 },
    { label: "TCS", value: 5274 },
    { label: "Microsoft", value: 4725 },
    { label: "Meta", value: 4004 },
  ],
  source = "USCIS H-1B Employer Data Hub",
  asOf = "Data through Sep 30, 2024",
} = {}) {
  const W = 1080;
  const H = 1350;
  const M = 88;
  const plotTop = 470;
  const plotH = 470;
  const plotW = W - M * 2;
  const max = Math.max(...bars.map((b) => b.value));
  const bw = plotW / bars.length;
  const barW = bw * 0.56;

  const gridlines = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const y = plotTop + plotH - plotH * f;
      return `<rect x="${M}" y="${y.toFixed(1)}" width="${plotW}" height="1" fill="${f === 0 ? color.neutral[300] : color.neutral[100]}"/>`;
    })
    .join("\n  ");

  const series = bars
    .map((b, i) => {
      const h = (b.value / max) * plotH;
      const x = M + bw * i + (bw - barW) / 2;
      const y = plotTop + plotH - h;
      const fill = i === 0 ? color.blue[500] : color.navy[800];
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${fill}"/>
  <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 18).toFixed(1)}" text-anchor="middle" font-family="${font.mono}" font-size="26" font-weight="600" fill="${color.navy[900]}">${b.value.toLocaleString("en-US")}</text>
  <text x="${(x + barW / 2).toFixed(1)}" y="${(plotTop + plotH + 40).toFixed(1)}" text-anchor="middle" font-family="${font.sans}" font-size="24" font-weight="500" fill="${color.neutral[600]}">${esc(b.label)}</text>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#FFFFFF"/>
  <rect x="0" y="0" width="${W}" height="10" fill="${color.navy[900]}"/>
  <rect x="0" y="0" width="270" height="10" fill="${color.blue[500]}"/>
  ${markRow({ x: M, y: 82, size: 46 })}
  ${livePill({ x: W - M - pillWidth("UPDATED DAILY"), y: 92, label: "UPDATED DAILY", onDark: false, size: 15 })}

  <text x="${M}" y="286" font-family="${font.sans}" font-size="24" font-weight="700" letter-spacing="3" fill="${color.blue[600]}">${esc(eyebrow)}</text>
  <text x="${M}" y="368" font-family="${font.sans}" font-size="62" font-weight="700" letter-spacing="-1.6" fill="${color.navy[900]}">${esc(title)}</text>
  <text x="${M}" y="418" font-family="${font.sans}" font-size="28" font-weight="400" fill="${color.neutral[500]}">${esc(subtitle)}</text>

  ${gridlines}
  ${series}

  ${sourceFooter({ w: W, y: 1120, source, asOf })}
</svg>
`;
}

/* ── D. THE CARD — 1200 × 628, navy. Link previews and OG images. ──────── */
export function postCard({
  headline = "The Immigration Clock",
  sub = "Live public data on immigration, visas, enforcement and jobs.",
} = {}) {
  const W = 1200;
  const H = 628;
  const M = 72;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${navyField(W, H)}
  ${decor(`<ellipse cx="${W * 0.9}" cy="${H * 0.08}" rx="620" ry="480" fill="url(#bg-glow)"/>
  ${ghostDial({ cx: 1088, cy: 452, size: 460, opacity: 0.1 })}`)}
  ${markRow({ x: M, y: 64, size: 48, onDark: true })}

  <text x="${M}" y="348" font-family="${font.sans}" font-size="76" font-weight="700" letter-spacing="-2" fill="#FFFFFF">${esc(headline)}</text>
  <text x="${M}" y="404" font-family="${font.sans}" font-size="29" font-weight="400" fill="rgba(255,255,255,0.68)">${esc(sub)}</text>

  <rect x="${M}" y="486" width="56" height="3" fill="${color.blue[400]}"/>
  <text x="${M}" y="546" font-family="${font.sans}" font-size="24" font-weight="600" letter-spacing="1.2" fill="${color.blue[200]}">${TAGLINE}</text>
  <text x="${W - M}" y="546" text-anchor="end" font-family="${font.sans}" font-size="24" font-weight="600" fill="rgba(255,255,255,0.5)">${DOMAIN}</text>
</svg>
`;
}
