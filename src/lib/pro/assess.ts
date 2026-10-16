// =============================================================================
// HOW A RECORD STANDS FOR ONE SUBSCRIBER — relevance, timing, status
//
// The Monitor's buckets (src/lib/intelligence/inbox.ts) answer a vendor's
// question and are a public API, so they stay as they are. Briefing asks a
// different one — "what needs me now, what is coming, what is history" — and
// two of the Monitor's rules answer it badly:
//
//   • "Followed and recorded as major" put a December 2025 rule under "Needs
//     attention" in October 2026. Severity is how significant a change was
//     when it was published; it says nothing about whether anything is due
//     now. Here, urgency comes ONLY from a stated date: a followed change
//     taking effect soon. A major record from last year is history, labelled
//     as such, and keeps its "recorded as major" note.
//
//   • Every "strong" classification counted the same. The classifier calls a
//     body sentence strong when it reads as operative, which let the H-1B and
//     L-1 biometric fee rule match an F-1 follow on a sentence that only
//     defines what F-1 is. Here a match says WHERE the document named the
//     thing — title, summary, or only the body — and a body-only match is
//     shown with its quote and an explicit "may be incidental", never used for
//     urgency, reminders or the calendar. Nothing is deleted: body matches are
//     often right, and the reader can judge from the quote.
//
// Everything below is derived from the record's own fields. Nothing is
// inferred about any person, and no date is created that the record does not
// state.
// =============================================================================

import type { ChangeInput, Classification, PublicChange } from "@/lib/intelligence/change";
import { labelForEntity } from "@/lib/entity-labels";

/** Where a followed item appears in the document. */
export type MatchStrength =
  /** Title, a structured field, the summary, the issuing agency, or a record link. */
  | "named"
  /** Filed under a followed topic by ImmigrationClock's classifier. */
  | "categorized"
  /** Only a sentence in the body. Often right, sometimes incidental. */
  | "mentioned"
  /** A citation, history or comparison passage. Shown only as a possibility. */
  | "weak";

export interface MatchExplanation {
  follow: string;
  label: string;
  strength: MatchStrength;
  /** One sentence a reader can check against the source. */
  reason: string;
  /** The document's own words, when the match rests on a passage. */
  quote: string | null;
}

export type Section = "upcoming" | "current" | "historical";

export interface Urgency {
  label: string;
  tone: "attention" | "info" | "muted";
}

export interface Assessment {
  section: Section;
  urgency: Urgency;
  /** The documented status, in words. */
  status: string;
  matches: MatchExplanation[];
  /** The strongest match strength, or null when only saved. */
  relevance: MatchStrength | null;
  /** True when this record may be used for urgency, reminders and the calendar. */
  primary: boolean;
  /** What changed, from the document's own summary. */
  whatChanged: string;
  dates: { label: string; date: string }[];
  daysUntilEffective: number | null;
  /** Historical significance, kept separate from urgency. */
  recordedMajor: boolean;
}

/** How close "takes effect soon" is. */
export const SOON_DAYS = 30;
/** How long a change counts as current after publication or taking effect. */
export const CURRENT_DAYS = 30;

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""} ${iso.slice(0, 4)}`.trim();

const STRENGTH_RANK: Record<MatchStrength, number> = { named: 0, categorized: 1, mentioned: 2, weak: 3 };

function norm(text: string | null | undefined): string {
  return (text ?? "").replace(/[…]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

const DIMENSIONS = [
  ["visaCategories", "visa"],
  ["countries", "country"],
  ["forms", "form"],
  ["processes", "process"],
] as const;

function placeOf(c: Classification, input: ChangeInput, follow: string): { strength: MatchStrength; where: string } {
  if (c.method === "structured_source") return { strength: "named", where: "in the publisher's structured data" };
  if (c.method === "explicit_source") return { strength: "named", where: "in the title" };
  if (c.method === "derived_weak") return { strength: "weak", where: "only in a citation or historical passage" };
  // derived_high_confidence covers both the summary and an operative body
  // sentence. The classifier does not record which, so it is read back here:
  // the quote appearing in the summary, or the record linking the entity
  // directly, means the document names it up front.
  const quote = norm(c.evidence).slice(0, 80);
  if (quote && norm(input.summary).includes(quote)) return { strength: "named", where: "in the summary" };
  if ((input.entities ?? []).some((e) => e.entityId === follow)) return { strength: "named", where: "in the summary" };
  return { strength: "mentioned", where: "only in the body of the document" };
}

/** Why this record is in the subscriber's Briefing, one line per follow. */
export function explainMatches(
  input: ChangeInput,
  strong: PublicChange,
  weak: PublicChange | null,
  follows: readonly string[]
): MatchExplanation[] {
  const wanted = new Set(follows);
  const out = new Map<string, MatchExplanation>();
  const add = (m: MatchExplanation) => {
    const prev = out.get(m.follow);
    if (!prev || STRENGTH_RANK[m.strength] < STRENGTH_RANK[prev.strength]) out.set(m.follow, m);
  };

  for (const view of [strong, weak]) {
    if (!view) continue;
    for (const [key, prefix] of DIMENSIONS) {
      for (const c of view[key]) {
        const follow = `${prefix}:${c.id}`;
        if (!wanted.has(follow)) continue;
        const { strength, where } = placeOf(c, input, follow);
        const label = labelForEntity(follow);
        add({
          follow,
          label,
          strength,
          quote: c.evidence ?? null,
          reason:
            strength === "named"
              ? `You follow ${label}. The document names it ${where}.`
              : strength === "mentioned"
                ? `You follow ${label}. It appears ${where}, not in the title or summary — this may be incidental. Read the quote before relying on it.`
                : `You follow ${label}. It appears ${where}. This is a possible match only.`,
        });
      }
    }
  }

  if (strong.agency && wanted.has(`agency:${strong.agency}`)) {
    const follow = `agency:${strong.agency}`;
    const label = labelForEntity(follow);
    add({ follow, label, strength: "named", quote: null, reason: `You follow ${label}. It issued this document.` });
  }

  for (const link of input.entities ?? []) {
    if (!link.entityId.startsWith("topic:") || !wanted.has(link.entityId)) continue;
    const label = labelForEntity(link.entityId);
    add({
      follow: link.entityId,
      label,
      strength: "categorized",
      quote: null,
      reason: `You follow ${label}. ImmigrationClock's classifier filed this record under that topic.`,
    });
  }

  return [...out.values()].sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength]);
}

