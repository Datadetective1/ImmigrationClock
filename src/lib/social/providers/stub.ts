// =============================================================================
// STUB COPY ENGINE — deterministic copy from the fact set, for simulations
//
// NOT THE VOICE. This engine assembles a post from the fact set in whichever
// offered shape the account has used least recently, so the deterministic
// layers around the model — cadence, the queue, rotation, opening and shape
// variety, the validator — can be exercised end to end on a machine with no
// API key, and so a test of those layers is reproducible.
//
// Everything it writes comes from the fact set, and it is validated by the real
// validator like any other engine's output, so a simulation with it publishes
// nothing the production engine could not. It stamps its own id into every
// ledger row so a simulation can never be mistaken for a production run, and
// createCopyEngine() never returns it: it is reachable only by name, from the
// simulator and the tests.
// =============================================================================

import type { Structure } from "../content-types";
import { longDate } from "../implications";
import { AGENCY_DISPLAY, permittedAgencies } from "../validate";
import type { CopyEngine, CopyRequest, EngineResult, FactSet } from "../types";

/** The record's title without the "Policy alert:" prefix, as one line. */
function plainTitle(f: FactSet): string {
  return f.title.replace(/^Policy alert:\s*/i, "").replace(/\s+/g, " ").trim();
}

/** The agency as a person writes it, or "the agency" when none is permitted. */
function agency(f: FactSet): string {
  const a = permittedAgencies(f)[0];
  if (!a) return "The agency";
  const display = AGENCY_DISPLAY[a] ?? a;
  // Sentence position: "the Department of Labor" → "The Department of Labor".
  return display.charAt(0).toUpperCase() + display.slice(1);
}

function firstSentence(text: string, max = 150): string {
  const s = text.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)[0] ?? text;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function dateWords(iso: string | null): string {
  return iso ? longDate(iso) : "";
}

function stageVerb(f: FactSet): string {
  if (f.classification === "proposed_rule") return "has proposed a change to";
  if (f.classification === "court_decision") return "has been ordered to pause";
  if (/rescind|rescission/i.test(`${f.title} ${f.summary}`)) return "has withdrawn its rule on";
  return "has changed its rule on";
}

function timingLine(f: FactSet): string {
  if (f.classification === "proposed_rule") return "It is a proposal: nothing changes unless it is finalised.";
  if (f.effectiveAt && f.effectiveAt > f.today) return `It takes effect ${dateWords(f.effectiveAt)}.`;
  if (f.effectiveAt) return `It has been in effect since ${dateWords(f.effectiveAt)}.`;
  if (f.subjectKind === "document") return `${agency(f)} has not posted a separate effective date.`;
  return "";
}

function sourceLine(f: FactSet): string {
  return `Source: ${f.sourceName.split(";")[0].trim()}`;
}

