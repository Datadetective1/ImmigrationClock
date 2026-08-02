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
//
// -----------------------------------------------------------------------------
// COVERAGE IS ENACTED LAW, AND THAT WAS MEASURED
// -----------------------------------------------------------------------------
// The obvious query — /bill sorted by updateDate — does not work. Measured
// against the live API on 2026-08-02: of the 250 most recently updated bills,
// 250 were still at "introduced". Recently-updated skews almost entirely to
// fresh introductions, because introduction is itself an update. An adapter
// built on it would report zero events forever while appearing to run fine.
//
// So this reads /law/{congress}, which returns exactly the bills that became
// public law. Every one is unambiguously `became_law`, and enactment is the
// stage that actually changes what the law says.
//
// Bills that have passed one chamber are NOT comprehensively tracked. The API
// offers no filter for legislative stage, and finding them would mean paginating
// the whole corpus on every build. That gap is stated in the adapter's warnings
// and coverage rather than papered over.
//
// -----------------------------------------------------------------------------
// WHY EACH LAW COSTS A SECOND REQUEST
// -----------------------------------------------------------------------------
// Relevance comes from the CRS-assigned policy area, which appears only on the
// bill DETAIL endpoint. That enrichment is not optional: matching titles alone
// scored ZERO immigration laws across the 104 public laws of the 119th Congress,
// because Congress names legislation after people and slogans. The Laken Riley
// Act and the Secure America Act are both immigration statutes whose titles
// contain no immigration word.
//
// The cost is bounded by `ctx.knownIds`: an enacted law never changes, so a warm
// store re-fetches nothing and only new laws cost a request.
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
  /**
   * CRS-assigned policy area, e.g. { name: "Immigration" }. Present only on the
   * bill DETAIL endpoint, which is why the adapter enriches each law rather than
   * trusting the list.
   */
  policyArea?: { name?: string } | null;
  /** Public law numbers, present once enacted. */
  laws?: { number?: string; type?: string }[] | null;
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

/**
 * Immigration relevance.
 *
 * POLICY AREA IS AUTHORITATIVE. Congress assigns every bill a single policy area
 * through the Congressional Research Service, and "Immigration" is one of them.
 * That is the publisher's own taxonomy — the same kind of signal as USCIS's
 * Policy Alert label or a court's nature-of-suit code — and it beats anything we
 * could infer.
 *
 * IT ALSO FIXES A REAL MISS. Title matching alone scored ZERO immigration laws
 * across the 104 public laws of the 119th Congress, because Congress names
 * legislation after people and slogans: the Laken Riley Act and the Secure
 * America Act are both immigration statutes whose titles contain no immigration
 * word at all. A platform tracking immigration policy that misses the Laken
 * Riley Act is failing at the thing it exists to do.
 *
 * The title check is kept as a secondary signal, for bills whose policy area is
 * something else but which carry immigration provisions in the title.
 */
