// =============================================================================
// CADENCE — about one useful post a day, without a quota
//
// The policy in cadence.ts is the whole of "how often". These tests pin its
// shape against the ledger states that produce it: a quiet day, a news day, a
// day that already carried two posts, a week that has used up its evergreen
// and follow-up allowances. Every number here is a ceiling; nothing in the
// policy can manufacture a post.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  decideCadence,
  MAX_POSTS_PER_DAY,
  MIN_SPACING_HOURS,
  MAX_FOLLOW_UPS_PER_DAY,
  MAX_FOLLOW_UPS_PER_7_DAYS,
  MAX_EVERGREEN_PER_7_DAYS,
  EVERGREEN_WINDOWS,
} from "@/lib/social/cadence";
import { SLOT_BY_ID } from "@/lib/social/slots";
import { EMPTY_POST_LEDGER, appendRecords, type PostLedger, type PostRecord } from "@/lib/social/ledger";
import type { ContentType } from "@/lib/social/content-types";

const morning = SLOT_BY_ID.get("morning")!;
const afternoon = SLOT_BY_ID.get("afternoon")!;
const evening = SLOT_BY_ID.get("evening")!;

/** A published X row of one content type at one instant. */
function posted(runAtUtc: string, contentType: ContentType, localDate = runAtUtc.slice(0, 10)): PostRecord {
  return {
    localDate,
    localTime: "09:05",
    runAtUtc,
    slot: "morning",
    pool: "news",
    platform: "x",
    decision: "POSTED",
    reason: "Published",
    subjectId: `event:${contentType}:${runAtUtc}`,
    subjectLabel: contentType,
    angle: "breaking_change",
    score: 1,
    text: "x",
    deepLink: "/what-changed/x",
    externalId: null,
    externalUrl: null,
    model: null,
    promptVersion: null,
    validatorVersion: null,
    factsHash: null,
    approvalId: null,
    approvedBy: null,
    topicKey: null,
    topicFamily: null,
    category: null,
    readerValue: null,
    readerValueExplain: null,
    treatment: null,
    contentType,
    tier: null,
    structure: null,
    storyKey: null,
    shareUrl: null,
    cadenceExplain: null,
    adjustedScore: null,
    rotationExplain: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    attempts: null,
  };
}

function ledgerOf(...rows: PostRecord[]): PostLedger {
  return appendRecords(EMPTY_POST_LEDGER, rows);
}

const TODAY = "2026-09-10";
const AT_9 = new Date("2026-09-10T14:05:00Z"); // 09:05 CDT
const AT_14 = new Date("2026-09-10T19:05:00Z"); // 14:05 CDT
const AT_18 = new Date("2026-09-10T23:05:00Z"); // 18:05 CDT

describe("a quiet day", () => {
  it("lets news publish in the morning but makes evergreen wait for the afternoon", () => {
    const d = decideCadence({ ledger: EMPTY_POST_LEDGER, platform: "x", slot: morning, localDate: TODAY, now: AT_9 });
    expect(d.blocked).toBe(false);
    expect(d.allowedTiers).toContain("news");
    expect(d.allowedTiers).toContain("follow_up");
    expect(d.allowedTiers).not.toContain("evergreen");
    expect(d.explain).toMatch(/evergreen waits for the afternoon/);
  });

  it("opens the evergreen tier in the afternoon when nothing has published", () => {
    const d = decideCadence({ ledger: EMPTY_POST_LEDGER, platform: "x", slot: afternoon, localDate: TODAY, now: AT_14 });
    expect(d.allowedTiers).toEqual(["news", "follow_up", "evergreen"]);
  });

  it("never opens the evergreen tier in a window outside EVERGREEN_WINDOWS", () => {
    expect(EVERGREEN_WINDOWS).not.toContain("morning");
    for (const slot of [morning]) {
      const d = decideCadence({ ledger: EMPTY_POST_LEDGER, platform: "x", slot, localDate: TODAY, now: AT_9 });
      expect(d.allowedTiers).not.toContain("evergreen");
    }
  });
});

