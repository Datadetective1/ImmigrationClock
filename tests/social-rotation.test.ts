// =============================================================================
// ROTATION — the fix for a feed that circled six subjects
//
// The dry run was technically correct and editorially broken: dedupe stopped the
// same subject×angle pair, and the Diversity Visa window still won the evening
// slot most days, because it scored the same every day and "highest score" is a
// machine for repetition.
//
// These tests pin the five properties that make the feed move:
//
//   1. A subject cannot dominate consecutive days.
//   2. A topic family cannot quietly occupy the week.
//   3. A LOWER-scoring fresh topic beats a HIGHER-scoring recent one — the
//      inversion is the whole point, and without it the penalties are decoration.
//   4. A countdown is not news. The DV window resurfaces at milestones, not
//      every time the number decrements.
//   5. A day's three slots come from three different families.
//
// The escape hatch is tested too: a genuinely big development still wins against
// its own family's fatigue, because deferring a major fee rule to next week
// would be a worse failure than the repetition this file exists to prevent.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  applyRotation,
  buildMemory,
  keyDateMilestone,
  topicFamilyFor,
  KEY_DATE_MILESTONES,
  PENALTY,
  SUBJECT_BLOCK_DAYS,
  SUBJECT_HEAVY_DAYS,
  type TopicFamily,
} from "@/lib/social/rotation";
import { standingPool } from "@/lib/social/select";
import type { ContentCategory } from "@/lib/social/categories";
import { EMPTY_POST_LEDGER, appendRecords, type PostLedger, type PostRecord } from "@/lib/social/ledger";
import type { IndexedEvent } from "@/lib/event-index";

const NOW = new Date("2026-08-20T14:05:00.000Z");
const TODAY = "2026-08-20";

