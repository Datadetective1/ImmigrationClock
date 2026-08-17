// =============================================================================
// SAME-DAY VARIETY AND THE VISUAL SYSTEM
//
// Two gates that both answer the same editorial question — "would a reader feel
// this account is repeating itself, or overselling?" — and both of which have to
// fail in the safe direction.
//
// VARIETY fails OPEN on missing data. A candidate whose topic could not be
// derived is not evidence of repetition, and blocking on an unknown would
// silence slots for no reason a reader could see.
//
// VISUALS fail CLOSED on ungrounded numbers. A card is a published claim that
// outlives the post it shipped with — it gets screenshotted without the caveat
// underneath — so every numeral on one runs back through the same grounding
// check the sentence does.
// =============================================================================

import { describe, it, expect } from "vitest";
import { checkSameDayVariety } from "@/lib/social/dedupe";
import { topicKeyFor, standingPool, candidatesFor } from "@/lib/social/select";
import {
  assertVisualGrounded,
  angleSupportsVisual,
  buildKeyDateVisual,
  buildEventVisual,
  describeVisual,
} from "@/lib/social/visuals";
import { SLOT_BY_ID } from "@/lib/social/slots";
import { EMPTY_POST_LEDGER, appendRecords, type PostLedger, type PostRecord } from "@/lib/social/ledger";
import { KEY_DATES } from "@/lib/key-dates";
import { EVENT_INDEX } from "@/lib/event-index";
import type { IndexedEvent } from "@/lib/event-index";
import type { Angle } from "@/lib/social/types";

const TODAY = "2026-08-09";

