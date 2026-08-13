// =============================================================================
// DEDUPE
//
// The rule this file pins down is the one that changed after review: a subject
// is NOT banned forever once posted. The same underlying development can carry
// several legitimate treatments over time, and uniqueness is
// (subject × angle × platform × cooldown) rather than subject alone.
//
// So the tests come in pairs: the repetition that must be blocked, and the
// legitimate second treatment that must not be.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  checkSubject,
  checkWording,
  similarity,
  trigrams,
  normalizeForComparison,
  subjectKind,
  COOLDOWNS,
  URL_COOLDOWN_DAYS,
  SIMILARITY_LIMIT,
  VALIDATION_COOLDOWN_DAYS,
} from "@/lib/social/dedupe";
import { EMPTY_POST_LEDGER, appendRecords, type PostLedger, type PostRecord } from "@/lib/social/ledger";
import type { Angle, Platform, PoolId } from "@/lib/social/types";

function record(over: Partial<PostRecord> = {}): PostRecord {
  return {
    localDate: "2026-08-01",
    localTime: "09:05",
    runAtUtc: "2026-08-01T14:05:00.000Z",
    slot: "morning",
    pool: "news",
    platform: "x",
    decision: "POSTED",
    reason: "Published",
    subjectId: "event:federal_register:1",
    subjectLabel: "A rule",
    angle: "breaking_change",
    score: 2200,
    text: "A rule changed today and here is what it does. https://immigrationclock.com/a",
    deepLink: "https://immigrationclock.com/a",
    externalId: "1",
    externalUrl: null,
    model: "test",
    promptVersion: "test",
    validatorVersion: "test",
    factsHash: "abc",
    approvalId: null,
    approvedBy: null,
    topicKey: null,
    topicFamily: null,
    adjustedScore: null,
    rotationExplain: null,
    inputTokens: 1,
    outputTokens: 1,
    costUsd: 0,
    ...over,
  };
}

const ledgerWith = (...records: PostRecord[]): PostLedger =>
  appendRecords(EMPTY_POST_LEDGER, records);

const check = (
  ledger: PostLedger,
  angles: Angle[],
  now: string,
  opts: { subjectId?: string; platform?: Platform; deepLink?: string; pool?: PoolId } = {}
) =>
  checkSubject(
    ledger,
    opts.subjectId ?? "event:federal_register:1",
    angles,
    opts.platform ?? "x",
    opts.deepLink ?? "https://immigrationclock.com/a",
    new Date(now),
    opts.pool ?? "news"
  );

describe("subjectKind", () => {
  it("classifies by id prefix", () => {
    expect(subjectKind("event:federal_register:1")).toBe("event");
    expect(subjectKind("keydate:dv-lottery")).toBe("keydate");
    expect(subjectKind("asset:timeline")).toBe("asset");
  });
});

describe("the same treatment never repeats", () => {
  it("blocks an identical subject+angle+platform that already published", () => {
    const l = ledgerWith(record());
    // 40 days later — well past every subject cooldown.
    const r = check(l, ["breaking_change"], "2026-09-10T14:05:00Z");
    expect(r.ok).toBe(false);
  });

  it("does not block the same subject+angle on the OTHER platform", () => {
    const l = ledgerWith(record({ platform: "x" }));
    const r = check(l, ["breaking_change"], "2026-09-10T14:05:00Z", { platform: "linkedin" });
    expect(r.ok).toBe(true);
  });
});

