// =============================================================================
// CADENCE — one useful post a day, without a quota
//
// The policy in cadence.ts is the whole of "how often". These tests pin its
// shape against the ledger states that produce it: a quiet day, a news day, a
// day whose post is already out, a breaking day, a week that has used up its
// evergreen and follow-up allowances. Every number here is a ceiling; nothing
// in the policy can manufacture a post.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  decideCadence,
  eligibleGroups,
  isBreakingCandidate,
  mayHaveBreakingNews,
  creditsDepletedToday,
  MAX_DAILY_POSTS,
  MAX_BREAKING_POSTS_PER_DAY,
  MAX_POSTS_PER_DAY,
  MIN_SPACING_HOURS,
  MAX_FOLLOW_UPS_PER_7_DAYS,
  MAX_EVERGREEN_PER_7_DAYS,
} from "@/lib/social/cadence";
import { SLOT_BY_ID } from "@/lib/social/slots";
import { EMPTY_POST_LEDGER, appendRecords, type PostLedger, type PostRecord } from "@/lib/social/ledger";
import type { ContentType } from "@/lib/social/content-types";
import type { Candidate } from "@/lib/social/types";

const daily = SLOT_BY_ID.get("daily")!;
const breaking = SLOT_BY_ID.get("breaking")!;

/** A published X row of one content type at one instant. */
function posted(
  runAtUtc: string,
  contentType: ContentType,
  localDate = runAtUtc.slice(0, 10),
  slot: PostRecord["slot"] = "daily"
): PostRecord {
  return {
    localDate,
    localTime: "09:05",
    runAtUtc,
    slot,
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
const AT_12 = new Date("2026-09-10T17:05:00Z"); // 12:05 CDT
const AT_15 = new Date("2026-09-10T20:05:00Z"); // 15:05 CDT
const AT_18 = new Date("2026-09-10T23:05:00Z"); // 18:05 CDT

/** Just the fields the cadence reads from a candidate. */
function candidate(over: {
  tier?: Candidate["tier"];
  contentType?: Candidate["contentType"];
  severity?: string;
  publishedAt?: string;
  subjectId?: string;
}): Candidate {
  return {
    subjectId: over.subjectId ?? "event:x",
    tier: over.tier ?? "news",
    contentType: over.contentType ?? "breaking_change",
    event:
      over.severity === undefined && over.publishedAt === undefined && over.tier === "evergreen"
        ? null
        : { id: "x", severity: over.severity ?? "major", publishedAt: over.publishedAt ?? TODAY },
  } as unknown as Candidate;
}

describe("the shape of the day", () => {
  it("is one post, plus at most one breaking post, never more", () => {
    expect(MAX_DAILY_POSTS).toBe(1);
    expect(MAX_BREAKING_POSTS_PER_DAY).toBe(1);
    expect(MAX_POSTS_PER_DAY).toBe(2);
  });
});

describe("a quiet day, daily window", () => {
  it("offers every tier, so a quiet day can still carry one useful explainer or data insight", () => {
    const d = decideCadence({ ledger: EMPTY_POST_LEDGER, platform: "x", slot: daily, localDate: TODAY, now: AT_9 });
    expect(d.blocked).toBe(false);
    expect(d.breakingOnly).toBe(false);
    expect(d.allowedTiers).toEqual(["news", "follow_up", "evergreen"]);
  });

  it("tries every news candidate before any explainer, whatever their scores", () => {
    const d = decideCadence({ ledger: EMPTY_POST_LEDGER, platform: "x", slot: daily, localDate: TODAY, now: AT_9 });
    const explainer = candidate({ tier: "evergreen", contentType: "explainer", subjectId: "explainer:a" });
    const news = candidate({ tier: "news", contentType: "what_changed", severity: "notable", subjectId: "event:n" });
    const groups = eligibleGroups([explainer, news], d, TODAY);
    expect(groups.map((g) => g.map((c) => c.subjectId))).toEqual([["event:n"], ["explainer:a"]]);
  });
});

describe("a day whose post is out", () => {
  it("closes the daily window for the rest of the day — a late firing cannot add a second routine post", () => {
    const ledger = ledgerOf(posted("2026-09-10T14:10:00Z", "explainer"));
    const d = decideCadence({ ledger, platform: "x", slot: daily, localDate: TODAY, now: AT_12 });
    expect(d.blocked).toBe(true);
    expect(d.explain).toMatch(/Today's post already went out/);
  });

  it("counts a post made under the old three-window design the same way", () => {
    const ledger = ledgerOf(posted("2026-09-10T13:10:00Z", "breaking_change", TODAY, "morning"));
    const d = decideCadence({ ledger, platform: "x", slot: daily, localDate: TODAY, now: AT_12 });
    expect(d.blocked).toBe(true);
  });

  it("still lets the breaking window consider a major development", () => {
    const ledger = ledgerOf(posted("2026-09-10T14:10:00Z", "breaking_change"));
    const d = decideCadence({ ledger, platform: "x", slot: breaking, localDate: TODAY, now: AT_18 });
    expect(d.blocked).toBe(false);
    expect(d.breakingOnly).toBe(true);
    expect(d.allowedTiers).toEqual(["news"]);
  });

  it("enforces the spacing rule between two posts", () => {
    const ledger = ledgerOf(posted("2026-09-10T18:30:00Z", "breaking_change"));
    const d = decideCadence({ ledger, platform: "x", slot: breaking, localDate: TODAY, now: AT_15 });
    expect(d.blocked).toBe(true);
    expect(d.explain).toMatch(new RegExp(`minimum spacing is ${MIN_SPACING_HOURS}h`));
  });

  it("allows one breaking post a day, not two", () => {
    const ledger = ledgerOf(posted("2026-09-10T19:10:00Z", "breaking_change", TODAY, "breaking"));
    const d = decideCadence({ ledger, platform: "x", slot: breaking, localDate: TODAY, now: new Date("2026-09-11T01:05:00Z") });
    expect(d.blocked).toBe(true);
    expect(d.explain).toMatch(/breaking post already went out/);
  });

  it("stops at the daily maximum whatever the queue holds", () => {
    const ledger = ledgerOf(
      posted("2026-09-10T13:10:00Z", "breaking_change"),
      posted("2026-09-10T19:30:00Z", "breaking_change", TODAY, "evening")
    );
    const d = decideCadence({ ledger, platform: "x", slot: breaking, localDate: TODAY, now: new Date("2026-09-11T01:05:00Z") });
    expect(d.blocked).toBe(true);
    expect(d.allowedTiers).toEqual([]);
    expect(d.explain).toMatch(/Daily maximum/);
  });
});

describe("the breaking window", () => {
  const open = decideCadence({ ledger: EMPTY_POST_LEDGER, platform: "x", slot: breaking, localDate: TODAY, now: AT_15 });

  it("accepts a major breaking change from today or yesterday", () => {
    expect(isBreakingCandidate(candidate({ publishedAt: TODAY }), TODAY)).toBe(true);
    expect(isBreakingCandidate(candidate({ publishedAt: "2026-09-09" }), TODAY)).toBe(true);
    expect(eligibleGroups([candidate({})], open, TODAY)).toHaveLength(1);
  });

  it("refuses anything older, anything not major, and every other kind of post", () => {
    expect(isBreakingCandidate(candidate({ publishedAt: "2026-09-08" }), TODAY)).toBe(false);
    expect(isBreakingCandidate(candidate({ severity: "notable" }), TODAY)).toBe(false);
    expect(isBreakingCandidate(candidate({ contentType: "what_changed" }), TODAY)).toBe(false);
    expect(isBreakingCandidate(candidate({ tier: "follow_up", contentType: "why_it_matters" }), TODAY)).toBe(false);
    expect(isBreakingCandidate(candidate({ tier: "evergreen", contentType: "explainer" }), TODAY)).toBe(false);
    expect(
      eligibleGroups(
        [
          candidate({ severity: "notable" }),
          candidate({ tier: "evergreen", contentType: "data_signal" }),
          candidate({ tier: "follow_up", contentType: "effective_date" }),
        ],
        open,
        TODAY
      )
    ).toEqual([]);
  });
});

describe("the gate's cheap checks", () => {
  const events = [
    { id: "a", severity: "major", publishedAt: "2026-09-09" },
    { id: "b", severity: "notable", publishedAt: TODAY },
    { id: "c", severity: "major", publishedAt: "2026-09-01" },
  ];

  it("lets a breaking firing through only when a recent major record is unposted", () => {
    expect(mayHaveBreakingNews(events, EMPTY_POST_LEDGER, "x", TODAY)).toBe(true);
    const done = ledgerOf({ ...posted("2026-09-10T14:10:00Z", "breaking_change"), subjectId: "event:a" });
    expect(mayHaveBreakingNews(events, done, "x", TODAY)).toBe(false);
    expect(mayHaveBreakingNews(events.slice(1), EMPTY_POST_LEDGER, "x", TODAY)).toBe(false);
  });

  it("recognises a depleted X balance today, and only today", () => {
    const refused: PostRecord = {
      ...posted("2026-09-10T14:10:00Z", "breaking_change"),
      decision: "SKIPPED_PUBLISH_FAILED",
      reason: "X API credits depleted (HTTP 402). Top up the pay-per-use balance in the X developer portal.",
    };
    expect(creditsDepletedToday(ledgerOf(refused), TODAY, "x")).not.toBeNull();
    expect(creditsDepletedToday(ledgerOf(refused), "2026-09-11", "x")).toBeNull();
    expect(creditsDepletedToday(ledgerOf({ ...refused, reason: "X returned HTTP 503" }), TODAY, "x")).toBeNull();
  });
});

describe("follow-ups", () => {
  it("caps follow-ups over a rolling week so a quiet week goes to the evergreen tier", () => {
    const ledger = ledgerOf(
      posted("2026-09-07T14:10:00Z", "why_it_matters"),
      posted("2026-09-08T14:10:00Z", "effective_date"),
      posted("2026-09-09T14:10:00Z", "key_date")
    );
    const d = decideCadence({ ledger, platform: "x", slot: daily, localDate: TODAY, now: AT_9 });
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
      rows.push(posted(`2026-09-0${9 - i}T14:10:00Z`, "explainer"));
    }
    const ledger = ledgerOf(...rows);
    const d = decideCadence({ ledger, platform: "x", slot: daily, localDate: TODAY, now: AT_9 });
    expect(d.allowedTiers).not.toContain("evergreen");
    expect(d.explain).toMatch(new RegExp(`ceiling ${MAX_EVERGREEN_PER_7_DAYS}`));
  });

  it("reads only POSTED rows, so a dry run consumes no allowance", () => {
    const dry = { ...posted("2026-09-10T14:10:00Z", "explainer"), decision: "DRY_RUN" as const };
    const d = decideCadence({ ledger: ledgerOf(dry), platform: "x", slot: daily, localDate: TODAY, now: AT_12 });
    expect(d.postsToday).toBe(0);
    expect(d.allowedTiers).toContain("evergreen");
  });

  it("is evaluated per platform", () => {
    const li = { ...posted("2026-09-10T14:10:00Z", "explainer"), platform: "linkedin" as const };
    const d = decideCadence({ ledger: ledgerOf(li), platform: "x", slot: daily, localDate: TODAY, now: AT_12 });
    expect(d.postsToday).toBe(0);
    expect(d.blocked).toBe(false);
  });
});

describe("rows without a content type", () => {
  it("count as posts for spacing and the daily maximum but belong to no tier", () => {
    const old = { ...posted("2026-09-10T14:10:00Z", "explainer"), contentType: null };
    const d = decideCadence({ ledger: ledgerOf(old), platform: "x", slot: breaking, localDate: TODAY, now: AT_18 });
    expect(d.postsToday).toBe(1);
    expect(d.followUpsToday).toBe(0);
    expect(d.evergreenLast7Days).toBe(0);
  });
});
