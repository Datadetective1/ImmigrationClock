// =============================================================================
// scripts/check-sources.ts — are the authoritative links still there?
//
//   npm run check:sources
//
// Fetches every source the key dates and the explainers cite, as a browser
// would (GET, redirects followed, a real user agent), and prints a verdict per
// link. Exits non-zero when any source is BROKEN (404, 410, or no answer): the
// weekly workflow (.github/workflows/check-sources.yml) turns that into a red
// run, which is the whole point — a dead link used to be silent.
//
// A host that refuses automated clients (403, 429) is reported and does not
// fail the run; travel.state.gov does this to everything but a browser. A 5xx
// is reported and does not fail the run either; one run cannot tell an outage
// from a removal.
// =============================================================================

import { authoritativeSources, isTrustedSourceUrl, verdictFor, type SourceVerdict } from "../src/lib/source-check";

const UA = "Mozilla/5.0 (compatible; ImmigrationClock source check; +https://immigrationclock.com)";

async function status(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.8" },
      signal: AbortSignal.timeout(30_000),
    });
    // The body is not needed; cancel it so the socket is released.
    await res.body?.cancel().catch(() => undefined);
    return res.status;
  } catch {
    return null;
  }
}

async function main() {
  const sources = authoritativeSources();
  const counts: Record<SourceVerdict, number> = { ok: 0, blocked: 0, broken: 0, error: 0 };
  const rows: { owner: string; url: string; status: number | null; verdict: SourceVerdict }[] = [];

  for (const s of sources) {
    const st = isTrustedSourceUrl(s.url) ? await status(s.url) : null;
    const verdict = isTrustedSourceUrl(s.url) ? verdictFor(st) : "broken";
    counts[verdict]++;
    rows.push({ owner: s.owner, url: s.url, status: st, verdict });
    const mark = verdict === "ok" ? "✓" : verdict === "broken" ? "✗" : "·";
    console.log(`${mark} ${verdict.padEnd(7)} ${String(st ?? "—").padStart(3)}  ${s.owner}\n            ${s.url}`);
  }

  console.log(
    `\n${sources.length} source(s): ${counts.ok} ok, ${counts.blocked} blocked (host refuses automated clients), ${counts.error} error, ${counts.broken} broken`
  );
  if (counts.broken) {
    console.log("\nBROKEN — the page is gone or the address is not an official https URL. Find the agency's current page and update the registry:");
    for (const r of rows.filter((x) => x.verdict === "broken")) console.log(`  ${r.owner}  ${r.url}`);
    process.exitCode = 1;
  }
}

main();
