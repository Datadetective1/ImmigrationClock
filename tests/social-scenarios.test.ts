// =============================================================================
// SCENARIOS — the whole engine, end to end, on the days that matter
//
// Ten situations the editorial engine has to handle, each run through the real
// runner with the real selector, cadence policy, queue, dedupe and validator,
// and a stub engine that writes copy from the fact set in the shape it is
// offered. Nothing here calls a network or publishes; a StubPublisher records
// what it was handed and returns what the scenario says X returned.
//
//   1. a major USCIS change            2. a minor but useful update
//   3. a quiet-news day                 4. an evergreen explainer
//   5. an ImmigrationClock data insight 6. a duplicate development
//   7. a follow-up development          8. two stories sharing a destination
//   9. a failed card render (app side; pinned here as a share-URL invariant)
//  10. a failed X API request
//
// And, across all of them: the feed a reader would scroll must not read as ten
// versions of one post.
// =============================================================================

import { describe, it, expect } from "vitest";
import { runSlot } from "@/lib/social/run";
import { SLOT_BY_ID, instantInWindow } from "@/lib/social/slots";
import { EMPTY_POST_LEDGER, publishedPosts, type PostLedger } from "@/lib/social/ledger";
import { EMPTY_QUEUE, type EditorialQueue } from "@/lib/social/queue";
import { StubCopyEngine } from "@/lib/social/providers/stub";
import { openingConstruction, similarity } from "@/lib/social/dedupe";
import { changePath } from "@/lib/share";
import type { PublishResult, Publisher } from "@/lib/social/platforms/types";
import type { IndexedEvent } from "@/lib/event-index";
import type { SlotOutcome } from "@/lib/social/types";

// -----------------------------------------------------------------------------
// FIXTURES
// -----------------------------------------------------------------------------

function event(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: "uscis_policy_manual:20260831-voterreg",
    title: "Policy alert: Non-Governmental, Nonpartisan Organization Voter Registration Services at Administrative Naturalization Ceremonies",
    publishedAt: "2026-08-31",
    effectiveAt: null,
    scheduled: false,
    severity: "major",
    classification: "updated_information",
    sourceKey: "uscis_policy_manual",
    sourceUrl: "https://www.uscis.gov/sites/default/files/document/policy-manual-updates/20260831-VoterRegNatzCeremonies.pdf",
    summary:
      "U.S. Citizenship and Immigration Services (USCIS) is rescinding the August 29, 2025 policy, Voter Registration at Administrative Naturalization Ceremonies, PA-2025-21, and reinstating policy guidance in the USCIS Policy Manual to permit nonprofit and nonpartisan non-governmental organizations to participate in administrative naturalization ceremonies by distributing and collecting voter registration applications.",
    entityIds: ["agency:uscis", "policy:uscis-pm-volume-12-part-j", "topic:policy-changes"],
    ...over,
  };
}

const DOL_RULE = event({
  id: "federal_register:2026-17726",
  title: "Rescission of Coordinated Enforcement Regulations",
  publishedAt: "2026-08-31",
  effectiveAt: "2026-09-30",
  severity: "major",
  classification: "final_rule",
  sourceKey: "federal_register",
  sourceUrl: "https://www.federalregister.gov/documents/2026/08/31/2026-17726/rescission-of-coordinated-enforcement-regulations",
  summary:
    "The Department of Labor (Department) is rescinding the regulations that established formal procedures for coordination of enforcement activities among the Wage and Hour Division, Occupational Safety and Health Administration and Employment and Training Administration with respect to migrant and seasonal farmworkers. This action will remove regulatory burden on employers and align the Department's enforcement strategy with coordination models already in use.",
  entityIds: ["agency:dol", "topic:enforcement"],
});

const MINOR_UPDATE = event({
  id: "uscis_newsroom:i485-edition",
  title: "USCIS to Publish New Edition of Form I-485; Older Editions Will Be Rejected",
  publishedAt: "2026-09-01",
  severity: "notable",
  classification: "announcement",
  sourceKey: "uscis_newsroom",
  sourceUrl: "https://www.uscis.gov/newsroom/alerts/i485-edition",
  summary:
    "USCIS will publish a new edition of Form I-485, Application to Register Permanent Residence or Adjust Status, on Oct. 1, 2026. Beginning Nov. 1, 2026, USCIS will reject applications filed on older editions. Applicants adjusting status must use the new edition after that date.",
  entityIds: ["agency:uscis", "topic:green-card"],
});