export function isImmigrationRelevant(bill: CongressBill): boolean {
  if (bill.policyArea?.name?.trim().toLowerCase() === "immigration") return true;
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

/**
 * Which Congress covers a given year.
 *
 * The 1st Congress sat in 1789 and each runs two years, so 2025 and 2026 are
 * both the 119th. Computed rather than hardcoded, so this does not quietly stop
 * finding new laws in January 2027.
 */
export function congressForYear(year: number): number {
  return Math.floor((year - 1789) / 2) + 1;
}

/** Every Congress touching the window, newest first. */
export function congressesInRange(since: string, now = new Date()): number[] {
  const startYear = Number(since.slice(0, 4));
  const endYear = now.getUTCFullYear();
  if (!Number.isFinite(startYear)) return [congressForYear(endYear)];
  const first = congressForYear(startYear);
  const last = congressForYear(endYear);
  const out: number[] = [];
  for (let c = last; c >= first && out.length < 4; c--) out.push(c);
  return out;
}

async function getJson(url: string, timeoutMs = 30_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from api.congress.gov`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Every public law enacted by a Congress. Around 100–400 per Congress. */
async function listLaws(congress: number, token: string): Promise<CongressBill[]> {
  const params = new URLSearchParams({ format: "json", limit: "250", api_key: token });
  const payload = (await getJson(`${API}/law/${congress}?${params}`)) as { bills?: CongressBill[] };
  return (payload.bills ?? []).map((b) => ({ ...b, congress }));
}

/**
 * Fetch a bill's detail, which is the only place the CRS policy area appears.
 *
 * One request per law. That is why `ctx.knownIds` matters: a warm store skips
 * everything it already has, so the steady-state cost is the handful of laws
 * enacted since the last run.
 */
async function fetchBillDetail(bill: CongressBill, token: string): Promise<CongressBill | null> {
  const type = (bill.type ?? "").toLowerCase();
  const params = new URLSearchParams({ format: "json", api_key: token });
  const payload = (await getJson(
    `${API}/bill/${bill.congress}/${type}/${bill.number}?${params}`,
    20_000
  )) as { bill?: CongressBill };
  if (!payload.bill) return null;
  // Keep the list's congress, which the detail endpoint echoes but we already trust.
  return { ...bill, ...payload.bill, congress: bill.congress };
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

  const warnings: string[] = [];
  const verifiedAt = new Date().toISOString().slice(0, 10);
  const events: ImmigrationEvent[] = [];
  let notRelevant = 0;
  let undated = 0;
  let enrichFailures = 0;
  let skippedKnown = 0;

  for (const congress of congressesInRange(ctx.since)) {
    let laws: CongressBill[];
    try {
      laws = await listLaws(congress, token);
    } catch (err) {
      return {
        adapterKey: key,
        events: [],
        warnings: [...warnings, `fetch failed for the ${congress}th Congress: ${(err as Error)?.message ?? String(err)}`],
        failed: true,
      };
    }

    for (const law of laws) {
      // An enacted law never changes, so once it is in the store there is
      // nothing to re-read — and skipping it avoids a detail request.
      if (ctx.knownIds?.has(stableId(law))) {
        skippedKnown++;
        continue;
      }
      if (law.latestAction?.actionDate && law.latestAction.actionDate < ctx.since) continue;

      // Policy area lives on the detail endpoint only, and it is the whole
      // reason this adapter finds the Laken Riley Act at all.
      let detailed = law;
      try {
        detailed = (await fetchBillDetail(law, token)) ?? law;
      } catch {
        enrichFailures++;
      }

      if (!isImmigrationRelevant(detailed)) {
        notRelevant++;
        continue;
      }
      const stage = stageFromAction(detailed.latestAction?.text);
      if (!isReportable(stage)) continue;

      const e = toEvent(detailed, stage, verifiedAt);
      if (!e.publishedAt) {
        undated++;
        continue;
      }
      events.push(e);
    }
  }

  if (skippedKnown > 0) {
    warnings.push(`${skippedKnown} enacted law(s) already in the store were not re-fetched`);
  }
  if (notRelevant > 0) warnings.push(`${notRelevant} enacted law(s) were not immigration-related`);
  if (undated > 0) warnings.push(`${undated} law(s) had no usable action date`);
  if (enrichFailures > 0) {
    warnings.push(
      `${enrichFailures} law(s) could not be enriched with their policy area and were judged on title alone`
    );
  }
  warnings.push(
    "Coverage is ENACTED LAW. Bills that have passed one chamber but are not yet law are not comprehensively " +
      "tracked: the API offers no way to filter by legislative stage, and a sweep of recently-updated bills " +
      "returns almost entirely fresh introductions (measured: 250 of 250)."
  );

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
    "Immigration laws ENACTED by Congress, read from the official /law endpoint so every item is unambiguously public law. Relevance comes from the CRS-assigned policy area rather than the title, because Congress names legislation after people and slogans — the Laken Riley Act is an immigration statute whose title contains no immigration word. Bills short of enactment are NOT comprehensively tracked: the API cannot filter by legislative stage, and a sweep of recently-updated bills returns almost entirely fresh introductions (measured: 250 of 250). Requires a free api.congress.gov key; without one the source reports as unconfigured rather than failing.",
  fetchEvents,
};

export const __testing = {
  congressForYear,
  congressesInRange,
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