/** The X body for one shape, before the link. Every sentence comes from the fact set. */
function xBody(structure: Structure, f: FactSet): string {
  const t = plainTitle(f);
  const ag = agency(f);
  const points = f.dataPoints ?? [];
  const impl = f.implications ?? [];
  const verb = stageVerb(f);
  switch (structure) {
    case "news":
      return [`${ag} ${verb} ${t}.`, firstSentence(f.summary, 120), timingLine(f)].filter(Boolean).join("\n\n");
    case "direct":
      return [`${t}: ${firstSentence(f.summary, 120)}`, timingLine(f), "Here's the source →"].filter(Boolean).join("\n\n");
    case "address":
      return [`${f.entities[0] ? `${f.entities[0]} applicants:` : "Filing soon?"} ${ag} ${verb} ${t}.`, timingLine(f)].filter(Boolean).join("\n\n");
    case "date_lede":
      return [`Starting ${dateWords(f.effectiveAt) || "on the date the record gives"}: ${t}.`, firstSentence(f.summary, 110), "Until then the current rules apply."].join("\n\n");
    case "what_changed":
      return [`${ag} ${verb} ${t}.`, `What changed: ${firstSentence(f.summary, 100)}`, `What ImmigrationClock is watching: ${impl[impl.length - 1] ?? timingLine(f)}`].join("\n\n");
    case "before_after":
      return [`${t}.`, `Before: ${impl[0] ?? firstSentence(f.summary, 90)}`, `Now: ${firstSentence(f.summary, 90)}`, timingLine(f)].filter(Boolean).join("\n\n");
    case "why_it_matters":
      return [`${ag} ${verb} ${t}. ${timingLine(f)}`.trim(), `Why it matters: ${impl[0] ?? firstSentence(f.summary, 100)}`, sourceLine(f)].join("\n\n");
    case "context_first":
      return [`${t}: ${impl[0] ?? firstSentence(f.summary, 100)}`, `${ag} ${verb} that. ${timingLine(f)}`.trim()].join("\n\n");
    case "data_figure":
      return [points[0] ?? f.summary, points[1] ?? "", sourceLine(f)].filter(Boolean).join("\n\n");
    case "data_question":
      return [questionFor(f), points[0] ?? f.summary, sourceLine(f)].join("\n\n");
    case "data_compare":
      return [points[0] ?? f.summary, points[1] ?? "", `Two periods, no trend claimed. ${sourceLine(f)}`].filter(Boolean).join("\n\n");
    case "distinction":
      return [`${t}. ${f.summary}`, points[0] ?? "", "ImmigrationClock keeps the two apart."].filter(Boolean).join("\n\n");
    case "list":
      return [`${t}:`, ...points.slice(0, 3).map((p) => `• ${firstSentence(p, 70)}`)].join("\n");
    case "question_answer":
      return [questionFor(f), points[0] ?? f.summary].join("\n\n");
    case "need_first":
      return [f.summary, points[0] ?? ""].filter(Boolean).join("\n\n");
    case "tool_plain":
      return [points[0] ?? f.summary, points[1] ?? ""].filter(Boolean).join("\n\n");
  }
}

function questionFor(f: FactSet): string {
  if (f.subjectKind === "data_signal") return `${f.title.replace(/\.$/, "")}?`;
  if (f.subjectKind === "explainer") return `${f.title.replace(/\.$/, "")} — what is the difference?`;
  return f.summary.endsWith("?") ? f.summary : `${f.summary.replace(/\.$/, "")}?`;
}

/** Trim prose to the X budget without cutting inside a word. */
function fit(prose: string, max: number): string {
  if (prose.length <= max) return prose;
  const cut = prose.slice(0, max - 1);
  const boundary = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("\n"));
  return `${cut.slice(0, boundary > max / 2 ? boundary : max - 1).trimEnd()}…`;
}

export class StubCopyEngine implements CopyEngine {
  readonly id = "stub:facts";

  /** Pick the offered shape used least recently; ties go to the first offered. */
  static chooseStructure(req: CopyRequest): Structure {
    const offered = req.structures?.length ? req.structures : (["direct"] as Structure[]);
    const recent = req.recentStructures ?? [];
    const unused = offered.filter((s) => !recent.includes(s));
    if (unused.length) return unused[0];
    return [...offered].sort((a, b) => recent.indexOf(b) - recent.indexOf(a))[0];
  }

  async generate(req: CopyRequest): Promise<EngineResult> {
    const f = req.facts;
    const structure = StubCopyEngine.chooseStructure(req);
    const prose = fit(xBody(structure, f), 240);
    const x = `${prose}\n\n${f.deepLink}`;

    const who = f.entities.length
      ? `Who this reaches: ${f.entities.slice(0, 3).join(", ")}.`
      : `What the record covers: ${firstSentence(f.summary, 120)}`;
    // LinkedIn opens by naming the record, so the cold-reader test passes on
    // every shape — the X body's first line may open on context instead.
    const body = [
      `${plainTitle(f)} — ${firstSentence(f.summary, 110)}`,
      "",
      timingLine(f) || f.summary,
      "",
      who,
      ...(f.dataPoints?.length ? ["", f.dataPoints.slice(0, 2).join(" ")] : []),
      ...(f.implications?.length ? ["", f.implications[0]] : []),
      "",
      f.deepLink,
    ].join("\n");
    const linkedin =
      body.length >= 300
        ? body
        : body.replace(
            f.deepLink,
            `ImmigrationClock records each change with its source, classification and dates, so the original document is one click away.\n\n${f.deepLink}`
          );

    return {
      copy: { x, linkedin, deepLink: f.deepLink, structure, headline: fit(plainTitle(f), 88) },
      usage: { model: this.id, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: 0, costUsd: 0 },
    };
  }
}
