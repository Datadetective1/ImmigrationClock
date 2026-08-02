// =============================================================================
// CONGRESS ADAPTER (api.congress.gov)
//
// -----------------------------------------------------------------------------
// INTRODUCTION IS NOT CHANGE
// -----------------------------------------------------------------------------
// Roughly 15,000 bills are introduced per Congress and around 2% become law.
// Any member can introduce anything, and immigration bills are introduced
// constantly for position-taking that will never see a committee vote.
//
// A feed that reported introductions as "what changed" would be wrong almost
// every time, and wrong in the direction that frightens people: a reader seeing
// "Bill to end birthright citizenship introduced" has learned that one member
// filed a document, not that anything about their status has changed.
//
// So legislative stage drives severity by explicit rule, and the stage is read
// from the chamber's OWN recorded action, never from the bill's title:
//
//   Became law            -> major    the law actually changed
//   Passed both chambers  -> major    only signature or veto remains
//   Passed one chamber    -> notable  real movement, still not law
//   Reported by committee -> routine  procedural progress
//   Introduced / referred -> EXCLUDED not change, and publishing it implies it is
//
// This mirrors the Federal Courts adapter, which excludes individual petitions
// for the same structural reason: the source publishes far more than it changes.
//
// -----------------------------------------------------------------------------
// WHY THIS NEEDS A KEY, AND WHAT HAPPENS WITHOUT ONE
// -----------------------------------------------------------------------------
// api.congress.gov is the official Library of Congress API and requires a free
// key. The alternatives were measured and rejected:
//
//   • govinfo bulk data is official and keyless, but publishes one XML file per
//     bill — thousands of fetches per build, for a source that moves slowly.
//   • GovTrack is keyless and convenient, but third-party. The source registry
//     reserves that tier for "context and cross-checks only, never a headline
//     figure", and a bill's status is exactly a headline figure.
//   • DEMO_KEY works but is rate-limited to roughly 50 requests a day, which is
//     a demo, not a data pipeline.
//
// With no key the adapter reports "not configured" and returns cleanly. It does
// NOT fail the build: an unconfigured source is a known gap, not an outage, and
// conflating the two would make a real outage harder to see.
// =============================================================================

import { capEvents } from "../adapters";
import type { AdapterContext, AdapterResult, SourceAdapter } from "../adapters";
import type { EventEntityLink, EventSeverity, ImmigrationEvent } from "../events";
import { entityId } from "../entities";
import { resolveEntityMentions } from "../resolve";
import { extractImpact } from "../extract-impact";
import { plainText, containsAnyTerm } from "../text";

const API = "https://api.congress.gov/v3";
const UA = "ImmigrationClock/1.0 (+https://immigrationclock.com)";
const SOURCE_KEY = "congress";

export interface CongressBill {
  congress: number;
  type: string;
  number: string;
  title: string;
  latestAction?: { actionDate?: string; text?: string } | null;
  updateDate?: string | null;
  url?: string | null;
  originChamber?: string | null;
}

/** Where a bill has actually got to. Read from the chamber's recorded action. */
export type LegislativeStage =
  | "became_law"
  | "passed_both"
  | "passed_one"
  | "reported"
  | "introduced";

/**
 * Read the stage from the recorded action text.
 *
 * Order matters: "Became Public Law" also contains "Passed", so the strongest
 * signal has to be tested first or every enacted law would be filed as a
 * chamber vote.
 */