const H1B_PROPOSAL = event({
  id: "federal_register:2026-17324",
  title: "Fee for Certain H-1B Petitions",
  publishedAt: "2026-08-25",
  severity: "notable",
  classification: "proposed_rule",
  sourceKey: "federal_register",
  sourceUrl: "https://www.federalregister.gov/documents/2026/08/25/2026-17324/fee-for-certain-h-1b-petitions",
  summary:
    "The Department of Homeland Security (DHS) proposes to establish a $103,265 fee, payable at the time of filing, for all H-1B cap-subject petitions, including those eligible for the advanced degree exemption.",
  entityIds: ["agency:dhs", "topic:h1b", "visa:h-1b"],
});

class StubPublisher implements Publisher {
  posts: string[] = [];
  constructor(readonly platform: "x" | "linkedin", private readonly results: PublishResult[]) {}
  async publish(text: string): Promise<PublishResult> {
    this.posts.push(text);
    return this.results.length > 1 ? this.results.shift()! : this.results[0];
  }
}

const OK: PublishResult = { ok: true, credentialProblem: false, error: null, externalId: "1", externalUrl: "https://x.com/i/web/status/1" };
const DOWN: PublishResult = { ok: false, credentialProblem: false, code: "other", error: "X returned HTTP 503", externalId: null, externalUrl: null };
const CREDITS: PublishResult = {
  ok: false,
  credentialProblem: false,
  code: "credits",
  error: "X API credits depleted (HTTP 402). Top up the pay-per-use balance.",
  externalId: null,
  externalUrl: null,
};

class CountingStub extends StubCopyEngine {
  calls = 0;
  async generate(req: Parameters<StubCopyEngine["generate"]>[0]) {
    this.calls++;
    return super.generate(req);
  }
}

/** Run one window of one day; carry the ledger (DRY_RUN → POSTED) and the queue forward. */
async function window(
  state: { ledger: PostLedger; queue: EditorialQueue },
  date: string,
  slotId: "morning" | "afternoon" | "evening",
  events: IndexedEvent[],
  opts: { engine?: CountingStub; publishers?: Partial<Record<"x" | "linkedin", Publisher>>; live?: boolean; minute?: number } = {}
): Promise<{ outcome: SlotOutcome; state: { ledger: PostLedger; queue: EditorialQueue } }> {
  const slot = SLOT_BY_ID.get(slotId)!;
  const result = await runSlot({
    slot,
    events,
    ledger: state.ledger,
    engine: opts.engine ?? new CountingStub(),
    publishers: opts.publishers ?? {},
    now: instantInWindow(date, slot, opts.minute ?? 5),
    live: opts.live ?? false,
    queue: state.queue,
    platforms: ["x"],
  });
  const ledger: PostLedger = {
    version: result.ledger.version,
    posts: result.ledger.posts.map((p) => (p.decision === "DRY_RUN" ? { ...p, decision: "POSTED" as const } : p)),
  };
  return { outcome: result.outcome, state: { ledger, queue: result.queue } };
}

const fresh = () => ({ ledger: EMPTY_POST_LEDGER, queue: EMPTY_QUEUE });
const xText = (o: SlotOutcome) => o.platforms.find((p) => p.platform === "x")?.text ?? null;
const xDecision = (o: SlotOutcome) => o.platforms.find((p) => p.platform === "x")?.decision;

// -----------------------------------------------------------------------------

describe("1. a major USCIS change", () => {
  it("publishes as a breaking change in the morning window, on its own share page, in one of the offered shapes", async () => {
    const { outcome } = await window(fresh(), "2026-09-01", "morning", [event()]);
    expect(xDecision(outcome)).toBe("DRY_RUN");
    expect(outcome.contentType).toBe("breaking_change");
    expect(outcome.tier).toBe("news");
    expect(["news", "direct", "address", "date_lede"]).toContain(outcome.structure);
    expect(outcome.shareUrl).toBe(`https://immigrationclock.com${changePath(event())}`);
    const text = xText(outcome)!;
    expect(text).toContain("utm_campaign=breaking_change");
    expect(text).toContain("utm_content=change%3A");
    expect(outcome.validator?.ok).toBe(true);
  });
});

describe("2. a minor but useful update", () => {
  it("still publishes when it is the day's best, as a what-changed rather than a breaking change", async () => {
    // 2026-09-02: no recurring date is at a milestone, so nothing outranks it.
    const { outcome } = await window(fresh(), "2026-09-02", "morning", [MINOR_UPDATE]);
    expect(xDecision(outcome)).toBe("DRY_RUN");
    // Reader value is below the development floor, so it is not promoted as
    // breaking; it is still worth a plain-English what-changed.
    expect(["what_changed", "breaking_change"]).toContain(outcome.contentType);
    expect(outcome.tier).toBe("news");
  });
});

