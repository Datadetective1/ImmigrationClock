/**
 * ImmigrationClock icon set — 31 icons.
 *
 * Rules of construction, so new icons match:
 *   · 24 × 24 grid, 2px optical padding — live area is 20 × 20
 *   · 1.75 stroke, round caps, round joins, no fills except deliberate dots
 *   · geometry snaps to 0.5 increments; circles centre on 12
 *   · stroke="currentColor" — colour is decided by context, never by the icon
 *   · nothing is drawn smaller than 2.5 units; it will not survive 16px
 *
 * Deliberately absent: gavels, scales of justice, courthouse columns, eagles,
 * flags, handshakes, torches. Those are the visual vocabulary of a law firm or
 * an advocacy group. This product reports numbers.
 */

export const ICON_GRID = 24;
export const ICON_STROKE = 1.75;

export const icons = {
  /* ── Data & evidence ─────────────────────────────────────────────── */
  source: `<path d="M4 6c0-1.66 3.58-3 8-3s8 1.34 8 3-3.58 3-8 3-8-1.34-8-3Z"/><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6"/><path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>`,
  document: `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/><path d="M9 14.25l2 2 4-4"/>`,
  verified: `<path d="M12 2.75l7.25 2.6v5.4c0 4.45-3 8.5-7.25 9.5-4.25-1-7.25-5.05-7.25-9.5v-5.4L12 2.75Z"/><path d="M8.75 11.9l2.4 2.4 4.1-4.4"/>`,
  dataset: `<path d="M12 2.75l9.25 4.9L12 12.55 2.75 7.65 12 2.75Z"/><path d="M2.75 12.4L12 17.3l9.25-4.9"/><path d="M2.75 16.6L12 21.5l9.25-4.9"/>`,
  api: `<path d="M8.75 7.25L4 12l4.75 4.75"/><path d="M15.25 7.25L20 12l-4.75 4.75"/><path d="M13.4 4.5l-2.8 15"/>`,
  download: `<path d="M12 3.25v11.5"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 20.25h16"/>`,

  /* ── Time & freshness ────────────────────────────────────────────── */
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 6.75V12l3.5 2.1"/>`,
  live: `<circle cx="10.75" cy="13.25" r="7.5"/><path d="M10.75 8.5v4.75l3.25 1.95"/><circle cx="19" cy="5" r="2.5" fill="currentColor" stroke="none"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/><circle cx="8.5" cy="14.5" r="1.15" fill="currentColor" stroke="none"/>`,
  history: `<path d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1L3 8.9"/><path d="M2.75 4.25v4.9h4.9"/><path d="M12 8.25V12.5l3.1 1.85"/>`,

  /* ── Charts ──────────────────────────────────────────────────────── */
  chartLine: `<path d="M4 3.75v16.5h16.25"/><path d="M7.5 15.75l3.75-4.25 2.9 2.6 5.35-6.1"/>`,
  chartBar: `<path d="M4 3.75v16.5h16.25"/><path d="M8 20.25v-6.5"/><path d="M12.5 20.25v-10.5"/><path d="M17 20.25v-4"/>`,
  chartArea: `<path d="M4 3.75v16.5h16.25"/><path d="M7.25 16.25l3.75-4.5 3 2.75 5.5-6.25v12H7.25v-4Z"/>`,
  gauge: `<path d="M3.6 17.25a9 9 0 1 1 16.8 0"/><path d="M12 17.25l4.1-5.35"/><circle cx="12" cy="17.25" r="1.5" fill="currentColor" stroke="none"/>`,
  trendUp: `<path d="M3.5 17.5L10 11l3.75 3.75L20.5 8"/><path d="M15.5 8h5v5"/>`,
  trendDown: `<path d="M3.5 8L10 14.5l3.75-3.75L20.5 17.5"/><path d="M15.5 17.5h5v-5"/>`,
  trendFlat: `<path d="M3.5 12.75h13"/><path d="M14.5 8.75l4.5 4-4.5 4"/>`,

  /* ── Subject matter ──────────────────────────────────────────────── */
  globe: `<circle cx="12" cy="12" r="9"/><path d="M3.2 12h17.6"/><path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18Z"/>`,
  state: `<path d="M12 21.25s6.9-6.15 6.9-11a6.9 6.9 0 1 0-13.8 0c0 4.85 6.9 11 6.9 11Z"/><circle cx="12" cy="10.1" r="2.6"/>`,
  status: `<rect x="3" y="4.25" width="18" height="15.5" rx="2.5"/><circle cx="8.75" cy="11" r="2.35"/><path d="M5.25 16.9c.5-1.7 1.85-2.55 3.5-2.55s3 .85 3.5 2.55"/><path d="M14.75 10h4"/><path d="M14.75 13.5h4"/>`,
  border: `<path d="M21.25 2.75L9.6 21.25l-2.1-8.75-6.75-2.1L21.25 2.75Z"/><path d="M21.25 2.75L7.5 12.5"/>`,
  employer: `<path d="M2.75 20.75h18.5"/><path d="M5.25 20.75V4.5a1.5 1.5 0 0 1 1.5-1.5h6a1.5 1.5 0 0 1 1.5 1.5v16.25"/><path d="M14.25 20.75V9.5h4.25a1.5 1.5 0 0 1 1.5 1.5v9.75"/><path d="M8.25 7.25h3"/><path d="M8.25 11.5h3"/><path d="M8.25 15.75h3"/>`,
  jobs: `<rect x="2.75" y="6.75" width="18.5" height="13.5" rx="2.5"/><path d="M8.5 6.75V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.75"/><path d="M2.75 12.75h18.5"/>`,
  people: `<circle cx="9.25" cy="8" r="3.4"/><path d="M2.75 20.25c0-3.65 2.9-5.6 6.5-5.6s6.5 1.95 6.5 5.6"/><path d="M16.4 5.1a3.4 3.4 0 0 1 0 5.8"/><path d="M17.6 14.9c2.4.6 3.65 2.4 3.65 5.35"/>`,

  /* ── Utility ─────────────────────────────────────────────────────── */
  search: `<circle cx="10.5" cy="10.5" r="6.75"/><path d="M15.4 15.4l5.35 5.35"/>`,
  filter: `<path d="M3.25 5.5h17.5"/><path d="M6.5 12h11"/><path d="M9.75 18.5h4.5"/>`,
  external: `<path d="M14 3.75h6.25V10"/><path d="M20.25 3.75L11 13"/><path d="M18 13.75v4.5a2 2 0 0 1-2 2H5.75a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4.5"/>`,
  caveat: `<path d="M10.7 3.6a1.5 1.5 0 0 1 2.6 0l8.05 14.15a1.5 1.5 0 0 1-1.3 2.25H3.95a1.5 1.5 0 0 1-1.3-2.25L10.7 3.6Z"/><path d="M12 9.25v4.5"/><circle cx="12" cy="16.9" r="1.15" fill="currentColor" stroke="none"/>`,
  method: `<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.85" r="1.15" fill="currentColor" stroke="none"/>`,
  newsletter: `<rect x="2.5" y="4.75" width="19" height="14.5" rx="2.5"/><path d="M3.25 7.25L12 13.4l8.75-6.15"/>`,
  alert: `<path d="M18 9.25a6 6 0 1 0-12 0c0 5.5-2 7.25-2 7.25h16s-2-1.75-2-7.25Z"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/>`,
};

/** Wrap an icon body into a standalone SVG file. */
export function iconSvg(name, { size = 24, color = "currentColor" } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${name}">
  ${icons[name]}
</svg>
`;
}

/** One sprite sheet, referenced as <use href="sprite.svg#ic-clock"/>. */
export function iconSprite() {
  const symbols = Object.entries(icons)
    .map(
      ([name, body]) =>
        `  <symbol id="ic-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`
    )
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols}\n</svg>\n`;
}
