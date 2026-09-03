// =============================================================================
// THE EMPLOYER JOIN, AUDITED
//
// The overlap between H-1B sponsors and state WARN filings is the one thing
// here no government source publishes, and it is produced by matching employer
// names. Name matching is approximate. These tests pin down what the product
// is allowed to say about that approximation:
//
//   1. THE JOIN DESCRIBES ITSELF. Every match says how it was made, which
//      words were discarded to make it, and what it therefore leaves out.
//   2. NO SCORE. Nothing here ranks a company, grades it, or could be read as
//      a judgement about it or about anyone who works there.
//   3. THE NORMALIZER IS FROZEN. It is mirrored by a separate Python pipeline,
//      so a refactor that changes a single join key is a data incident.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  EMPLOYERS,
  EMPLOYERS_META,
  h1bFilersOnRelatedKeys,
  h1bFilersSharingKey,
} from "@/lib/employers";
import { WARN_EMPLOYERS, warnEmployersSharingKey, warnH1bCrossLink } from "@/lib/warn";
import {
  EMPLOYER_DESCRIPTIVE_WORDS,
  EMPLOYER_LEGAL_FORMS,
  normalizeEmployer,
} from "@/lib/format";
import { describeMatch } from "@/lib/intelligence/employer-match";
import { employerSignals } from "@/lib/intelligence/employer-signals";

const TODAY = "2026-09-03";
const FY = String(EMPLOYERS_META.fiscalYear);

function matchFor(name: string) {
  return describeMatch({
    key: normalizeEmployer(name),
    h1bNames: h1bFilersSharingKey(name),
    warnNames: warnEmployersSharingKey(name),
    relatedFilersOnOtherKeys: h1bFilersOnRelatedKeys(name),
    fiscalYear: FY,
    today: TODAY,
  });
}

// -----------------------------------------------------------------------------
// THE NORMALIZER IS A DATA CONTRACT
// -----------------------------------------------------------------------------