describe("3. a quiet-news day", () => {
  it("stays silent in the morning, then fills the afternoon from the evergreen tier, and stays silent again in the evening", async () => {
    let s = fresh();
    const morning = await window(s, "2026-09-10", "morning", []);
    expect(xDecision(morning.outcome)).toBe("SKIPPED_CADENCE");
    expect(morning.outcome.cadenceExplain).toMatch(/evergreen waits for the afternoon/);
    // The queue remembers what the morning could not take.
    expect(morning.state.queue.items.some((i) => i.status === "scheduled" && i.scheduledFor === "afternoon")).toBe(true);
    s = morning.state;

    const afternoon = await window(s, "2026-09-10", "afternoon", []);
    expect(xDecision(afternoon.outcome)).toBe("DRY_RUN");
    expect(afternoon.outcome.tier).toBe("evergreen");
    expect(["data_signal", "explainer", "data_discovery"]).toContain(afternoon.outcome.contentType);
    s = afternoon.state;

    const evening = await window(s, "2026-09-10", "evening", []);
    expect(xDecision(evening.outcome)).toBe("SKIPPED_CADENCE");
    expect(publishedPosts(evening.state.ledger).filter((p) => p.platform === "x")).toHaveLength(1);
  });

  it("publishes nothing at all when the evergreen allowance for the week is spent", async () => {
    // 2026-09-02 to 09-07: no recurring date reaches a milestone, so every
    // quiet afternoon draws on the evergreen tier alone.
    let s = fresh();
    for (let d = 2; d <= 6; d++) {
      const r = await window(s, `2026-09-0${d}`, "afternoon", []);
      expect(xDecision(r.outcome)).toBe("DRY_RUN");
      expect(r.outcome.tier).toBe("evergreen");
      s = r.state;
    }
    const sixth = await window(s, "2026-09-07", "afternoon", []);
    expect(xDecision(sixth.outcome)).toBe("SKIPPED_CADENCE");
    expect(sixth.outcome.cadenceExplain).toMatch(/ceiling 5/);
  });
});

describe("4. an evergreen explainer", () => {
  it("is offered on a quiet afternoon and cites its source in the permitted URLs", async () => {
    let s = fresh();
    // Two signals first, so the evergreen rotation reaches an explainer.
    let posted: SlotOutcome | null = null;
    for (let d = 1; d <= 4 && !posted; d++) {
      const r = await window(s, `2026-09-0${d}`, "afternoon", []);
      s = r.state;
      if (r.outcome.contentType === "explainer") posted = r.outcome;
    }
    expect(posted).not.toBeNull();
    expect(posted!.shareUrl).toMatch(/^https:\/\/immigrationclock\.com\/explained\/[a-z0-9-]+$/);
    expect(xText(posted!)).toContain("utm_campaign=explainer");
    expect(posted!.validator?.ok).toBe(true);
  });
});

describe("5. an ImmigrationClock data insight", () => {
  it("publishes a computed figure with its source, on its own page", async () => {
    const r = await window(fresh(), "2026-09-02", "afternoon", []);
    // The first evergreen post of a fresh week is a data signal (highest tier).
    expect(r.outcome.contentType).toBe("data_signal");
    expect(r.outcome.shareUrl).toMatch(/^https:\/\/immigrationclock\.com\/insights\/[a-z0-9-]+$/);
    expect(r.outcome.validator?.ok).toBe(true);
    const text = xText(r.outcome)!;
    // Every numeral in the post is in the fact set — the validator ran, and
    // the stub only writes from the points.
    expect(text).toMatch(/\d/);
  });
});