function record(over: Partial<PostRecord>): PostRecord {
  return {
    localDate: TODAY,
    localTime: "09:05",
    runAtUtc: "2026-08-09T14:05:00.000Z",
    slot: "morning",
    pool: "news",
    platform: "x",
    decision: "POSTED",
    reason: "Published",
    subjectId: "event:1",
    subjectLabel: "A rule",
    angle: "breaking_change",
    score: 2200,
    text: "text",
    deepLink: "https://immigrationclock.com/what-changed",
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

// -----------------------------------------------------------------------------

describe("topic keys collapse a day's subjects to what a reader would name", () => {
  it("keys an event on its visa category first", () => {
    const e = { entityIds: ["agency:uscis", "visa:h-1b", "country:india"] } as unknown as IndexedEvent;
    expect(topicKeyFor({ subjectId: "event:1", event: e })).toBe("visa:h-1b");
  });

  it("falls back to country, then to a non-catch-all topic", () => {
    expect(
      topicKeyFor({ subjectId: "event:1", event: { entityIds: ["country:haiti"] } as unknown as IndexedEvent })
    ).toBe("country:haiti");
    expect(
      topicKeyFor({
        subjectId: "event:1",
        event: { entityIds: ["topic:policy-changes", "topic:students"] } as unknown as IndexedEvent,
      })
    ).toBe("topic:students");
  });

  it("never keys on the catch-all topic, which would make everything one topic", () => {
    const e = { entityIds: ["topic:policy-changes"], sourceKey: "federal_register" } as unknown as IndexedEvent;
    expect(topicKeyFor({ subjectId: "event:1", event: e })).toBe("source:federal_register");
  });

  it("keys key dates on their category and assets on their first tag", () => {
    expect(topicKeyFor({ subjectId: "keydate:dv-lottery", keyDateCategory: "green-card" })).toBe(
      "topic:green-card"
    );
    expect(topicKeyFor({ subjectId: "asset:layoffs", assetTags: ["layoffs", "warn"] })).toBe(
      "topic:layoffs"
    );
  });

  it("returns empty rather than guessing when there is nothing to key on", () => {
    expect(topicKeyFor({ subjectId: "asset:x", assetTags: [] })).toBe("");
    expect(topicKeyFor({ subjectId: "keydate:x" })).toBe("");
  });
});

describe("same-day variety", () => {
  it("allows a topic not yet covered today", () => {
    const ledger = ledgerOf({ topicKey: "visa:h-1b" });
    expect(checkSameDayVariety(ledger, "topic:students", TODAY, "x").ok).toBe(true);
  });

  it("blocks a second post on the same topic the same day", () => {
    const ledger = ledgerOf({ topicKey: "visa:h-1b", slot: "morning", subjectLabel: "H-1B fee rule" });
    const result = checkSameDayVariety(ledger, "visa:h-1b", TODAY, "x");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("already covered today");
    expect(result.reason).toContain("H-1B fee rule");
  });

  it("blocks across DIFFERENT subjects — which is the whole point", () => {
    // A fee rule (event) in the morning and the sponsor directory (asset) in the
    // evening are distinct subjects, distinct destinations and distinct angles.
    // Every other gate passes them. To a reader they are one H-1B day.
    const ledger = ledgerOf({ subjectId: "event:fee-rule", topicKey: "visa:h-1b" });
    expect(checkSameDayVariety(ledger, "visa:h-1b", TODAY, "x").ok).toBe(false);
  });

  it("does not block a different day", () => {
    const ledger = ledgerOf({ topicKey: "visa:h-1b", localDate: "2026-08-08" });
    expect(checkSameDayVariety(ledger, "visa:h-1b", TODAY, "x").ok).toBe(true);
  });

  it("does not block a different platform", () => {
    const ledger = ledgerOf({ topicKey: "visa:h-1b", platform: "linkedin" });
    expect(checkSameDayVariety(ledger, "visa:h-1b", TODAY, "x").ok).toBe(true);
  });

  it("counts only what actually published", () => {
    // A dry run must not consume the day's variety, and a validator failure must
    // not burn a topic for the rest of the day.
    for (const decision of ["DRY_RUN", "SKIPPED_VALIDATION_FAILED"] as const) {
      const ledger = ledgerOf({ topicKey: "visa:h-1b", decision });
      expect(checkSameDayVariety(ledger, "visa:h-1b", TODAY, "x").ok, decision).toBe(true);
    }
  });

  it("fails OPEN on an unknown topic, rather than silencing a slot", () => {
    const ledger = ledgerOf({ topicKey: "visa:h-1b" });
    expect(checkSameDayVariety(ledger, "", TODAY, "x").ok).toBe(true);
    // And a historical row with no topic blocks nothing.
    expect(checkSameDayVariety(ledgerOf({ topicKey: null }), "visa:h-1b", TODAY, "x").ok).toBe(true);
  });
});

describe("which posts earn a card", () => {
  const dv = KEY_DATES.find((k) => k.id === "dv-lottery")!;

  it("gives prose angles no image at all", () => {
    for (const angle of [
      "who_is_affected",
      "what_changed_from_previous",
      "historical_context",
      "effective_date_reminder",
    ] as Angle[]) {
      expect(angleSupportsVisual(angle), angle).toBe(false);
      expect(buildKeyDateVisual(dv, 53, angle), angle).toBeNull();
    }
  });

  it("gives a closing deadline a countdown card", () => {
    const spec = buildKeyDateVisual(dv, 53, "deadline_approaching")!;
    expect(spec.kind).toBe("countdown");
    expect(spec.hero).toBe("53");
    expect(spec.heroLabel).toBe("days away");
  });

  it("gives a distant window a preparation card, with no countdown language", () => {
    const spec = buildKeyDateVisual(dv, 100, "preparation_window")!;
    expect(spec.kind).toBe("preparation");
    expect(spec.eyebrow).toBe("WINDOW AHEAD");
    expect(spec.hero).not.toMatch(/^\d+$/);
  });

  it("puts the approximate caveat ON the card, not only in the post", () => {
    // A card gets screenshotted without the text under it. "53 days" for a
    // window nobody has announced is the exact claim this caveat prevents.
    expect(dv.approx).toBe(true);
    expect(buildKeyDateVisual(dv, 53, "deadline_approaching")!.caveat).toMatch(/Approximate/);

    const fixed = KEY_DATES.find((k) => k.id === "tax-deadline")!;
    expect(fixed.approx).toBeUndefined();
    expect(buildKeyDateVisual(fixed, 30, "deadline_approaching")!.caveat).toBeNull();
  });

  it("gives only major events a card, so the card keeps meaning something", () => {
    const base = {
      id: "e1",
      title: "A rule",
      publishedAt: "2026-08-09",
      effectiveAt: null,
      classification: "final_rule",
      sourceKey: "federal_register",
      entityIds: [],
    } as unknown as IndexedEvent;
    expect(buildEventVisual({ ...base, severity: "major" }, "breaking_change", "Federal Register")).not.toBeNull();
    expect(buildEventVisual({ ...base, severity: "notable" }, "breaking_change", "Federal Register")).toBeNull();
  });

  it("marks a proposed rule as proposed on the card itself", () => {
    const proposed = {
      id: "e2",
      title: "A proposal",
      publishedAt: "2026-08-09",
      effectiveAt: null,
      severity: "major",
      classification: "proposed_rule",
      sourceKey: "federal_register",
      entityIds: [],
    } as unknown as IndexedEvent;
    const spec = buildEventVisual(proposed, "breaking_change", "Federal Register")!;
    expect(spec.eyebrow).toBe("PROPOSED RULE");
    expect(spec.caveat).toMatch(/not in force/);
  });

  it("never rewrites a document title into something punchier", () => {
    const long = "A".repeat(200);
    const spec = buildEventVisual(
      { id: "e3", title: long, publishedAt: "2026-08-09", effectiveAt: null, severity: "major", classification: "final_rule", sourceKey: "federal_register", entityIds: [] } as unknown as IndexedEvent,
      "breaking_change",
      "Federal Register"
    )!;
    expect(spec.hero.startsWith("A".repeat(87))).toBe(true);
    expect(spec.hero.endsWith("…")).toBe(true);
  });

  it("describes 'no image' in words a human can read in a dry run", () => {
    expect(describeVisual(null)).toMatch(/no image/);
    expect(describeVisual(buildKeyDateVisual(dv, 53, "deadline_approaching"))).toMatch(/countdown card/);
  });
});

describe("every number on a card is grounded in the fact set", () => {
  const evening = SLOT_BY_ID.get("evening")!;

  it("passes for every card the real evening pool would produce", () => {
    for (const c of standingPool(TODAY)) {
      if (!c.visual) continue;
      const result = assertVisualGrounded(c.visual, c.facts);
      expect(result.failures, `${c.subjectId}: ${result.failures.join("; ")}`).toEqual([]);
    }
  });

  it("rejects a card carrying a figure the fact set does not have", () => {
    const c = standingPool(TODAY).find((x) => x.visual)!;
    const forged = { ...c.visual!, hero: "918273" };
    const result = assertVisualGrounded(forged, c.facts);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("918273");
  });

  it("holds across every slot, not just the evening one", () => {
    for (const slot of [SLOT_BY_ID.get("morning")!, SLOT_BY_ID.get("afternoon")!, evening]) {
      for (const c of candidatesFor(slot, EVENT_INDEX, TODAY)) {
        if (!c.visual) continue;
        expect(assertVisualGrounded(c.visual, c.facts).failures, c.subjectId).toEqual([]);
      }
    }
  });

  it("leaves most candidates without a card", () => {
    // The design intent, asserted: if this ever flips to "most posts have an
    // image", that is a decision someone should have to make on purpose.
    const all = [SLOT_BY_ID.get("morning")!, SLOT_BY_ID.get("afternoon")!, evening].flatMap((s) =>
      candidatesFor(s, EVENT_INDEX, TODAY)
    );
    const withVisual = all.filter((c) => c.visual).length;
    expect(all.length).toBeGreaterThan(0);
    expect(withVisual).toBeLessThan(all.length / 2);
  });
});