describe("the employer normalizer", () => {
  it("produces the same key the previous single regex did, for every name", () => {
    // The word list was split in two so a match can say WHICH kind of word it
    // discarded. Splitting it must not move a single key: the Python pipeline
    // computes the same one, and a silent change would split every join.
    const previous =
      /\b(inc|incorporated|llc|l l c|ltd|limited|corp|corporation|co|company|plc|llp|lp|technologies|technology|solutions|services|usa|us|na)\b/gi;
    const asBefore = (name: string) =>
      name
        .toUpperCase()
        .replace(/[.,&]/g, " ")
        .replace(previous, " ")
        .replace(/\s+/g, " ")
        .trim();

    const names = [
      ...EMPLOYERS.map((e) => e.name),
      ...(WARN_EMPLOYERS as { name: string }[]).map((e) => e.name),
    ];
    expect(names.length).toBeGreaterThan(5_000);
    const changed = names.filter((n) => normalizeEmployer(n) !== asBefore(n));
    expect(changed).toEqual([]);
  });

  it("keeps the two word categories disjoint", () => {
    const legal = new Set<string>(EMPLOYER_LEGAL_FORMS);
    expect(EMPLOYER_DESCRIPTIVE_WORDS.some((w) => legal.has(w))).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// THE TAXONOMY, ON REAL ROWS
// -----------------------------------------------------------------------------

describe("a match says how it was made", () => {
  it("calls a clean one-to-one join exact", () => {
    const m = matchFor("GOOGLE LLC");
    expect(m.kind).toBe("exact_normalized");
    expect(m.discardedWords).toEqual([]);
    expect(m.h1bFilersNotShown).toBe(0);
  });

  it("does not punish a short key that is simply a short name", () => {
    // IBM and F5 match on three and two characters and are correct. A rule
    // that flagged every short key would cry wolf on both.
    for (const name of ["IBM CORPORATION", "F5 INC"]) {
      const m = matchFor(name);
      expect(m.kind, name).toBe("exact_normalized");
      expect(m.fragileKey, name).toBe(true);
      expect(m.discardedWords, name).toEqual([]);
      expect(m.note, name).toMatch(/short/i);
    }
  });

  it("flags the short key that was produced by discarding part of a name", () => {
    // The case the whole taxonomy exists for: H-1B "CA INC" joined to WARN
    // "CA Technologies" on two characters.
    const m = matchFor("CA INC");
    expect(m.kind).toBe("ambiguous_normalization");
    expect(m.key).toBe("CA");
    expect(m.discardedWords).toContain("technologies");
    expect(m.warnNames).toContain("CA Technologies");
    expect(m.note).toMatch(/can belong to a different company/i);
  });

  it("flags a subsidiary joined to a group name on a short key", () => {
    const m = matchFor("HSBC TECHNOLOGY SERVICES USA INC");
    expect(m.kind).toBe("ambiguous_normalization");
    expect(m.discardedWords.length).toBeGreaterThan(1);
  });

  it("names a corporate family when several filers share the key", () => {
    const m = matchFor("QUALCOMM TECHNOLOGIES INC");
    expect(m.kind).toBe("possible_corporate_family");
    expect(m.h1bNames.length).toBeGreaterThan(1);
    expect(m.h1bFilersNotShown).toBeGreaterThan(0);
    expect(m.note).toMatch(/not counted in the approvals shown/i);
  });

  it("reports filers the join could never have matched", () => {
    // Amazon files under five entities producing four keys, so a WARN notice
    // filed as "Amazon" reaches at most one of them. Nothing inside the join
    // reveals that.
    const m = matchFor("AMAZON.COM SERVICES LLC");
    expect(m.relatedFilersOnOtherKeys.length).toBeGreaterThanOrEqual(3);
    expect(m.approvalsNotCounted).toBeGreaterThan(1_000);
    expect(m.note).toMatch(/not proof of common ownership/i);
  });

  it("does not group companies on a short shared first word", () => {
    // "US", "NA" and friends are stripped; a two- or three-letter first word
    // would gather unrelated companies. The threshold must hold.
    for (const e of EMPLOYERS.slice(0, 400)) {
      const first = normalizeEmployer(e.name).split(" ")[0] ?? "";
      if (first.length >= 5) continue;
      expect(h1bFilersOnRelatedKeys(e.name), e.name).toEqual([]);
    }
  });

  it("reports the age of the sponsorship evidence rather than implying it is current", () => {
    const m = matchFor("GOOGLE LLC");
    expect(m.sponsorEvidenceAgeYears).toBeGreaterThanOrEqual(1);
    expect(m.staleSponsorEvidence).toBe(m.sponsorEvidenceAgeYears >= 2);
    if (m.staleSponsorEvidence) expect(m.note).toMatch(/not sponsorship today/i);
  });

  it("classifies every real overlap row into exactly one kind", () => {
    const rows = warnH1bCrossLink();
    expect(rows.length).toBeGreaterThan(100);
    const kinds = new Set<string>();
    for (const r of rows) {
      const m = matchFor(r.name);
      expect(["exact_normalized", "possible_corporate_family", "ambiguous_normalization"]).toContain(
        m.kind
      );
      expect(m.note.length).toBeGreaterThan(40);
      expect(m.key.length).toBeGreaterThan(0);
      kinds.add(m.kind);
    }
    // All three must actually occur, or the taxonomy is decoration.
    expect(kinds.size).toBe(3);
  });
});

// -----------------------------------------------------------------------------
// WHAT IT MUST NEVER BECOME
// -----------------------------------------------------------------------------

describe("the join describes itself, never the employer", () => {
  const overlap = employerSignals(
    {
      slug: "example",
      name: "CA INC",
      notices: 3,
      employees: 400,
      states: ["CA"],
      latestNotice: "2024-02-01",
      siblingNames: warnEmployersSharingKey("CA INC"),
    },
    {
      slug: "example",
      name: "CA INC",
      approvals: 120,
      denials: 4,
      fiscalYear: FY,
      sourceName: EMPLOYERS_META.sourceName,
      sourceUrl: EMPLOYERS_META.sourceUrl,
      siblingNames: h1bFilersSharingKey("CA INC"),
      relatedFilers: h1bFilersOnRelatedKeys("CA INC"),
    },
    "test",
    TODAY
  ).find((s) => s.kind === "warn_h1b_overlap");

  it("attaches the match description to the overlap signal", () => {
    expect(overlap?.matchQuality?.kind).toBe("ambiguous_normalization");
    expect(overlap?.matchQuality?.key).toBe("CA");
  });

  it("carries no score, grade, rank or risk field", () => {
    const json = JSON.stringify(overlap ?? {});
    expect(json).not.toMatch(/"(score|risk|grade|rating|rank|likelihood|probability)"/i);
    expect(json).not.toMatch(/high risk|at risk|likely to|expected to lay off/i);
  });

  it("never claims a layoff touched a visa holder", () => {
    expect(overlap?.caveat).toMatch(/does not imply that one caused the other/i);
    const json = JSON.stringify(overlap ?? {}).toLowerCase();
    expect(json).not.toMatch(/visa holders were laid off|affected h-1b workers/);
  });

  it("keeps the single-sided signals free of a match description", () => {
    // Nothing was joined, so there is nothing to describe. An empty object
    // would invite a consumer to read absence as quality.
    const [warnOnly] = employerSignals(
      { slug: "x", name: "X", notices: 1, employees: 5, states: ["CA"], latestNotice: "2024-01-01" },
      null,
      "test",
      TODAY
    );
    expect(warnOnly.matchQuality).toBeUndefined();
  });
});