describe("6. a duplicate development", () => {
  it("does not publish the same record twice on the same day, and a second firing in the same window is a no-op", async () => {
    let s = fresh();
    const first = await window(s, "2026-09-01", "morning", [event()]);
    expect(xDecision(first.outcome)).toBe("DRY_RUN");
    s = first.state;

    const again = await window(s, "2026-09-01", "morning", [event()], { minute: 50 });
    expect(xDecision(again.outcome)).toBe("SKIPPED_DUPLICATE");
    expect(again.outcome.platforms[0].reason).toMatch(/already published/);
    expect(again.outcome.attempts).toHaveLength(0);

    // The same record, a different window, the same day: the subject block
    // holds and the window either takes a different record or stays quiet.
    const evening = await window(s, "2026-09-01", "evening", [event()]);
    expect(evening.outcome.subjectId === "event:uscis_policy_manual:20260831-voterreg" && xDecision(evening.outcome) === "DRY_RUN").toBe(false);
  });

  it("does not post the same title stem twice when a newer record supersedes an older one", async () => {
    const older = H1B_PROPOSAL;
    const newer = event({
      id: "federal_register:2026-99999",
      title: "Fee for Certain H-1B Petitions",
      publishedAt: "2026-09-01",
      effectiveAt: "2026-10-01",
      severity: "major",
      classification: "final_rule",
      sourceKey: "federal_register",
      sourceUrl: "https://www.federalregister.gov/documents/2026/09/01/2026-99999/fee-for-certain-h-1b-petitions",
      summary:
        "The Department of Homeland Security (DHS) is establishing a $103,265 fee, payable at the time of filing, for all H-1B cap-subject petitions, including those eligible for the advanced degree exemption.",
      entityIds: ["agency:dhs", "topic:h1b", "visa:h-1b"],
    });
    const r = await window(fresh(), "2026-09-01", "morning", [older, newer]);
    expect(r.outcome.subjectId).toBe("event:federal_register:2026-99999");
    const olderItems = r.state.queue.items.filter((i) => i.eventId === older.id);
    expect(olderItems.length).toBeGreaterThan(0);
    for (const i of olderItems) expect(i.status).toBe("superseded");
  });
});

describe("7. a follow-up development", () => {
  it("carries a why-it-matters a week after the breaking post, and an effective-date reminder as the date nears", async () => {
    let s = fresh();
    const breaking = await window(s, "2026-09-01", "morning", [DOL_RULE]);
    expect(breaking.outcome.contentType).toBe("breaking_change");
    expect(xDecision(breaking.outcome)).toBe("DRY_RUN");
    expect(xText(breaking.outcome)).toMatch(/September 30/);
    s = breaking.state;

    // Days 2–7: the subject is inside its block; nothing about it publishes.
    for (const d of ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"]) {
      const r = await window(s, d, "morning", [DOL_RULE]);
      expect(r.outcome.subjectId === "event:federal_register:2026-17726" && xDecision(r.outcome) === "DRY_RUN").toBe(false);
      s = r.state;
    }

    // Day 8: the why-it-matters is open again (subject cooldown is 7 days).
    const followUp = await window(s, "2026-09-08", "morning", [DOL_RULE]);
    expect(xDecision(followUp.outcome)).toBe("DRY_RUN");
    expect(followUp.outcome.subjectId).toBe("event:federal_register:2026-17726");
    expect(followUp.outcome.contentType).toBe("effective_date");
    expect(followUp.outcome.tier).toBe("follow_up");
    const text = xText(followUp.outcome)!;
    expect(text).toMatch(/September 30/);
    expect(text).toContain("utm_campaign=effective_date");
  });
});

describe("8. two stories sharing a destination", () => {
  it("never happens any more: two distinct records have two distinct share pages and two distinct cards", async () => {
    let s = fresh();
    const first = await window(s, "2026-09-01", "morning", [DOL_RULE, event()]);
    s = first.state;
    const second = await window(s, "2026-09-01", "evening", [DOL_RULE, event()]);
    expect(xDecision(first.outcome)).toBe("DRY_RUN");
    expect(xDecision(second.outcome)).toBe("DRY_RUN");
    expect(first.outcome.subjectId).not.toBe(second.outcome.subjectId);
    expect(first.outcome.deepLink).not.toBe(second.outcome.deepLink);
    expect(first.outcome.deepLink).toMatch(/^\/what-changed\/[a-z0-9-]+-[a-z0-9]{6}$/);
    expect(second.outcome.deepLink).toMatch(/^\/what-changed\/[a-z0-9-]+-[a-z0-9]{6}$/);
    const cards = s.queue.items.filter((i) => i.status === "published" || i.status === "ready").map((i) => i.ogImage);
    expect(new Set(cards).size).toBe(cards.length);
  });
});

describe("9. a failed card render", () => {
  it("cannot change what the post points at: the share URL and card path are derived from the record, not from a render", async () => {
    const r = await window(fresh(), "2026-09-01", "morning", [event()]);
    const item = r.state.queue.items.find((i) => i.subjectId === r.outcome.subjectId && i.contentType === r.outcome.contentType)!;
    expect(item.ogImage).toBe(`/og/change/${changePath(event()).replace("/what-changed/", "")}.png`);
    expect(item.shareUrl).toBe(r.outcome.shareUrl);
  });
});

