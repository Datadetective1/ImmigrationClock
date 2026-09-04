// =============================================================================
// scripts/assemble-ground-truth.ts — turn labelling output into a benchmark
//
//   npx tsx scripts/assemble-ground-truth.ts <workflowDir> <outDir>
//
// WHAT IT DOES
// ------------
// Each record was labelled by one annotator reading only the document's own
// text, and every consequential label was then handed to an independent
// reviewer whose job was to refute it. This joins the two, and sorts every
// judgement into one of three piles:
//
//   agreed      the reviewer could not refute it. It goes into the benchmark.
//   contested   the reviewer disagreed. It goes to adjudication, NOT into the
//               benchmark, because a disputed label is not ground truth.
//   unreviewed  no reviewer was assigned — negatives that nobody contested.
//
// WHY CONTESTED LABELS ARE HELD BACK
// ----------------------------------
// The tempting shortcut is to resolve disagreements by rule: positives lose,
// or the reviewer always wins. Both are ways of deciding a factual question by
// procedure. A contested label is exactly the case where reading the document
// again is worth the effort, so it is quarantined and adjudicated separately.
//
// THE HOLDOUT
// -----------
// Records are split into a development portion and a HOLDOUT by hashing the
// record id, so the split is stable, reproducible, and independent of anything
// about the record's content or the classifier's answer. Nothing may be tuned
// against the holdout. It exists to detect exactly the overfitting that fixing
// a classifier against its own benchmark produces.
// =============================================================================

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const WF = process.argv[2];
const OUT = process.argv[3];
if (!WF || !OUT) {
  console.error("usage: tsx scripts/assemble-ground-truth.ts <workflowDir> <outDir>");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

// -----------------------------------------------------------------------------

interface JournalResult {
  type: string;
  agentId: string;
  result: unknown;
}

function journalResults(): Map<string, unknown> {
  const byAgent = new Map<string, unknown>();
  const lines = readFileSync(join(WF, "journal.jsonl"), "utf8").trim().split("\n");
  for (const line of lines) {
    try {
      const j = JSON.parse(line) as JournalResult;
      if (j.type === "result" && j.agentId) byAgent.set(j.agentId, j.result);
    } catch {
      /* a partial line while the run is still writing */
    }
  }
  return byAgent;
}

/**
 * What each agent was asked about, recovered from its own transcript.
 *
 * The verdict schema carries a record id but not which country or form the
 * reviewer was looking at, and one record can carry several. Rather than guess
 * from the reasoning text, the subject is read back out of the prompt the agent
 * was actually given.
 */
interface AgentSubject {
  agentId: string;
  kind: "label" | "verify";
  batchFile?: string;
  record?: string;
  country?: string;
  form?: string;
  dimension?: string;
}

function agentSubjects(): AgentSubject[] {
  const out: AgentSubject[] = [];
  for (const file of readdirSync(WF)) {
    if (!file.endsWith(".jsonl") || file === "journal.jsonl") continue;
    const agentId = file.replace(/^agent-/, "").replace(/\.jsonl$/, "");
    const text = readFileSync(join(WF, file), "utf8");

    const batch = text.match(/(country|h1b|forms|employment)-batch-\d{2}\.json/);
    const record = text.match(/RECORD: ([^\\"\n]+)/);
    const country = text.match(/COUNTRY: ([^\\"\n]+)/);
    const form = text.match(/FORM: ([^\\"\n]+)/);

    if (record) {
      out.push({
        agentId,
        kind: "verify",
        record: record[1].trim(),
        country: country?.[1]?.trim(),
        form: form?.[1]?.trim(),
        dimension: country ? "country" : form ? "forms" : batch?.[1],
      });
    } else if (batch) {
      out.push({ agentId, kind: "label", batchFile: batch[0], dimension: batch[1] });
    }
  }
  return out;
}

// -----------------------------------------------------------------------------

interface Verdict {
  agrees: boolean;
  correctedIsScope?: boolean;
  correctedRelation?: string;
  reasoning: string;
}

/** Stable 40/60 holdout split, from the record id alone. */
function isHoldout(id: string): boolean {
  const h = createHash("sha256").update(`holdout:${id}`).digest();
  return h[0] % 100 < 40;
}

function main() {
  const results = journalResults();
  const subjects = agentSubjects();

  // ---- verdicts, keyed by what they were about ----------------------------
  const verdicts = new Map<string, Verdict>();
  for (const s of subjects) {
    if (s.kind !== "verify") continue;
    const v = results.get(s.agentId) as Verdict | undefined;
    if (!v || typeof v.agrees !== "boolean") continue;
    const key = [s.dimension, s.record, s.country ?? s.form ?? ""].join("|");
    verdicts.set(key, v);
  }

  // ---- labels -------------------------------------------------------------
  const labelled: Record<string, any[]> = { country: [], h1b: [], forms: [], employment: [] };
  for (const s of subjects) {
    if (s.kind !== "label" || !s.dimension) continue;
    const r = results.get(s.agentId) as { records?: any[] } | undefined;
    if (!r?.records) continue;
    for (const rec of r.records) labelled[s.dimension].push(rec);
  }

  const summary: string[] = [];

  // ---- country ------------------------------------------------------------
  {
    const pairs: any[] = [];
    const contested: any[] = [];
    for (const rec of labelled.country) {
      for (const c of rec.countries ?? []) {
        const v = verdicts.get(["country", rec.id, c.country].join("|"));
        const entry = {
          id: rec.id,
          country: c.country,
          relation: c.relation,
          isScope: c.isScope,
          quote: c.quote,
          why: c.why,
          globalScope: rec.globalScope ?? false,
          scopeDelegated: rec.scopeDelegated ?? false,
          reviewed: Boolean(v),
          holdout: isHoldout(rec.id),
        };
        if (v && !v.agrees) {
          contested.push({ ...entry, reviewerSays: v.reasoning, reviewerIsScope: v.correctedIsScope, reviewerRelation: v.correctedRelation });
        } else {
          pairs.push(entry);
        }
      }
    }
    // Records with NO country at all are the recall evidence: they say "this
    // document names no country in a scope-bearing way", which is exactly what
    // a false negative would contradict.
    const emptyRecords = labelled.country
      .filter((r) => (r.countries ?? []).length === 0)
      .map((r) => ({ id: r.id, holdout: isHoldout(r.id), globalScope: r.globalScope ?? false }));

    writeFileSync(
      join(OUT, "country-labels.json"),
      `${JSON.stringify({ pairs, contested, recordsWithNoCountry: emptyRecords }, null, 2)}\n`
    );
    summary.push(
      `country     pairs ${pairs.length} · contested ${contested.length} · records-with-none ${emptyRecords.length} · records ${labelled.country.length}`
    );
  }

  // ---- h1b ----------------------------------------------------------------
  {
    const kept: any[] = [];
    const contested: any[] = [];
    for (const rec of labelled.h1b) {
      const v = verdicts.get(["h1b", rec.id, ""].join("|"));
      const entry = {
        id: rec.id,
        relevant: rec.relevant,
        mentionKind: rec.mentionKind,
        quote: rec.quote,
        why: rec.why,
        reviewed: Boolean(v),
        holdout: isHoldout(rec.id),
      };
      if (v && !v.agrees) {
        contested.push({ ...entry, reviewerSays: v.reasoning, reviewerRelevant: v.correctedIsScope });
      } else {
        kept.push(entry);
      }
    }
    writeFileSync(join(OUT, "h1b-labels.json"), `${JSON.stringify({ records: kept, contested }, null, 2)}\n`);
    summary.push(`h1b         records ${kept.length} · contested ${contested.length}`);
  }

  // ---- forms --------------------------------------------------------------
  {
    const kept: any[] = [];
    const contested: any[] = [];
    for (const rec of labelled.forms) {
      for (const f of rec.forms ?? []) {
        const v = verdicts.get(["forms", rec.id, f.form].join("|"));
        const entry = {
          id: rec.id,
          form: f.form,
          isSubject: f.isSubject,
          onlyInBody: f.onlyInBody ?? false,
          quote: f.quote,
          why: f.why,
          reviewed: Boolean(v),
          holdout: isHoldout(rec.id),
        };
        if (v && !v.agrees) contested.push({ ...entry, reviewerSays: v.reasoning });
        else kept.push(entry);
      }
    }
    const emptyRecords = labelled.forms
      .filter((r) => (r.forms ?? []).length === 0)
      .map((r) => ({ id: r.id, holdout: isHoldout(r.id) }));
    writeFileSync(
      join(OUT, "form-labels.json"),
      `${JSON.stringify({ pairs: kept, contested, recordsWithNoForm: emptyRecords }, null, 2)}\n`
    );
    summary.push(`forms       pairs ${kept.length} · contested ${contested.length} · records-with-none ${emptyRecords.length}`);
  }

  // ---- employment ---------------------------------------------------------
  {
    const kept: any[] = [];
    const contested: any[] = [];
    for (const rec of labelled.employment) {
      const v = verdicts.get(["employment", rec.id, ""].join("|"));
      const entry = {
        id: rec.id,
        employmentRelated: rec.employmentRelated,
        processes: rec.processes ?? [],
        quote: rec.quote,
        why: rec.why,
        reviewed: Boolean(v),
        holdout: isHoldout(rec.id),
      };
      if (v && !v.agrees) contested.push({ ...entry, reviewerSays: v.reasoning });
      else kept.push(entry);
    }
    writeFileSync(
      join(OUT, "employment-labels.json"),
      `${JSON.stringify({ records: kept, contested }, null, 2)}\n`
    );
    summary.push(`employment  records ${kept.length} · contested ${contested.length}`);
  }

  console.log(`agents: ${subjects.length} · results: ${results.size} · verdicts: ${verdicts.size}\n`);
  for (const line of summary) console.log(line);
  console.log(`\nwritten to ${OUT}`);
}

main();