describe("a news day", () => {
  it("closes the evergreen tier once anything has published today", () => {
    const ledger = ledgerOf(posted("2026-09-10T14:10:00Z", "breaking_change"));
    const d = decideCadence({ ledger, platform: "x", slot: evening, localDate: TODAY, now: AT_18 });
    expect(d.allowedTiers).toContain("news");
    expect(d.allowedTiers).not.toContain("evergreen");
    expect(d.explain).toMatch(/not quiet/);
  });

  it("still lets a second, distinct development publish the same day", () => {
    const ledger = ledgerOf(posted("2026-09-10T14:10:00Z", "breaking_change"));
    const d = decideCadence({ ledger, platform: "x", slot: evening, localDate: TODAY, now: AT_18 });
    expect(d.blocked).toBe(false);
    expect(d.allowedTiers).toContain("news");
  });

  it("enforces the spacing rule between two posts", () => {
    const ledger = ledgerOf(posted("2026-09-10T18:30:00Z", "breaking_change"));
    const d = decideCadence({ ledger, platform: "x", slot: afternoon, localDate: TODAY, now: AT_14 });
    expect(d.blocked).toBe(true);
    expect(d.explain).toMatch(new RegExp(`minimum spacing is ${MIN_SPACING_HOURS}h`));
  });

  it("stops at the daily maximum whatever the queue holds", () => {
    const ledger = ledgerOf(
      posted("2026-09-10T13:10:00Z", "breaking_change"),
      posted("2026-09-10T16:20:00Z", "breaking_change"),
      posted("2026-09-10T19:30:00Z", "breaking_change")
    );
    const d = decideCadence({ ledger, platform: "x", slot: evening, localDate: TODAY, now: new Date("2026-09-11T00:30:00Z") });
    expect(MAX_POSTS_PER_DAY).toBe(3);
    expect(d.blocked).toBe(true);
    expect(d.allowedTiers).toEqual([]);
    expect(d.explain).toMatch(/Daily maximum/);
  });
});

describe("follow-ups", () => {
  it("allows one follow-up a day and no more", () => {
    expect(MAX_FOLLOW_UPS_PER_DAY).toBe(1);
    const ledger = ledgerOf(posted("2026-09-10T14:10:00Z", "why_it_matters"));
    const d = decideCadence({ ledger, platform: "x", slot: evening, localDate: TODAY, now: AT_18 });
    expect(d.allowedTiers).not.toContain("follow_up");
    expect(d.explain).toMatch(/follow-ups wait/);
  });

  it("caps follow-ups over a rolling week so a quiet week goes to the evergreen tier", () => {
    const ledger = ledgerOf(
      posted("2026-09-07T14:10:00Z", "why_it_matters"),
      posted("2026-09-08T14:10:00Z", "effective_date"),
      posted("2026-09-09T14:10:00Z", "key_date")
    );
    const d = decideCadence({ ledger, platform: "x", slot: afternoon, localDate: TODAY, now: AT_14 });
    expect(MAX_FOLLOW_UPS_PER_7_DAYS).toBe(3);
    expect(d.allowedTiers).not.toContain("follow_up");
    expect(d.allowedTiers).toContain("evergreen");
    expect(d.explain).toMatch(/ceiling 3/);
  });
});

describe("evergreen", () => {
  it("caps evergreen posts over a rolling week", () => {
    const rows: PostRecord[] = [];
    // The five days before today, all inside the rolling week.
    for (let i = 0; i < MAX_EVERGREEN_PER_7_DAYS; i++) {
      rows.push(posted(`2026-09-0${9 - i}T19:10:00Z`, "explainer"));
    }
    const ledger = ledgerOf(...rows);
    const d = decideCadence({ ledger, platform: "x", slot: afternoon, localDate: TODAY, now: AT_14 });
    expect(d.allowedTiers).not.toContain("evergreen");
    expect(d.explain).toMatch(new RegExp(`ceiling ${MAX_EVERGREEN_PER_7_DAYS}`));
  });

  it("reads only POSTED rows, so a dry run consumes no allowance", () => {
    const dry = { ...posted("2026-09-10T14:10:00Z", "explainer"), decision: "DRY_RUN" as const };
    const d = decideCadence({ ledger: ledgerOf(dry), platform: "x", slot: evening, localDate: TODAY, now: AT_18 });
    expect(d.postsToday).toBe(0);
    expect(d.allowedTiers).toContain("evergreen");
  });

  it("is evaluated per platform", () => {
    const li = { ...posted("2026-09-10T14:10:00Z", "explainer"), platform: "linkedin" as const };
    const d = decideCadence({ ledger: ledgerOf(li), platform: "x", slot: evening, localDate: TODAY, now: AT_18 });
    expect(d.postsToday).toBe(0);
  });
});

describe("rows without a content type", () => {
  it("count as posts for spacing and the daily maximum but belong to no tier", () => {
    const old = { ...posted("2026-09-10T14:10:00Z", "explainer"), contentType: null };
    const d = decideCadence({ ledger: ledgerOf(old), platform: "x", slot: evening, localDate: TODAY, now: AT_18 });
    expect(d.postsToday).toBe(1);
    expect(d.followUpsToday).toBe(0);
    expect(d.evergreenLast7Days).toBe(0);
  });
});
