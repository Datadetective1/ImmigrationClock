// =============================================================================
// SCORING THE CLASSIFIER AGAINST HAND LABELS
//
// One implementation, used by the detailed report (scripts/measure-benchmarks)
// and by the scorecard (scripts/intelligence-quality). Two measurements of the
// same thing that disagree is worse than one that is wrong, because nobody can
// tell which to believe.
//
// PREDICTION IS ALWAYS WHAT THE API RETURNS BY DEFAULT — strong classifications
// only. Scoring the internal representation would measure something no consumer
// can see.
//
// EVERY DIMENSION IS SCORED TWICE: on the development half, which informed the
// classifier, and on the holdout half, which did not. Where the two diverge,
// the holdout is the number to believe.
// =============================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isStrong } from "@/domains/graph/classification";
import { isScopeRelation, type CountryRelation } from "@/domains/graph/country-relations";
import { COUNTRIES } from "@/domains/graph/countries";
import { normalizeSlug } from "@/domains/graph/entities";
import type { ImmigrationEvent } from "@/domains/graph/events";

export interface Score {
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  n: number;
  falsePositives: string[];
  falseNegatives: string[];
}

export interface Judgement {
  key: string;
  holdout: boolean;
  actual: boolean;
  predicted: boolean;
  label: string;
}

export interface DimensionScores {
  dimension: string;
  dev: Score;
  holdout: Score;
  combined: Score;
  /** Labels excluded because an independent reviewer disagreed with them. */
  contested: number;
  /** True when a second reader checked these labels. */
  independentlyReviewed: boolean;
  note: string;
}