export function stageFromAction(actionText: string | null | undefined): LegislativeStage {
  const t = plainText(actionText ?? "").toLowerCase();
  if (!t) return "introduced";

  if (/became (public )?law|signed by president|public law no/.test(t)) return "became_law";
  if (/veto(ed)? overridden|passed over president'?s veto/.test(t)) return "became_law";
  if (/presented to president|cleared for white house|sent to president/.test(t)) return "passed_both";
  if (/resolving differences|conference report agreed to/.test(t)) return "passed_both";
  if (/passed (house|senate)|agreed to in (house|senate)|on passage passed/.test(t)) return "passed_one";
  if (/reported (by|to) (the )?committee|placed on .*calendar|ordered to be reported/.test(t)) return "reported";
  return "introduced";
}

/**
 * Severity from stage. No prose reading, no model.
 *
 * `major` is reserved for bills that are law or awaiting only a signature —
 * those are the only two states in which something has actually changed for a
 * reader.
 */
export function severity(stage: LegislativeStage): EventSeverity {
  if (stage === "became_law" || stage === "passed_both") return "major";
  if (stage === "passed_one") return "notable";
  return "routine";
}

/**
 * Whether this belongs in the feed at all.
 *
 * Introductions and referrals are excluded outright. They are real documents,
 * but publishing them under "what changed" tells a reader that something
 * changed, and nothing did.
 */
export function isReportable(stage: LegislativeStage): boolean {
  return stage !== "introduced";
}

/**
 * Immigration relevance, from the bill title.
 *
 * Deliberately conservative. Congress covers everything, and a bill that merely
 * mentions "aliens" in a tax provision is not immigration policy.
 */
const RELEVANCE_TERMS = [
  "immigration", "immigrants", "immigrant", "nonimmigrant", "visa", "visas",
  "asylum", "asylee", "asylees", "refugee", "refugees",
  "naturalization", "citizenship", "deportation", "deportations",
  "removal proceedings", "border security", "green card", "permanent resident",
  "temporary protected status", "daca", "dreamer", "dreamers", "dream act",
  "h-1b", "h-2a", "h-2b", "f-1", "j-1", "l-1", "eb-5", "uscis",
  "customs and border", "immigration and customs enforcement",
  "guest worker", "farmworker", "farmworkers", "undocumented",
  "unaccompanied alien children", "birthright citizenship", "chain migration",
  "diversity visa", "sanctuary", "alien", "aliens",
];

export function isImmigrationRelevant(bill: CongressBill): boolean {
  // containsAnyTerm, never String.includes. A bare `includes` on this list would
  // match "ice" inside "Post Office Naming Act" and "alien" inside "alienation".
  return containsAnyTerm(plainText(bill.title ?? ""), RELEVANCE_TERMS);
}

/** e.g. "H.R. 1234" / "S. 56". */
export function billLabel(bill: CongressBill): string {
  const map: Record<string, string> = {
    hr: "H.R.", s: "S.", hjres: "H.J.Res.", sjres: "S.J.Res.",
    hconres: "H.Con.Res.", sconres: "S.Con.Res.", hres: "H.Res.", sres: "S.Res.",
  };
  const t = (bill.type ?? "").toLowerCase();
  return `${map[t] ?? bill.type} ${bill.number}`;
}

export function stableId(bill: CongressBill): string {
  return `${SOURCE_KEY}:${bill.congress}-${(bill.type ?? "").toLowerCase()}-${bill.number}`;
}

export function sourceUrl(bill: CongressBill): string {
  const t = (bill.type ?? "").toLowerCase();
  return `https://www.congress.gov/bill/${bill.congress}th-congress/${
    t.startsWith("h") ? "house" : "senate"
  }-bill/${bill.number}`;
}

const STAGE_LABEL: Record<LegislativeStage, string> = {
  became_law: "Enacted",
  passed_both: "Passed both chambers",
  passed_one: "Passed one chamber",
  reported: "Reported by committee",
  introduced: "Introduced",
};

export function toEvent(bill: CongressBill, stage: LegislativeStage, verifiedAt: string): ImmigrationEvent {
  const links: EventEntityLink[] = [
    {
      entityId: entityId("legislation", `${bill.congress}-${(bill.type ?? "").toLowerCase()}-${bill.number}`),
      relation: "affects",
      basis: "explicit",
      confidence: 1,
    },
    { entityId: entityId("topic", "policy-changes"), relation: "categorized_as", basis: "explicit", confidence: 1 },
  ];

  for (const m of resolveEntityMentions(bill.title ?? "")) {
    if (links.some((l) => l.entityId === m.entityId)) continue;
    links.push({ entityId: m.entityId, relation: "mentions", basis: "matched", confidence: m.confidence });
  }

  const action = plainText(bill.latestAction?.text ?? "");
  const summary =
    `${billLabel(bill)} (${bill.congress}th Congress): ${plainText(bill.title ?? "")}. ` +
    (action ? `Latest recorded action: ${action}` : "No action text was published with this record.");

  const isLaw = stage === "became_law";

  return {
    id: stableId(bill),
    sourceKey: SOURCE_KEY,
    classification: "legislative_action",
    severity: severity(stage),
    title: `${STAGE_LABEL[stage]}: ${billLabel(bill)} — ${plainText(bill.title ?? "")}`,
    summary,
    publishedAt: bill.latestAction?.actionDate ?? bill.updateDate?.slice(0, 10) ?? "",
    // Enactment does not mean the provisions start today, and Congress.gov does
    // not publish an effective date. We do not invent one.
    effectiveAt: null,
    lastVerifiedAt: verifiedAt,
    sourceUrl: sourceUrl(bill),
    entities: links,
    impact: extractImpact({
      title: bill.title ?? "",
      abstract: summary,
      agencyIds: [],
      effectiveAt: null,
    }),
    reviewStatus: "auto",
    limitations: [
      isLaw
        ? "This bill was enacted. When its provisions take effect, and what agencies must do to implement them, are usually set out in the law itself and in later rulemaking — enactment is not the same as being in force."
        : "This bill has NOT become law. It can still be amended, stalled, or fail entirely, and most bills do. Nothing about anyone's status changes because a chamber voted.",
      "Congress.gov publishes no effective date on a bill record, so this event does not assert one.",
      "ImmigrationClock reports bills that have moved past introduction. Introduced and referred bills are excluded — any member can introduce any bill, and roughly 2% become law, so reporting introductions as change would be wrong nearly every time.",
    ],
  };
}

// -----------------------------------------------------------------------------
// Fetch
// -----------------------------------------------------------------------------

/** Read the key at call time so tests and CI can set it per-run. */
export function apiKey(): string | undefined {
  const k = process.env.CONGRESS_API_KEY?.trim();
  return k && k !== "DEMO_KEY" ? k : undefined;
}

async function fetchEvents(ctx: AdapterContext): Promise<AdapterResult> {
  const key = "congress";
  if (ctx.offline) {
    return { adapterKey: key, events: [], warnings: ["offline: skipped"], failed: false };
  }

  const token = apiKey();
  if (!token) {
    // NOT a failure. An unconfigured source is a known gap; a failure means we
    // lost a source we had. Conflating them would hide real outages.
    return {
      adapterKey: key,
      events: [],
      warnings: [
        "CONGRESS_API_KEY is not set, so Congress is not being ingested. Get a free key at https://api.congress.gov and set it in the environment. This is a configuration gap, not a source outage.",
      ],
      failed: false,
    };
  }

  const params = new URLSearchParams({
    format: "json",
    limit: "250",
    sort: "updateDate+desc",
    fromDateTime: `${ctx.since}T00:00:00Z`,
    api_key: token,
  });

  let payload: { bills?: CongressBill[] };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(`${API}/bill?${params}`, {
      headers: { "User-Agent": UA },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      return { adapterKey: key, events: [], warnings: [`HTTP ${res.status} from api.congress.gov`], failed: true };
    }
    payload = await res.json();
  } catch (err) {
    return {
      adapterKey: key,
      events: [],
      warnings: [`fetch failed: ${(err as Error)?.message ?? String(err)}`],
      failed: true,
    };
  }

  const bills = payload.bills ?? [];
  const warnings: string[] = [];
  const events: ImmigrationEvent[] = [];
  let notRelevant = 0;
  let stillIntroduced = 0;
  let undated = 0;

  const verifiedAt = new Date().toISOString().slice(0, 10);

  for (const bill of bills) {
    if (!isImmigrationRelevant(bill)) {
      notRelevant++;
      continue;
    }
    const stage = stageFromAction(bill.latestAction?.text);
    if (!isReportable(stage)) {
      stillIntroduced++;
      continue;
    }
    const e = toEvent(bill, stage, verifiedAt);
    if (!e.publishedAt) {
      undated++;
      continue;
    }
    events.push(e);
  }

  if (notRelevant > 0) warnings.push(`${notRelevant} bill(s) were not immigration-related`);
  if (stillIntroduced > 0) {
    warnings.push(
      `${stillIntroduced} immigration bill(s) excluded as introduced-only — introduction is not change (see adapter header)`
    );
  }
  if (undated > 0) warnings.push(`${undated} bill(s) had no usable action date`);

  const capped = capEvents(events, ctx.limit);
  return {
    adapterKey: key,
    events: capped.events,
    warnings: [...warnings, ...capped.warnings],
    failed: false,
  };
}

export const congressAdapter: SourceAdapter = {
  key: "congress",
  name: "Congress — bills and public laws",
  sourceKey: SOURCE_KEY,
  status: "ready",
  coverage:
    "Immigration bills that have moved past introduction: reported by committee, passed a chamber, or enacted. Introduced and referred bills are excluded — roughly 2% of bills become law, so reporting introductions as change would be wrong nearly every time, and wrong in the direction that alarms readers. Requires a free api.congress.gov key; without one the source reports as unconfigured rather than failing.",
  fetchEvents,
};

export const __testing = {
  stageFromAction,
  severity,
  isReportable,
  isImmigrationRelevant,
  billLabel,
  stableId,
  sourceUrl,
  toEvent,
  apiKey,
};
