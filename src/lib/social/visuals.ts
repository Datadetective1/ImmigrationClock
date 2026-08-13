// =============================================================================
// VISUALS — which posts earn a card, and exactly what it may say
//
// Two rules govern this file, and they are the whole design:
//
//   1. MOST POSTS GET NO IMAGE. A card is worth it when ONE number or ONE date
//      IS the post — a countdown, a fee, a window. When the value is in the
//      prose (who a rule reaches, how it differs from the last version, where it
//      sits in a sequence), a card adds decoration and costs credibility. So
//      visualFor() returns null more often than not, and that is correct.
//
//   2. THE CARD IS BUILT FROM VERIFIED DATA, NOT WRITTEN BY A MODEL. Every
//      string below is assembled here, in TypeScript, from the same records the
//      fact set is built from. No image model is asked to render immigration
//      information, and no card text is generated. The model writes the post;
//      the card states a figure the repository already holds.
//
// GROUNDING IS CHECKED, NOT ASSUMED
// ---------------------------------
// assertVisualGrounded() runs every numeral in a spec back through the
// validator's own allowedDigitRuns(). A card is a published claim in exactly the
// way a sentence is, and it would be absurd to check the sentence and not the
// image sitting under it.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
// ---------------------------------------
// It does not render pixels and it does not upload anything. A VisualSpec is a
// description of a card. Turning one into a PNG and attaching it to a post
// needs a rasteriser and a second X endpoint with its own permissions — see
// docs/social.md §"Visuals: what upload would require". Keeping the decision
// and the content separate from the rendering means the hard part (is this
// honest?) is testable today, without any of the infrastructure.
// =============================================================================

import type { KeyDate } from "@/lib/key-dates";
import type { IndexedEvent } from "@/lib/event-index";
import type { StandingAsset } from "./links";
import { allowedDigitRuns } from "./validate";
import { digitRuns } from "./facts";
import type { Angle, FactSet } from "./types";

/**
 * The five cards. Each maps to a distinct editorial situation; there is no
 * general-purpose card, because a general-purpose card is a template someone
 * will eventually fill with something it does not support.
 */
export type VisualKind =
  /** A date is close and the number of days is the point. */
  | "countdown"
  /** A window is ahead — informative, not urgent. */
  | "preparation"
  /** An official document just changed something. */
  | "update"
  /** A recurring reference date, no countdown attached. */
  | "key_date"
  /** A figure from our own datasets that carries the post. */
  | "data";

export interface VisualSpec {
  kind: VisualKind;
  /** Small label above the headline. Fixed per kind — never model-written. */
  eyebrow: string;
  /** The single largest element. A number, a date, or a very short phrase. */
  hero: string;
  /** One line under the hero saying what the hero refers to. */
  heroLabel: string;
  /** Up to two short supporting lines. Drawn from verified records. */
  supporting: string[];
  /**
   * The qualification that must appear ON the card, not only in the post.
   *
   * An approximate date rendered as a confident number is the single most
   * damaging thing this system could publish, because an image outlives the
   * text it shipped with and gets screenshotted without it.
   */
  caveat: string | null;
  /** Attribution line. Always the source the figures came from. */
  source: string;
  /** Footer, so a screenshotted card still says where it came from. */
  footer: string;
}

const FOOTER = "immigrationclock.com";

// -----------------------------------------------------------------------------
// THE DECISION
// -----------------------------------------------------------------------------

/**
 * Angles whose value is prose. These never get a card, however good the subject.
 *
 * Listed as an explicit deny-list rather than inferred, because the temptation
 * later will be to give every post an image for reach, and the list is where
 * that argument has to be had.
 */
const PROSE_ANGLES: ReadonlySet<Angle> = new Set<Angle>([
  "who_is_affected",
  "what_changed_from_previous",
  "historical_context",
  "effective_date_reminder",
]);

export function angleSupportsVisual(angle: Angle): boolean {
  return !PROSE_ANGLES.has(angle);
}

// -----------------------------------------------------------------------------
// BUILDERS — one per subject kind, called from selection where the records are
// -----------------------------------------------------------------------------

/**
 * A key date. The countdown card is the strongest visual this system has: the
 * number is computed, checkable, and genuinely the reason to look.
 */
