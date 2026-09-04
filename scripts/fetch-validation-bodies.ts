// =============================================================================
// scripts/fetch-validation-bodies.ts — full document text, for measuring recall
//
//   npx tsx scripts/fetch-validation-bodies.ts <outDir> [--limit N]
//
// WHY THIS EXISTS
// ---------------
// The archive stores a title, an abstract, and the evidence quote the original
// extraction chose. That is enough to measure PRECISION — every claim the
// classifier makes can be checked against the quote it made it from. It is not
// enough to measure RECALL, because a record whose country or visa scope sits
// only in its body is invisible: we cannot count a miss we cannot see.
//
// Every recall number published so far has therefore been "recall against what
// the archive kept", which is a weaker claim than it looks. This fetches the
// actual documents so the next one can be recall against what the government
// actually published.
//
// WHAT IT IS NOT
// --------------
// NOT part of the data pipeline and not a refresh. It writes to a scratch
// directory outside the repository, is read-only with respect to the product,
// and nothing it downloads is ever committed or served. `npm run prebuild` is
// the thing that refreshes data; this is a measuring instrument.
//
// It is polite about it: one request at a time, a short pause between them, a
// descriptive user agent, and a local cache so a re-run costs nothing.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EVENTS } from "../src/lib/event-store";
import type { ImmigrationEvent } from "../src/domains/graph/events";

const OUT_DIR = process.argv[2];
if (!OUT_DIR) {
  console.error("usage: tsx scripts/fetch-validation-bodies.ts <outDir> [--limit N]");
  process.exit(1);
}
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const UA = "ImmigrationClock classification validation (one-off, read-only)";
const PAUSE_MS = 350;

/** The Federal Register publishes plain text at a URL derived from the doc URL. */
function rawTextUrl(sourceUrl: string): string | null {
  // https://www.federalregister.gov/documents/2026/08/31/2026-17726/slug
  const m = sourceUrl.match(
    /federalregister\.gov\/documents\/(\d{4})\/(\d{2})\/(\d{2})\/([0-9A-Za-z-]+)/
  );
  if (!m) return null;
  const [, y, mo, d, docNumber] = m;
  return `https://www.federalregister.gov/documents/full_text/text/${y}/${mo}/${d}/${docNumber}.txt`;
}

function safeName(id: string): string {
  return `${id.replace(/[^A-Za-z0-9._-]/g, "_")}.txt`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const all = EVENTS as unknown as ImmigrationEvent[];
  const targets = all
    .filter((e) => e.sourceKey === "federal_register" && rawTextUrl(e.sourceUrl))
    .slice(0, LIMIT);

  console.log(`${targets.length} Federal Register records with a derivable text URL`);

  let fetched = 0;
  let cached = 0;
  let failed = 0;
  const index: { id: string; file: string; title: string; chars: number }[] = [];

  for (const e of targets) {
    const file = join(OUT_DIR, safeName(e.id));
    if (existsSync(file)) {
      cached++;
      index.push({ id: e.id, file, title: e.title, chars: readFileSync(file, "utf8").length });
      continue;
    }

    const url = rawTextUrl(e.sourceUrl)!;
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (!res.ok) {
        failed++;
        console.log(`  ${res.status} ${e.id}`);
      } else {
        const text = await res.text();
        writeFileSync(file, text);
        index.push({ id: e.id, file, title: e.title, chars: text.length });
        fetched++;
        if (fetched % 25 === 0) console.log(`  fetched ${fetched}…`);
      }
    } catch (err) {
      failed++;
      console.log(`  ERROR ${e.id}: ${(err as Error).message}`);
    }
    await sleep(PAUSE_MS);
  }

  writeFileSync(join(OUT_DIR, "_index.json"), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`\nfetched ${fetched} · cached ${cached} · failed ${failed}`);
  console.log(`index written to ${join(OUT_DIR, "_index.json")}`);
}

main();