function daysBefore(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

/**
 * A published row N days ago, with its localDate kept CONSISTENT with its
 * timestamp.
 *
 * Worth the helper: a fixture whose runAtUtc says "two days ago" while its
 * localDate still says today silently triggers the same-day family penalty, and
 * the test then measures the wrong thing while looking correct.
 */
function postedDaysAgo(n: number, over: Partial<PostRecord> = {}): Partial<PostRecord> {
  const iso = daysBefore(n);
  return {
    runAtUtc: iso,
    localDate: iso.slice(0, 10),
    // Distinct by default so topic tests are not also measuring angle or
    // destination fatigue.
    angle: "who_is_affected",
    deepLink: "https://immigrationclock.com/prior",
    ...over,
  };
}

function record(over: Partial<PostRecord>): PostRecord {
  return {
    localDate: TODAY,
    localTime: "09:05",
    runAtUtc: NOW.toISOString(),
    slot: "morning",
    pool: "news",
    platform: "x",
    decision: "POSTED",
    reason: "Published",
    subjectId: "event:1",
    subjectLabel: "A rule",
    angle: "breaking_change",
    score: 2200,
    text: "t",
    deepLink: "https://immigrationclock.com/a",
    externalId: null,
    externalUrl: null,
    model: "m",
    promptVersion: null,
    validatorVersion: null,
    factsHash: null,
    approvalId: null,
    approvedBy: null,
    topicKey: null,
    topicFamily: null,
    category: null,
    adjustedScore: null,
    rotationExplain: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    attempts: null,
    ...over,
  };
}

const ledgerOf = (...rows: Partial<PostRecord>[]): PostLedger =>
  appendRecords(EMPTY_POST_LEDGER, rows.map(record));

const memoryOf = (ledger: PostLedger, localDate = TODAY) =>
  buildMemory(ledger, "x", NOW, localDate);

function rank(
  input: {
    subjectId: string;
    topicFamily: TopicFamily;
    category?: ContentCategory;
    deepLink?: string;
    baseScore: number;
    hasNewInformation?: boolean;
  },
  ledger: PostLedger,
  localDate = TODAY
) {
  return applyRotation(
    {
      subjectId: input.subjectId,
      topicFamily: input.topicFamily,
      category: input.category ?? "development",
      deepLink: input.deepLink ?? "https://immigrationclock.com/z",
      angle: "breaking_change",
      baseScore: input.baseScore,
      hasNewInformation: input.hasNewInformation ?? true,
    },
    memoryOf(ledger, localDate)
  );
}

// -----------------------------------------------------------------------------

describe("1 — a subject cannot dominate consecutive days", () => {
  it("blocks a subject posted inside the block window", () => {
    for (const age of [0, 1, 3, 6]) {
      const ledger = ledgerOf(postedDaysAgo(age, { subjectId: "keydate:dv-lottery" }));
      const r = rank({ subjectId: "keydate:dv-lottery", topicFamily: "green-card", baseScore: 3000 }, ledger);
      expect(r.eligible, `${age}d`).toBe(false);
      expect(r.blockedBy).toMatch(/subject-recency/);
    }
  });

  it("heavily penalises it in the 8–14 day band rather than blocking", () => {
    const ledger = ledgerOf(postedDaysAgo(10, { subjectId: "s" }));
    const r = rank({ subjectId: "s", topicFamily: "green-card", baseScore: 3000 }, ledger);
    expect(r.eligible).toBe(true);
    expect(r.penalty).toBeGreaterThanOrEqual(PENALTY.subjectHeavy);
    expect(r.adjustedScore).toBeLessThan(3000);
  });

  it("after 14 days, requires something new to say", () => {
    const ledger = ledgerOf(postedDaysAgo(20, { subjectId: "asset:layoffs" }));
    const stale = rank(
      { subjectId: "asset:layoffs", topicFamily: "employment", baseScore: 3000, hasNewInformation: false },
      ledger
    );
    expect(stale.eligible).toBe(false);
    expect(stale.blockedBy).toMatch(/no new information/);

    const fresh = rank(
      { subjectId: "asset:layoffs", topicFamily: "employment", baseScore: 3000, hasNewInformation: true },
      ledger
    );
    expect(fresh.eligible).toBe(true);
  });

  it("lets a subject back with no penalty once it is truly old", () => {
    const ledger = ledgerOf(postedDaysAgo(40, { subjectId: "asset:layoffs" }));
    const r = rank(
      { subjectId: "asset:layoffs", topicFamily: "data-trends", baseScore: 1000, hasNewInformation: false },
      ledger
    );
    expect(r.eligible).toBe(true);
    expect(r.penalty).toBe(0);
  });

  it("keeps the bands in the documented order", () => {
    expect(SUBJECT_BLOCK_DAYS).toBeLessThan(SUBJECT_HEAVY_DAYS);
  });
});

describe("2 — a topic family cannot quietly occupy the week", () => {
  it("penalises a family used in the last few days", () => {
    const ledger = ledgerOf(postedDaysAgo(2, { topicFamily: "h1b" }));
    const r = rank({ subjectId: "new", topicFamily: "h1b", baseScore: 2500 }, ledger);
    expect(r.penalty).toBe(PENALTY.topicRecent);
  });

  it("penalises it less once it is further back", () => {
    const ledger = ledgerOf(postedDaysAgo(6, { topicFamily: "h1b" }));
    const r = rank({ subjectId: "new", topicFamily: "h1b", baseScore: 2500 }, ledger);
    expect(r.penalty).toBe(PENALTY.topicOlder);
  });

  it("leaves an untouched family alone", () => {
    const ledger = ledgerOf(postedDaysAgo(1, { topicFamily: "h1b" }));
    const r = rank({ subjectId: "new", topicFamily: "enforcement", baseScore: 2500 }, ledger);
    expect(r.penalty).toBe(0);
  });

  it("stacks destination and angle penalties on top", () => {
    const ledger = ledgerOf(
      postedDaysAgo(2, {
        topicFamily: "fees",
        deepLink: "https://immigrationclock.com/x",
        angle: "breaking_change",
      })
    );
    const r = rank(
      { subjectId: "new", topicFamily: "fees", deepLink: "https://immigrationclock.com/x", baseScore: 3000 },
      ledger
    );
    expect(r.penalty).toBe(PENALTY.topicRecent + PENALTY.destination + PENALTY.angle);
  });
});

describe("3 — a fresh topic beats a higher-scoring recent one", () => {
  it("inverts the ranking, which is the entire point of the change", () => {
    // Yesterday was H-1B. Today an H-1B item scores 3000 and an enforcement item
    // scores 2400. Raw score picks H-1B again; adjusted score does not.
    const ledger = ledgerOf(postedDaysAgo(1, { topicFamily: "h1b" }));

    const stale = rank({ subjectId: "a", topicFamily: "h1b", baseScore: 3000 }, ledger);
    const fresh = rank({ subjectId: "b", topicFamily: "enforcement", baseScore: 2400 }, ledger);

    expect(stale.adjustedScore).toBeLessThan(fresh.adjustedScore);
    expect(3000).toBeGreaterThan(2400); // the raw order really was the other way
  });

  it("still lets a genuinely major development win against its own fatigue", () => {
    // The escape hatch requirement 3 asks for. A fee rule that lands today must
    // not be deferred because fees were the topic on Tuesday.
    const ledger = ledgerOf(postedDaysAgo(2, { topicFamily: "fees" }));
    const major = rank({ subjectId: "big", topicFamily: "fees", baseScore: 3400 }, ledger);
    const minor = rank({ subjectId: "small", topicFamily: "data-trends", baseScore: 1200 }, ledger);
    expect(major.adjustedScore).toBeGreaterThan(minor.adjustedScore);
  });
});

describe("4 — a countdown is not news", () => {
  it("resurfaces a recurring date only at milestones", () => {
    expect(keyDateMilestone(60)).toBe("60 days away");
    expect(keyDateMilestone(30)).toBe("30 days away");
    expect(keyDateMilestone(1)).toBe("1 day away");
    // The days in between are not content.
    for (const days of [59, 53, 44, 31, 20, 13, 8, 5, 2]) {
      expect(keyDateMilestone(days), `${days}d`).toBeNull();
    }
  });

  it("keeps the DV window out of the evening pool on non-milestone days", () => {
    // 2026-08-20 is 42 days from the 1 October window — not a milestone.
    const pool = standingPool(TODAY).filter((c) => c.subjectId === "keydate:dv-lottery");
    expect(pool).toHaveLength(0);
  });

  it("lets it back on a milestone day", () => {
    // 2026-09-01 is 30 days out.
    const pool = standingPool("2026-09-01").filter((c) => c.subjectId === "keydate:dv-lottery");
    expect(pool.length).toBeGreaterThan(0);
    expect(pool[0].label).toContain("30 days away");
  });

  it("does not publish the DV window on most days of a month", () => {
    // The failure being fixed: it used to qualify every single day.
    let qualifying = 0;
    for (let d = 0; d < 30; d++) {
      const date = new Date(Date.parse("2026-08-15T00:00:00Z") + d * 86_400_000)
        .toISOString()
        .slice(0, 10);
      if (standingPool(date).some((c) => c.subjectId === "keydate:dv-lottery")) qualifying++;
    }
    expect(qualifying).toBeGreaterThan(0);
    expect(qualifying).toBeLessThanOrEqual(KEY_DATE_MILESTONES.length);
  });
});

describe("5 — a day's slots come from different families", () => {
  it("penalises a family already used today", () => {
    const ledger = ledgerOf(postedDaysAgo(0, { topicFamily: "enforcement", localDate: TODAY }));
    const r = rank({ subjectId: "new", topicFamily: "enforcement", baseScore: 3000 }, ledger);
    // Same-day and same-week penalties both apply — being today's family twice
    // is worse than being this week's family twice.
    expect(r.penalty).toBeGreaterThanOrEqual(PENALTY.sameDayFamily);
  });

  it("weighs a same-day repeat more heavily than a same-week one", () => {
    expect(PENALTY.sameDayFamily).toBeGreaterThan(PENALTY.topicRecent);
  });

  it("does not carry today's families into tomorrow's same-day check", () => {
    const ledger = ledgerOf(postedDaysAgo(1, { topicFamily: "enforcement" }));
    const r = rank({ subjectId: "new", topicFamily: "enforcement", baseScore: 3000 }, ledger, TODAY);
    expect(r.penalty).toBe(PENALTY.topicRecent); // week fatigue only, not same-day
  });
});

describe("topic families are assigned readably", () => {
  const ev = (over: Partial<IndexedEvent>) => ({ entityIds: [], ...over }) as unknown as IndexedEvent;

  it("files key dates by their own category", () => {
    expect(topicFamilyFor({ subjectId: "keydate:dv-lottery", topicKey: "", keyDateCategory: "green-card" })).toBe("green-card");
    expect(topicFamilyFor({ subjectId: "keydate:h1b-registration", topicKey: "", keyDateCategory: "h1b" })).toBe("h1b");
  });

  it("files assets by their tags", () => {
    expect(topicFamilyFor({ subjectId: "asset:layoffs", topicKey: "", assetTags: ["layoffs"] })).toBe("employment");
    expect(topicFamilyFor({ subjectId: "asset:migration-map", topicKey: "", assetTags: ["map", "data"] })).toBe("data-trends");
  });

  it("gives fees their own family, because they cut across every visa type", () => {
    const e = ev({ title: "Fee Adjustment for Benefit Requests", summary: "", sourceKey: "federal_register" });
    expect(topicFamilyFor({ subjectId: "event:1", topicKey: "source:federal_register", event: e })).toBe("fees");
  });

  it("does not let every Federal Register document become one family", () => {
    const h1b = ev({ title: "H-1B rule", sourceKey: "federal_register" });
    const enforcement = ev({ title: "Removal proceedings notice", sourceKey: "federal_register" });
    const a = topicFamilyFor({ subjectId: "event:1", topicKey: "visa:h-1b", event: h1b });
    const b = topicFamilyFor({ subjectId: "event:2", topicKey: "topic:enforcement", event: enforcement });
    expect(a).toBe("h1b");
    expect(b).toBe("enforcement");
    expect(a).not.toBe(b);
  });
});