export function buildKeyDateVisual(
  kd: KeyDate,
  daysAway: number,
  angle: Angle
): VisualSpec | null {
  if (!angleSupportsVisual(angle)) return null;

  if (angle === "deadline_approaching") {
    return {
      kind: "countdown",
      eyebrow: "KEY DATE",
      hero: String(daysAway),
      heroLabel: daysAway === 1 ? "day away" : "days away",
      supporting: [kd.title],
      // The approximate flag is the reason this caveat exists at all. A card
      // showing "53 days" for a window the agency has not announced is a
      // confident-looking number attached to a date nobody has set.
      caveat: kd.approx
        ? "Approximate — the exact window is announced each year"
        : null,
      source: kd.sourceName,
      footer: FOOTER,
    };
  }

  if (angle === "preparation_window") {
    return {
      kind: "preparation",
      eyebrow: "WINDOW AHEAD",
      hero: kd.title,
      heroLabel: `About ${daysAway} days out`,
      supporting: [],
      caveat: kd.approx
        ? "Approximate — the exact window is announced each year"
        : null,
      source: kd.sourceName,
      footer: FOOTER,
    };
  }

  return {
    kind: "key_date",
    eyebrow: "KEY DATE",
    hero: kd.title,
    heroLabel: kd.cadence ?? "Recurring deadline",
    supporting: [],
    caveat: kd.approx ? "Approximate — set by the agency each year" : null,
    source: kd.sourceName,
    footer: FOOTER,
  };
}

/**
 * An archive event. Only `major` severity earns a card: `notable` items are real
 * and worth posting, and a card on every one of them would make the card mean
 * nothing.
 */
export function buildEventVisual(
  event: IndexedEvent,
  angle: Angle,
  sourceName: string
): VisualSpec | null {
  if (!angleSupportsVisual(angle)) return null;
  if (event.severity !== "major") return null;

  const kindLabel =
    event.classification === "proposed_rule"
      ? "PROPOSED RULE"
      : event.classification === "court_decision"
        ? "COURT DECISION"
        : "IMMIGRATION UPDATE";

  return {
    kind: "update",
    eyebrow: kindLabel,
    // The title, trimmed — never rewritten. Rewriting a federal document's
    // title into something punchier is precisely how a card starts saying
    // something the document does not.
    hero: event.title.length > 90 ? `${event.title.slice(0, 87)}…` : event.title,
    heroLabel: sourceName,
    supporting: event.effectiveAt ? [`Takes effect ${event.effectiveAt}`] : [],
    caveat:
      event.classification === "proposed_rule"
        ? "Proposed — not in force, and may never be finalised"
        : null,
    source: sourceName,
    footer: FOOTER,
  };
}

/**
 * A standing asset. Only the ones carrying reported figures — a card whose hero
 * is a sentence is a slide, not a card.
 */
export function buildAssetVisual(
  asset: StandingAsset,
  angle: Angle,
  facts: FactSet,
  hero: { value: string; label: string } | null
): VisualSpec | null {
  if (!angleSupportsVisual(angle)) return null;
  if (!hero) return null;

  return {
    kind: "data",
    eyebrow: "BY THE NUMBERS",
    hero: hero.value,
    heroLabel: hero.label,
    supporting: [asset.label],
    caveat: null,
    source: facts.sourceName,
    footer: FOOTER,
  };
}

// -----------------------------------------------------------------------------
// GROUNDING
// -----------------------------------------------------------------------------

/**
 * Every numeral on the card must be one the fact set already permits.
 *
 * Same corpus, same normalisation, same primitive the post text is checked
 * against — so a figure that could not be written in a sentence cannot be
 * printed on an image either.
 */
export function assertVisualGrounded(
  spec: VisualSpec,
  facts: FactSet
): { ok: boolean; failures: string[] } {
  const permitted = allowedDigitRuns(facts);
  const text = [
    spec.hero,
    spec.heroLabel,
    ...spec.supporting,
    spec.caveat ?? "",
    spec.source,
  ].join(" ");

  const failures: string[] = [];
  for (const run of digitRuns(text)) {
    const normalized = run.replace(/^0+/, "") || "0";
    if (!permitted.has(normalized)) {
      failures.push(`Card states "${run}", which is not in the fact set`);
    }
  }
  return { ok: failures.length === 0, failures };
}

/**
 * A one-line description of the card, for the ledger and the dry-run report.
 * Never sent to a platform — this is how a human reviews what would ship.
 */
export function describeVisual(spec: VisualSpec | null): string {
  if (!spec) return "no image — the prose carries this one";
  const caveat = spec.caveat ? ` · caveat: "${spec.caveat}"` : "";
  return `${spec.kind} card — ${spec.eyebrow} · "${spec.hero}" / ${spec.heroLabel}${caveat} · ${spec.source}`;
}
