// =============================================================================
// scripts/reextract-forms.ts — form classification, from the documents
//
//   npx tsx scripts/reextract-forms.ts <bodiesDir> [--write]
//
// WHY
// ---
// Hand-labelling asked a direct question of the corpus: of the documents that
// are genuinely ABOUT a form — revising it, changing its fee, changing its
// edition — how many name that form in the title or the abstract?
//
// Forty of a hundred and twenty-two. The other eighty-two name it only in the
// body, because their titles are "Agency Information Collection Activities;
// Extension, Without Change, of a Currently Approved Collection" and nothing
// more. A form filter reading titles and abstracts alone cannot see four
// fifths of the documents that change a form, which makes it a filter that
// quietly does not work.
//
// The ingestion pipeline already fetches those bodies. The form extractor
// simply never read them, on the reasoning that the archive does not store
// bodies so a body-derived claim could not be re-read. That reasoning was
// wrong: the archive stores the QUOTE, and a quote is what a reader checks.
//
// This applies the corrected extractor to the committed archive, using the
// bodies fetched for validation. Same code as ingestion, one classifier.
// =============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { formsFor } from "../src/domains/graph/forms";
import { isStrong } from "../src/domains/graph/classification";
import { richText } from "../src/domains/graph/text";

const BODIES = process.argv[2];
const WRITE = process.argv.includes("--write");
if (!BODIES) {
  console.error("usage: tsx scripts/reextract-forms.ts <bodiesDir> [--write]");
  process.exit(1);
}

const PATH = resolve("src/lib/generated/events.json");

interface Impacted {
  entityId: string;
  basis: string;
  evidence?: string;
  method?: string;
  confidence: number;
}

interface Rec {
  id: string;
  title: string;
  summary: string;
  impact?: { forms?: Impacted[]; [k: string]: unknown };
  [k: string]: unknown;
}

function bodyOf(id: string): string {
  const f = join(BODIES, `${id.replace(/[^A-Za-z0-9._-]/g, "_")}.txt`);
  return existsSync(f) ? readFileSync(f, "utf8") : "";
}

function main() {
  const file = JSON.parse(readFileSync(PATH, "utf8")) as { events: Rec[]; [k: string]: unknown };

  let added = 0;
  let removed = 0;
  let withBody = 0;
  const examples: string[] = [];

  for (const e of file.events) {
    const body = bodyOf(e.id);
    if (body) withBody++;

    const before = new Set((e.impact?.forms ?? []).map((f) => f.entityId));
    // The body is truncated: a form named 200,000 characters into a rule is a
    // citation, not a subject, and scanning the whole of a 670KB document buys
    // noise. The operative and collection sections are at the front.
    const forms = formsFor(
      richText(e.title ?? ""),
      richText(e.summary ?? ""),
      richText(body.slice(0, 60_000))
    );

    const after = new Set(forms.map((f) => f.entityId));
    for (const id of after) {
      if (!before.has(id)) {
        added++;
        if (examples.length < 20) {
          const f = forms.find((x) => x.entityId === id)!;
          examples.push(`+ ${id.padEnd(14)} ${f.method.padEnd(24)} ${e.title.slice(0, 46)}`);
        }
      }
    }
    for (const id of before) if (!after.has(id)) removed++;

    (e.impact ??= {}).forms = forms as unknown as Impacted[];
  }

  const total = file.events.reduce((n, e) => n + (e.impact?.forms ?? []).length, 0);
  const strong = file.events.reduce(
    (n, e) => n + (e.impact?.forms ?? []).filter((f) => isStrong(f.method)).length,
    0
  );
  const records = file.events.filter((e) => (e.impact?.forms ?? []).length > 0).length;

  console.log("RE-EXTRACT FORMS");
  console.log(`  records with a document body   ${withBody}`);
  console.log(`  classifications added          ${added}`);
  console.log(`  classifications removed        ${removed}`);
  console.log(`  form classifications now       ${total} across ${records} records`);
  console.log(`  ... of which strong            ${strong}`);
  console.log("\nEXAMPLES");
  for (const x of examples) console.log(`  ${x}`);

  if (WRITE) {
    writeFileSync(PATH, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`\nWROTE ${PATH}`);
  } else {
    console.log("\nDRY RUN — nothing written. Pass --write to apply.");
  }
}

main();