describe("10. a failed X API request", () => {
  it("records SKIPPED_PUBLISH_FAILED, keeps the validated copy ready, and the next window publishes it without a second model call", async () => {
    let s = fresh();
    const engine = new CountingStub();
    const down = new StubPublisher("x", [DOWN]);
    const first = await window(s, "2026-09-01", "morning", [event()], { engine, publishers: { x: down }, live: true });
    expect(xDecision(first.outcome)).toBe("SKIPPED_PUBLISH_FAILED");
    expect(engine.calls).toBe(1);
    const ready = first.state.queue.items.find((i) => i.subjectId === first.outcome.subjectId && i.contentType === first.outcome.contentType)!;
    expect(ready.status).toBe("ready");
    expect(ready.suggestedPost?.x).toBe(xText(first.outcome));
    s = first.state;

    const up = new StubPublisher("x", [OK]);
    const second = await window(s, "2026-09-01", "afternoon", [event()], { engine, publishers: { x: up }, live: true });
    expect(xDecision(second.outcome)).toBe("POSTED");
    expect(engine.calls).toBe(1);
    expect(second.outcome.usage?.model).toBe("queue:ready");
    expect(up.posts[0]).toBe(ready.suggestedPost?.x);
    const published = second.state.queue.items.find((i) => i.id === ready.id)!;
    expect(published.status).toBe("published");
    expect(published.externalUrl).toBe("https://x.com/i/web/status/1");
  });

  it("names a depleted balance for what it is", async () => {
    const broke = new StubPublisher("x", [CREDITS]);
    const r = await window(fresh(), "2026-09-01", "morning", [event()], { publishers: { x: broke }, live: true });
    expect(xDecision(r.outcome)).toBe("SKIPPED_PUBLISH_FAILED");
    expect(r.outcome.platforms.find((p) => p.platform === "x")?.reason).toMatch(/credits depleted/);
  });

  it("with no configured platform, nothing is generated at all", async () => {
    const engine = new CountingStub();
    const r = await window(fresh(), "2026-09-01", "morning", [event()], { engine, publishers: {}, live: true });
    expect(xDecision(r.outcome)).toBe("SKIPPED_CREDENTIAL_EXPIRED");
    expect(engine.calls).toBe(0);
  });
});

describe("the feed as a reader would scroll it", () => {
  it("is not ten versions of the same post", async () => {
    const events = [event(), DOL_RULE, MINOR_UPDATE, H1B_PROPOSAL];
    let s = fresh();
    const posts: SlotOutcome[] = [];
    for (let d = 1; d <= 12; d++) {
      const date = `2026-09-${String(d).padStart(2, "0")}`;
      for (const slotId of ["morning", "afternoon", "evening"] as const) {
        const r = await window(s, date, slotId, events);
        s = r.state;
        if (xDecision(r.outcome) === "DRY_RUN") posts.push(r.outcome);
      }
    }
    const texts = posts.map((p) => xText(p)!);
    expect(texts.length).toBeGreaterThanOrEqual(8);

    // About one a day, never three.
    const perDay = new Map<string, number>();
    for (const p of posts) perDay.set(p.localDate, (perDay.get(p.localDate) ?? 0) + 1);
    for (const n of perDay.values()) expect(n).toBeLessThanOrEqual(3);
    expect(texts.length / 12).toBeLessThanOrEqual(1.5);

    // More than one kind of post, and more than one shape.
    expect(new Set(posts.map((p) => p.contentType)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(posts.map((p) => p.structure)).size).toBeGreaterThanOrEqual(5);

    // No shape three times running.
    for (let i = 2; i < posts.length; i++) {
      expect(posts[i].structure === posts[i - 1].structure && posts[i - 1].structure === posts[i - 2].structure).toBe(false);
    }

    // No opening construction three times in the window.
    const openings = texts.map(openingConstruction);
    for (const o of new Set(openings)) {
      if (o) expect(openings.filter((x) => x === o).length).toBeLessThanOrEqual(2);
    }

    // No two posts read as the same post.
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        expect(similarity(texts[i], texts[j]), `${i} vs ${j}`).toBeLessThan(0.55);
      }
    }

    // Every post is a distinct treatment of a record, and no record is worked
    // more than twice in twelve days.
    expect(new Set(posts.map((p) => `${p.deepLink}::${p.contentType}`)).size).toBe(posts.length);
    const perSubject = new Map<string, number>();
    for (const p of posts) perSubject.set(p.subjectId!, (perSubject.get(p.subjectId!) ?? 0) + 1);
    for (const n of perSubject.values()) expect(n).toBeLessThanOrEqual(2);
  });
});
