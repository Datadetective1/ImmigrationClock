// =============================================================================
// CBP NATIONWIDE ENCOUNTERS — which CSV on the landing page is the newest
//
// CBP posts one "...-MON-aor.csv" per reporting month, newest first. Its CMS
// appends "_0" (or "_1", …) when a file is re-uploaded under a name already
// taken: the August 2026 release went up as
// "nationwide-encounters-fy23-fy26-aug-aor_0.csv". A pattern that insisted on
// "-aor.csv" skipped it and silently fell back to July, so the suffix is part
// of the match here. Shared by refresh-data.mjs and backfill-history.mjs.
// =============================================================================

const AOR_CSV = /\/sites\/default\/files\/[^"'\s)]*nationwide-encounters-[^"'\s)]*-aor(?:_\d+)?\.csv/gi;

/** "JUL", "AUG", … from a CBP CSV path, or null when it names no month. */
export function cbpMonthFromPath(path) {
  const m = path.match(/-([a-z]{3})-aor(?:_\d+)?\.csv$/i);
  return m ? m[1].toUpperCase() : null;
}

/** Every "-aor.csv" path on the page, in page order (newest first), deduplicated. */
export function cbpAorCsvPaths(page) {
  return [...new Set([...page.matchAll(AOR_CSV)].map((m) => m[0]))];
}

/** The newest "-aor.csv" path and its month, or null when the page links none. */
export function latestCbpAorCsv(page) {
  const [path] = cbpAorCsvPaths(page);
  return path ? { path, monthAbbr: cbpMonthFromPath(path) } : null;
}