describe("a second angle on the same subject is legitimate", () => {
  it("allows a different angle once the subject cooldown has passed", () => {
    const l = ledgerWith(record());
    const r = check(l, ["who_is_affected"], "2026-08-20T14:05:00Z", { pool: "knowledge" });
    expect(r.ok).toBe(true);
    expect(r.availableAngles).toEqual(["who_is_affected"]);
  });

  it("blocks a different angle DURING the subject cooldown", () => {
    const l = ledgerWith(record());
    // 3 days later; the event subject cooldown is 14. A different destination is
    // used so the URL cooldown — which would also block — is not what answers.
    const r = check(l, ["who_is_affected"], "2026-08-04T14:05:00Z", {
      pool: "knowledge",
      deepLink: "https://immigrationclock.com/other",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("Subject cooldown");
  });

  it("returns only the angles still open, not a bare yes/no", () => {
    const l = ledgerWith(record({ angle: "breaking_change" }));
    const r = check(l, ["breaking_change", "who_is_affected"], "2026-09-10T14:05:00Z");
    expect(r.ok).toBe(true);
    expect(r.availableAngles).toEqual(["who_is_affected"]);
  });

  it("stops at the treatment cap", () => {
    const angles: Angle[] = [
      "breaking_change",
      "who_is_affected",
      "what_changed_from_previous",
      "effective_date_reminder",
    ];
    const l = ledgerWith(
      ...angles.map((angle, i) =>
        record({ angle, runAtUtc: `2026-0${i + 1}-01T14:05:00.000Z` })
      )
    );
    expect(COOLDOWNS.event.maxTreatments).toBe(4);
    const r = check(l, ["historical_context"], "2026-12-01T14:05:00Z");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("Treatment cap");
  });
});

describe("durable subjects behave differently from events", () => {
  it("an event's treatment never comes back", () => {
    expect(COOLDOWNS.event.treatmentCooldownDays).toBe(Infinity);
  });

  it("a key date's treatment comes back after roughly a year", () => {
    const l = ledgerWith(
      record({ subjectId: "keydate:dv-lottery", angle: "deadline_approaching", pool: "standing" })
    );
    const soon = check(l, ["deadline_approaching"], "2026-11-01T14:05:00Z", {
      subjectId: "keydate:dv-lottery",
      pool: "standing",
    });
    expect(soon.ok).toBe(false);

    const nextYear = check(l, ["deadline_approaching"], "2027-08-01T14:05:00Z", {
      subjectId: "keydate:dv-lottery",
      pool: "standing",
    });
    expect(nextYear.ok).toBe(true);
  });

  it("a standing asset can be resurfaced after a few months", () => {
    const l = ledgerWith(
      record({ subjectId: "asset:timeline", angle: "data_insight", pool: "standing" })
    );
    const later = check(l, ["data_insight"], "2027-01-01T14:05:00Z", {
      subjectId: "asset:timeline",
      pool: "standing",
    });
    expect(later.ok).toBe(true);
  });

  it("a standing asset is not resurfaced within three weeks", () => {
    const l = ledgerWith(
      record({ subjectId: "asset:timeline", angle: "data_insight", pool: "standing" })
    );
    const soon = check(l, ["data_insight"], "2026-08-10T14:05:00Z", {
      subjectId: "asset:timeline",
      pool: "standing",
    });
    expect(soon.ok).toBe(false);
  });
});

describe("URL cooldown", () => {
  it("blocks a different subject that lands on the same page", () => {
    const l = ledgerWith(record({ subjectId: "event:a", pool: "knowledge" }));
    const r = check(l, ["who_is_affected"], "2026-08-03T14:05:00Z", {
      subjectId: "event:b",
      pool: "knowledge",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("URL cooldown");
  });

  it("clears after the cooldown", () => {
    const l = ledgerWith(record({ subjectId: "event:a", pool: "knowledge" }));
    const past = new Date(Date.parse("2026-08-01T14:05:00Z") + (URL_COOLDOWN_DAYS + 1) * 86_400_000);
    const r = check(l, ["who_is_affected"], past.toISOString(), {
      subjectId: "event:b",
      pool: "knowledge",
    });
    expect(r.ok).toBe(true);
  });

  it("NEWS is not blocked by a standing post on the same page", () => {
    // The priority inversion found in the seven-day simulation: a breaking rule
    // was suppressed because the evening slot had linked the same page days
    // earlier. New official developments outrank reference resurfacing.
    const l = ledgerWith(record({ subjectId: "asset:h1b-top-sponsors", pool: "standing" }));
    const r = check(l, ["breaking_change"], "2026-08-03T14:05:00Z", {
      subjectId: "event:new",
      pool: "news",
    });
    expect(r.ok).toBe(true);
  });

  it("but news IS still blocked by other news on the same page", () => {
    const l = ledgerWith(record({ subjectId: "event:a", pool: "news" }));
    const r = check(l, ["breaking_change"], "2026-08-03T14:05:00Z", {
      subjectId: "event:b",
      pool: "news",
    });
    expect(r.ok).toBe(false);
  });
});

describe("validation-failure cooldown", () => {
  it("stands a treatment down after the validator rejected it", () => {
    // Without this, an unpublishable candidate is re-chosen every day and the
    // slot produces nothing forever.
    const l = ledgerWith(record({ decision: "SKIPPED_VALIDATION_FAILED", text: null }));
    const r = check(l, ["breaking_change"], "2026-08-02T14:05:00Z");
    expect(r.ok).toBe(false);
  });

  it("lets it back after the cooldown", () => {
    const l = ledgerWith(record({ decision: "SKIPPED_VALIDATION_FAILED", text: null }));
    const past = new Date(
      Date.parse("2026-08-01T14:05:00Z") + (VALIDATION_COOLDOWN_DAYS + 1) * 86_400_000
    );
    // Use a different destination so the URL cooldown is not what answers.
    const r = check(l, ["breaking_change"], past.toISOString(), {
      deepLink: "https://immigrationclock.com/b",
    });
    expect(r.ok).toBe(true);
  });

  it("a skip does not consume a treatment", () => {
    const l = ledgerWith(record({ decision: "SKIPPED_NO_QUALIFYING_CONTENT", text: null }));
    const r = check(l, ["breaking_change"], "2026-09-10T14:05:00Z", {
      deepLink: "https://immigrationclock.com/b",
    });
    expect(r.ok).toBe(true);
  });
});

describe("wording similarity", () => {
  it("normalizes away links, hashtags and digits before comparing", () => {
    expect(normalizeForComparison("Fee rises to $755 #tax https://x.com/a")).toBe("fee rises to");
  });

  it("builds word trigrams", () => {
    expect([...trigrams("a b c d")]).toEqual(["a b c", "b c d"]);
  });

  it("scores identical text as 1", () => {
    expect(similarity("the rule takes effect today", "the rule takes effect today")).toBe(1);
  });

  it("scores unrelated text near 0", () => {
    expect(similarity("the rule takes effect in September", "border encounters by sector and month")).toBeLessThan(0.1);
  });

  it("blocks a near-identical repost", () => {
    const text = "DHS is amending the fee regulations for certain visas this week. https://immigrationclock.com/a";
    const l = ledgerWith(record({ text }));
    const r = checkWording(l, text, "x");
    expect(r.ok).toBe(false);
    expect(r.maxSimilarity).toBeGreaterThanOrEqual(SIMILARITY_LIMIT);
  });

  it("allows a genuinely different treatment of the same subject", () => {
    const l = ledgerWith(
      record({ text: "DHS is amending the biometric fee regulations for certain H-1B and L-1 visas." })
    );
    const r = checkWording(
      l,
      "Who pays the biometric entry-exit charge: employers petitioning in the specialty occupation and intracompany transferee categories.",
      "x"
    );
    expect(r.ok).toBe(true);
  });

  it("compares only within a platform", () => {
    const text = "DHS is amending the fee regulations for certain visas this week.";
    const l = ledgerWith(record({ text, platform: "linkedin" }));
    expect(checkWording(l, text, "x").ok).toBe(true);
  });
});