/** The documented status in words. Never more than the record states. */
export function statusText(change: PublicChange, today: string): string {
  const eff = change.effectiveDate;
  switch (change.status) {
    case "proposed":
      return "Proposed — not in force. A proposal can change or never be finalised.";
    case "superseded":
      return "Superseded — a later record amends this one. Read the newer record first.";
    case "decided":
      return "Court decision.";
    case "informational":
      return "Informational — a data release or correction, not a rule.";
    case "scheduled":
      return eff ? `Published; stated to take effect ${eff}.` : "Scheduled.";
    case "in_force":
      return eff && eff <= today
        ? `In effect since ${eff}, per the document.`
        : "Published. The document states no effective date — check the source.";
    default:
      return "See the source.";
  }
}

/** The document's own summary, cut at a sentence boundary. */
/** The publisher's own placeholder when a document has no abstract. */
const NO_ABSTRACT = /^no abstract was published with this document\.?$/i;

export function whatChangedText(input: ChangeInput, max = 280): string {
  const text = (input.summary ?? "").replace(/\s+/g, " ").trim();
  // Saying nothing is better than presenting the placeholder as the change.
  if (!text || NO_ABSTRACT.test(text)) {
    return "The publisher gave no summary for this document. The title is its own description; open the source for the text.";
  }
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return stop > 80 ? cut.slice(0, stop + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

export function assessChange(
  input: ChangeInput,
  strong: PublicChange,
  weak: PublicChange | null,
  follows: readonly string[],
  today: string,
  saved: boolean
): Assessment {
  const matches = explainMatches(input, strong, weak, follows);
  const relevance = matches[0]?.strength ?? null;
  const primary = saved || relevance === "named" || relevance === "categorized";
  const proposed = strong.status === "proposed";

  // A stated effective date is the only source of a future milestone, and a
  // proposed rule never has one we would act on.
  const eff = !proposed ? strong.effectiveDate : null;
  const daysUntil = eff ? days(today, eff) : null;
  const publishedAgo = days(strong.publishedDate, today);

  const dates = [{ label: "Published", date: strong.publishedDate }];
  if (eff) dates.push({ label: daysUntil !== null && daysUntil > 0 ? "Takes effect" : "Took effect", date: eff });

  let section: Section;
  let urgency: Urgency;
  if (strong.status === "superseded") {
    section = "historical";
    urgency = { label: "Superseded", tone: "muted" };
  } else if (daysUntil !== null && daysUntil >= 0) {
    // Every stated date ahead, however distant: a calendar subscription built
    // from this section must not lose a date for being far away.
    section = "upcoming";
    const soon = daysUntil <= SOON_DAYS && primary;
    urgency = {
      label: daysUntil === 0 ? "Takes effect today" : `Takes effect in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
      tone: soon ? "attention" : "info",
    };
  } else if (daysUntil !== null && daysUntil < 0 && -daysUntil <= CURRENT_DAYS) {
    section = "current";
    urgency = { label: `Took effect ${eff}`, tone: "info" };
  } else if (publishedAgo >= 0 && publishedAgo <= CURRENT_DAYS) {
    section = "current";
    urgency = proposed
      ? { label: "New proposal — not in force", tone: "info" }
      : { label: publishedAgo === 0 ? "New today" : `New · ${publishedAgo} day${publishedAgo === 1 ? "" : "s"} ago`, tone: "info" };
  } else {
    section = "historical";
    urgency = { label: `Earlier · ${monthYear(strong.publishedDate)}`, tone: "muted" };
  }

  return {
    section,
    urgency,
    status: statusText(strong, today),
    matches,
    relevance,
    primary,
    whatChanged: whatChangedText(input),
    dates,
    daysUntilEffective: daysUntil,
    recordedMajor: strong.severity === "major",
  };
}