export function score(items: Judgement[]): Score {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const falsePositives: string[] = [];
  const falseNegatives: string[] = [];
  for (const i of items) {
    if (i.predicted && i.actual) tp++;
    else if (i.predicted && !i.actual) {
      fp++;
      falsePositives.push(i.label);
    } else if (!i.predicted && i.actual) {
      fn++;
      falseNegatives.push(i.label);
    }
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
  return { tp, fp, fn, precision, recall, f1, n: items.length, falsePositives, falseNegatives };
}

function splitScore(dimension: string, items: Judgement[], meta: Omit<DimensionScores, "dimension" | "dev" | "holdout" | "combined">): DimensionScores {
  return {
    dimension,
    dev: score(items.filter((i) => !i.holdout)),
    holdout: score(items.filter((i) => i.holdout)),
    combined: score(items),
    ...meta,
  };
}

/**
 * Country names as documents write them, mapped to the slug the graph uses.
 *
 * "Burma (Myanmar)" and "People's Republic of China" are how the source says
 * it; burma and china are how we store it. Matching by string normalisation
 * alone reported three correct classifications as unlabelled.
 */
const SLUG_BY_SURFACE = new Map<string, string>();
for (const c of COUNTRIES) {
  const slug = normalizeSlug(c.name);
  for (const surface of [c.name, ...(c.aliases ?? [])]) SLUG_BY_SURFACE.set(surface.toLowerCase(), slug);
}

export function countrySlug(written: string): string {
  const lower = written.toLowerCase().trim();
  const direct = SLUG_BY_SURFACE.get(lower);
  if (direct) return direct;
  for (const part of lower.split(/[()]/).map((x) => x.trim()).filter(Boolean)) {
    const hit = SLUG_BY_SURFACE.get(part);
    if (hit) return hit;
  }
  return normalizeSlug(written);
}

function rows(e: ImmigrationEvent | undefined, dimension: string) {
  return ((e?.impact as Record<string, unknown> | undefined)?.[dimension] ?? []) as {
    entityId: string;
    method?: string;
  }[];
}

const EMPLOYMENT_VISAS = new Set([
  "visa:h-1b", "visa:h-1b1", "visa:h-2a", "visa:h-2b", "visa:h-3", "visa:l-1", "visa:l-1a",
  "visa:l-1b", "visa:o-1", "visa:tn", "visa:e-3", "visa:eb-1", "visa:eb-2", "visa:eb-3",
  "visa:eb-4", "visa:eb-5",
]);
const EMPLOYMENT_FORMS = new Set([
  "form:i-129", "form:i-140", "form:i-765", "form:i-9", "form:eta-9089", "form:eta-9035",
  "form:eta-790", "form:i-907",
]);

/** Score every dimension that has a committed ground truth. */
export function measureAll(events: ImmigrationEvent[], fixturesDir = "fixtures"): DimensionScores[] {
  const byId = new Map(events.map((e) => [e.id, e] as const));
  const load = <T>(name: string): T =>
    JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as T;

  const out: DimensionScores[] = [];

  // ---- H-1B, original 21-record set ---------------------------------------
  {
    const t = load<{
      relevant: { id: string }[];
      notRelevant: { id: string }[];
    }>("h1b-ground-truth.json");
    const relevant = new Set(t.relevant.map((r) => r.id));
    const items: Judgement[] = [...t.relevant, ...t.notRelevant]
      .filter((r) => byId.has(r.id))
      .map((r) => ({
        key: r.id,
        holdout: false,
        actual: relevant.has(r.id),
        predicted: rows(byId.get(r.id), "visaCategories").some(
          (v) => v.entityId === "visa:h-1b" && isStrong(v.method)
        ),
        label: `${r.id} ${(byId.get(r.id)!.title ?? "").slice(0, 54)}`,
      }));
    out.push(
      splitScore("H-1B (original 21)", items, {
        contested: 0,
        independentlyReviewed: true,
        note: "the first benchmark, kept and scored separately so a later set cannot quietly replace it",
      })
    );
  }

  // ---- H-1B, expanded -----------------------------------------------------
  {
    const t = load<{
      records: { id: string; relevant: boolean; holdout: boolean; mentionKind: string }[];
      contested: unknown[];
    }>("h1b-expanded-ground-truth.json");
    const items: Judgement[] = t.records
      .filter((r) => byId.has(r.id))
      .map((r) => ({
        key: r.id,
        holdout: r.holdout,
        actual: r.relevant,
        predicted: rows(byId.get(r.id), "visaCategories").some(
          (v) => v.entityId === "visa:h-1b" && isStrong(v.method)
        ),
        label: `${r.id} ${(byId.get(r.id)!.title ?? "").slice(0, 48)} [${r.mentionKind}]`,
      }));
    out.push(
      splitScore("H-1B (expanded)", items, {
        contested: t.contested.length,
        independentlyReviewed: true,
        note: "every record in the corpus whose text names H-1B anywhere, so recall is over the whole knowable population",
      })
    );
  }

  // ---- Countries ----------------------------------------------------------
  {
    const t = load<{
      pairs: { id: string; country: string; relation: CountryRelation; isScope: boolean; holdout: boolean }[];
      contested: unknown[];
    }>("country-expanded-ground-truth.json");
    const seen = new Map<string, Judgement>();
    for (const p of t.pairs) {
      if (!byId.has(p.id)) continue;
      const slug = countrySlug(p.country);
      const key = `${p.id}|${slug}`;
      seen.set(key, {
        key,
        holdout: p.holdout,
        actual: p.isScope && isScopeRelation(p.relation),
        predicted: rows(byId.get(p.id), "countries").some(
          (c) => c.entityId === `country:${slug}` && isStrong(c.method)
        ),
        label: `${p.country} on ${(byId.get(p.id)!.title ?? "").slice(0, 44)} [${p.relation}]`,
      });
    }
    out.push(
      splitScore("Country", [...seen.values()], {
        contested: t.contested.length,
        independentlyReviewed: true,
        note: "one judgement per record-and-country pair, each carrying the relation that decided it",
      })
    );
  }

  // ---- Forms --------------------------------------------------------------
  {
    const t = load<{
      pairs: { id: string; form: string; isSubject: boolean; holdout: boolean }[];
      contested: unknown[];
    }>("form-ground-truth.json");
    const items: Judgement[] = t.pairs
      .filter((p) => byId.has(p.id))
      .map((p) => {
        const slug = p.form.toLowerCase().replace(/^forms?\s+/, "");
        return {
          key: `${p.id}|${slug}`,
          holdout: p.holdout,
          actual: p.isSubject,
          predicted: rows(byId.get(p.id), "forms").some(
            (f) => f.entityId === `form:${slug}` && isStrong(f.method)
          ),
          label: `${p.form} on ${(byId.get(p.id)!.title ?? "").slice(0, 46)}`,
        };
      });
    out.push(
      splitScore("Forms", items, {
        contested: t.contested.length,
        independentlyReviewed: false,
        note: "single-annotator labels: the independent reviewers for this dimension did not run to completion",
      })
    );
  }

  // ---- Employment ---------------------------------------------------------
  {
    const t = load<{
      records: { id: string; employmentRelated: boolean; holdout: boolean }[];
      contested: unknown[];
    }>("employment-ground-truth.json");
    const items: Judgement[] = t.records
      .filter((r) => byId.has(r.id))
      .map((r) => {
        const e = byId.get(r.id)!;
        return {
          key: r.id,
          holdout: r.holdout,
          actual: r.employmentRelated,
          predicted:
            rows(e, "visaCategories").some((v) => isStrong(v.method) && EMPLOYMENT_VISAS.has(v.entityId)) ||
            rows(e, "forms").some((f) => isStrong(f.method) && EMPLOYMENT_FORMS.has(f.entityId)) ||
            rows(e, "processes").some((p) => isStrong(p.method)),
          label: `${r.id} ${e.title.slice(0, 52)}`,
        };
      });
    out.push(
      splitScore("Employment / process", items, {
        contested: t.contested.length,
        independentlyReviewed: false,
        note: "single-annotator labels: the independent reviewers for this dimension did not run to completion",
      })
    );
  }

  return out;
}
