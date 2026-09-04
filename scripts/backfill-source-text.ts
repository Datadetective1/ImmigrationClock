// =============================================================================
// scripts/backfill-source-text.ts — retain what the pipeline already fetched
//
//   npx tsx scripts/backfill-source-text.ts <rawDir> [--write]
//
// The ingestion pipeline has been fetching Federal Register full text all along
// and discarding it. Going forward, build-events.ts retains it. This fills the
// store for the 348 documents already in the archive, from text fetched from
// the government's own canonical text URL.
//
// IT INVENTS NOTHING. A document with no retrievable text gets no entry, and
// its record keeps no sourceDocument. The absence is the honest answer and it
// is what the coverage report counts.
//
// `retrievedAt` is the date this backfill actually ran, not the document's
// publication date and not a guess at when the pipeline first saw it. A
// provenance field that says something other than what happened is worse than
// an absent one.
// =============================================================================

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { putSourceText } from "../src/lib/source-text";
import { richText } from "../src/domains/graph/text";

const RAW_DIR = process.argv[2];
const WRITE = process.argv.includes("--write");
if (!RAW_DIR) {
  console.error("usage: tsx scripts/backfill-source-text.ts <rawDir> [--write]");
  process.exit(1);
}

const EVENTS_PATH = resolve("src/lib/generated/events.json");
const TODAY = new Date().toISOString().slice(0, 10);

interface Rec {
  id: string;
  sourceUrl: string;
  sourceDocument?: unknown;
  [k: string]: unknown;
}

/** The Federal Register publishes plain text at a URL derived from the doc URL. */
function textUrlFor(sourceUrl: string): string | null {
  const m = sourceUrl.match(
    /federalregister\.gov\/documents\/(\d{4})\/(\d{2})\/(\d{2})\/([0-9A-Za-z-]+)/
  );
  if (!m) return null;
  const [, y, mo, d, docNumber] = m;
  return `https://www.federalregister.gov/documents/full_text/text/${y}/${mo}/${d}/${docNumber}.txt`;
}

function main() {
  const file = JSON.parse(readFileSync(EVENTS_PATH, "utf8")) as {
    events: Rec[];
    [k: string]: unknown;
  };
  const byId = new Map(file.events.map((e) => [e.id, e] as const));

  const raws = readdirSync(RAW_DIR).filter((f) => f.endsWith(".txt") && !f.startsWith("_"));
  let stored = 0;
  let skippedNoRecord = 0;
  let skippedNoUrl = 0;
  let emptyAfterNormalizing = 0;
  let characters = 0;

  for (const f of raws) {
    const id = f.replace(/\.txt$/, "").replace(/_/g, ":").replace(/^([a-z_]+):/, (m) => m);
    // The filename encoding is lossy (colons became underscores), so match on
    // the safe name rather than trying to reverse it.
    const record = file.events.find((e) => `${e.id.replace(/[^A-Za-z0-9._-]/g, "_")}.txt` === f);
    if (!record) {
      skippedNoRecord++;
      continue;
    }

    const textUrl = textUrlFor(record.sourceUrl);
    if (!textUrl) {
      skippedNoUrl++;
      continue;
    }

    const normalized = richText(readFileSync(join(RAW_DIR, f), "utf8"));
    if (!normalized.trim()) {
      emptyAfterNormalizing++;
      continue;
    }

    if (WRITE) {
      const ref = putSourceText({
        id: record.id,
        normalized,
        textUrl,
        retrievedAt: TODAY,
        adapter: "federal-register@backfill-1",
      });
      record.sourceDocument = {
        file: ref.file,
        textUrl: ref.textUrl,
        contentHash: ref.contentHash,
        characters: ref.characters,
        retrievedAt: ref.retrievedAt,
        adapter: ref.adapter,
      };
    }
    stored++;
    characters += normalized.length;
    void byId;
    void id;
  }

  console.log("BACKFILL SOURCE TEXT");
  console.log(`  raw files                    ${raws.length}`);
  console.log(`  stored                       ${stored}`);
  console.log(`  characters retained          ${(characters / 1e6).toFixed(1)}M`);
  console.log(`  skipped, no matching record  ${skippedNoRecord}`);
  console.log(`  skipped, no text URL         ${skippedNoUrl}`);
  console.log(`  empty after normalizing      ${emptyAfterNormalizing}`);
  console.log(`  records without text         ${file.events.length - stored}`);

  if (WRITE) {
    writeFileSync(EVENTS_PATH, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`\nWROTE ${EVENTS_PATH} and ${existsSync(resolve("data/source-text")) ? "data/source-text/" : "(no store?)"}`);
  } else {
    console.log("\nDRY RUN — nothing written. Pass --write to apply.");
  }
}

main();
