// =============================================================================
// POST LEDGER
//
// The invariant worth protecting: a corrupt ledger must NOT read as empty.
// Returning an empty ledger on a parse failure would silently unlock every
// subject the file was protecting and let the system re-post its history. This
// mirrors the newsletter send ledger, which learned the same lesson.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  parsePostLedger,
  serializePostLedger,
  appendRecords,
  publishedPosts,
  hasTreatment,
  lastPostForSubject,
  lastPostForUrl,
  treatmentCount,
  recentTexts,
  recentOpenings,
  recentValidationFailure,
  EMPTY_POST_LEDGER,
  LEDGER_VERSION,
  type PostRecord,
} from "@/lib/social/ledger";

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
    subjectId: "event:a",
    subjectLabel: "A",
    angle: "breaking_change",
    score: 1,
    text: "First sentence here. Second one follows.",
    deepLink: "https://immigrationclock.com/a",
    externalId: null,
    externalUrl: null,
    model: "m",
    promptVersion: "p",
    validatorVersion: "v",
    factsHash: "h",
    approvalId: null,
    approvedBy: null,
    inputTokens: 10,
    outputTokens: 20,
    costUsd: 0.01,
    ...over,
  };
}

describe("parsePostLedger", () => {
  it("treats a missing file as empty — the normal state before the first run", () => {
    expect(parsePostLedger(null)).toEqual(EMPTY_POST_LEDGER);
  });

  it("treats an empty file as empty", () => {
    expect(parsePostLedger("   ")).toEqual(EMPTY_POST_LEDGER);
  });

  it("returns null for malformed JSON rather than pretending it is empty", () => {
    expect(parsePostLedger("{not json")).toBeNull();
  });

  it("returns null for the wrong version", () => {
    expect(parsePostLedger(JSON.stringify({ version: 99, posts: [] }))).toBeNull();
  });

  it("returns null when posts is not an array", () => {
    expect(parsePostLedger(JSON.stringify({ version: 1, posts: {} }))).toBeNull();
  });

  it("returns null when a record is missing required identity fields", () => {
    const raw = JSON.stringify({ version: 1, posts: [{ localDate: "2026-08-01" }] });
    expect(parsePostLedger(raw)).toBeNull();
  });

  it("round-trips a valid ledger", () => {
    const l = appendRecords(EMPTY_POST_LEDGER, [record()]);
    expect(parsePostLedger(serializePostLedger(l))).toEqual(l);
  });
});

describe("serializePostLedger", () => {
  it("sorts chronologically so a rebuild produces no spurious diff", () => {
    const a = record({ runAtUtc: "2026-08-02T14:05:00.000Z" });
    const b = record({ runAtUtc: "2026-08-01T14:05:00.000Z" });
    const out = serializePostLedger(appendRecords(EMPTY_POST_LEDGER, [a, b]));
    const parsed = JSON.parse(out) as { posts: PostRecord[] };
    expect(parsed.posts[0].runAtUtc).toBe("2026-08-01T14:05:00.000Z");
  });

  it("ends with a newline", () => {
    expect(serializePostLedger(EMPTY_POST_LEDGER).endsWith("\n")).toBe(true);
  });

  it("writes the version", () => {
    expect(JSON.parse(serializePostLedger(EMPTY_POST_LEDGER)).version).toBe(LEDGER_VERSION);
  });
});

describe("appendRecords", () => {
  it("does not mutate the input", () => {
    const l = appendRecords(EMPTY_POST_LEDGER, [record()]);
    appendRecords(l, [record({ subjectId: "event:b" })]);
    expect(l.posts).toHaveLength(1);
  });
});

describe("queries count only what published", () => {
  const l = appendRecords(EMPTY_POST_LEDGER, [
    record({ subjectId: "event:a", decision: "POSTED" }),
    record({ subjectId: "event:b", decision: "SKIPPED_NO_QUALIFYING_CONTENT", text: null }),
    record({ subjectId: "event:c", decision: "DRY_RUN" }),
  ]);

  it("publishedPosts excludes skips and dry runs", () => {
    expect(publishedPosts(l).map((p) => p.subjectId)).toEqual(["event:a"]);
  });

  it("a dry run does not consume a treatment", () => {
    expect(hasTreatment(l, "event:c", "breaking_change", "x")).toBeNull();
  });

  it("hasTreatment matches on subject, angle and platform together", () => {
    expect(hasTreatment(l, "event:a", "breaking_change", "x")).not.toBeNull();
    expect(hasTreatment(l, "event:a", "who_is_affected", "x")).toBeNull();
    expect(hasTreatment(l, "event:a", "breaking_change", "linkedin")).toBeNull();
  });

  it("treatmentCount counts distinct angles", () => {
    const two = appendRecords(l, [record({ subjectId: "event:a", angle: "who_is_affected" })]);
    expect(treatmentCount(two, "event:a", "x")).toBe(2);
  });

  it("lastPostForSubject returns the newest", () => {
    const two = appendRecords(l, [
      record({ subjectId: "event:a", angle: "who_is_affected", runAtUtc: "2026-09-01T14:05:00.000Z" }),
    ]);
    expect(lastPostForSubject(two, "event:a", "x")?.runAtUtc).toBe("2026-09-01T14:05:00.000Z");
  });

  it("lastPostForUrl finds by destination", () => {
    expect(lastPostForUrl(l, "https://immigrationclock.com/a", "x")).not.toBeNull();
    expect(lastPostForUrl(l, "https://immigrationclock.com/zzz", "x")).toBeNull();
  });
});

describe("recentTexts and recentOpenings", () => {
  const l = appendRecords(EMPTY_POST_LEDGER, [
    record({ runAtUtc: "2026-08-01T14:05:00.000Z", text: "Older post here. More text." }),
    record({ runAtUtc: "2026-08-02T14:05:00.000Z", text: "Newer post here. More text." }),
  ]);

  it("returns newest first", () => {
    expect(recentTexts(l, "x", 5)[0]).toContain("Newer");
  });

  it("respects the limit", () => {
    expect(recentTexts(l, "x", 1)).toHaveLength(1);
  });

  it("openings are the first sentence only", () => {
    expect(recentOpenings(l, "x", 1)[0]).toBe("Newer post here.");
  });
});

describe("recentValidationFailure", () => {
  const l = appendRecords(EMPTY_POST_LEDGER, [
    record({ decision: "SKIPPED_VALIDATION_FAILED", text: null }),
  ]);

  it("finds a recent failure", () => {
    expect(
      recentValidationFailure(l, "event:a", "breaking_change", "x", "2026-08-03T00:00:00Z", 5)
    ).not.toBeNull();
  });

  it("ignores one outside the window", () => {
    expect(
      recentValidationFailure(l, "event:a", "breaking_change", "x", "2026-09-03T00:00:00Z", 5)
    ).toBeNull();
  });

  it("does not match a successful post", () => {
    const ok = appendRecords(EMPTY_POST_LEDGER, [record()]);
    expect(
      recentValidationFailure(ok, "event:a", "breaking_change", "x", "2026-08-02T00:00:00Z", 5)
    ).toBeNull();
  });
});
