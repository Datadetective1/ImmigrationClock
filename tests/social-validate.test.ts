// =============================================================================
// THE VALIDATOR
//
// This is the file that decides whether an unattended process may publish a
// sentence about federal immigration policy, so the tests are written as
// adversarial cases rather than happy paths: for each rule, the thing that
// SHOULD get through, and the closest thing to it that must not.
//
// The three checks that carry the trust guarantee — URL whitelisting, figure
// grounding, and quotation grounding — get the most cases, because they are the
// ones standing between the archive and a fabricated claim.
// =============================================================================

import { describe, it, expect } from "vitest";
import { validatePost, LIMITS, extractUrls, extractQuotations, allowedDigitRuns } from "@/lib/social/validate";
import type { FactSet } from "@/lib/social/types";

const LINK = "https://immigrationclock.com/h1b/top-sponsors";
const SOURCE = "https://www.federalregister.gov/documents/2026/08/10/2026-16231/fee";

function facts(over: Partial<FactSet> = {}): FactSet {
  return {
    subjectId: "event:test:1",
    title: "Biometric Entry-Exit Fee for H-1B and L-1 Visas",
    summary: "DHS is amending the regulations concerning the fee for certain H-1B and L-1 visas. The fee is $500.",
    sourceName: "Federal Register",
    sourceKey: "federal_register",
    publishedAt: "2026-08-10",
    effectiveAt: "2026-09-09",
    classification: "final_rule",
    severity: "major",
    entities: ["Department of Homeland Security", "H-1B specialty occupation"],
    dataPoints: [],
    allowedUrls: [LINK, SOURCE],
    deepLink: LINK,
    figures: ["1", "500"],
    notes: [],
    ...over,
  };
}

/** A post that passes everything, used as the baseline to mutate. */
const GOOD_X = `DHS is amending the fee regulations for certain H-1B and L-1 visas. The change takes effect on 9 September 2026. ${LINK}`;

const GOOD_LI = [
  "DHS is amending the regulations covering the biometric entry-exit fee for certain H-1B and L-1 visas.",
  "",
  "The amendment takes effect on 9 September 2026. Until that date the existing regulations are the ones in force, which is the distinction that usually gets lost when a rule is reported the day it publishes.",
  "",
  "Who this reaches: employers and workers in the H-1B specialty occupation category and the L-1 intracompany transferee category.",
  "",
  LINK,
].join("\n");

describe("baseline", () => {
  it("accepts well-formed copy on both platforms", () => {
    expect(validatePost(GOOD_X, "x", facts()).ok).toBe(true);
    expect(validatePost(GOOD_LI, "linkedin", facts()).ok).toBe(true);
  });
});

describe("URL whitelisting", () => {
  it("accepts the destination from the fact set", () => {
    expect(validatePost(GOOD_X, "x", facts()).ok).toBe(true);
  });

  it("rejects a URL that is not in the permitted set", () => {
    const bad = GOOD_X.replace(LINK, "https://immigrationclock.com/h1b/salaries");
    const r = validatePost(bad, "x", facts());
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes("not in the permitted set"))).toBe(true);
  });

  it("rejects a plausible-looking off-site link", () => {
    const bad = `${GOOD_X} https://uscis.gov/news`;
    expect(validatePost(bad, "x", facts()).ok).toBe(false);
  });

  it("rejects a post with no link at all", () => {
    const r = validatePost("DHS is amending the fee regulations for certain H-1B and L-1 visas today.", "x", facts());
    expect(r.failures.some((f) => f.includes("No link"))).toBe(true);
  });

  it("rejects a post that links only to the source, never to us", () => {
    const r = validatePost(`DHS is amending the fee regulations for H-1B and L-1 visas. ${SOURCE}`, "x", facts());
    expect(r.failures.some((f) => f.includes("does not link to its destination"))).toBe(true);
  });

  it("rejects more links than the platform allows", () => {
    const r = validatePost(`DHS is amending the H-1B and L-1 fee rules. ${LINK} ${SOURCE}`, "x", facts());
    expect(r.failures.some((f) => f.includes("Too many links"))).toBe(true);
  });
});

describe("figure grounding — the check that makes invented statistics unpublishable", () => {
  it("allows a figure that appears in the summary", () => {
    const ok = `The fee is $500 under the amended regulations for H-1B and L-1 visas. ${LINK}`;
    expect(validatePost(ok, "x", facts()).ok).toBe(true);
  });

  it("rejects a figure that appears nowhere in the fact set", () => {
    const bad = `The change affects 47,000 workers in H-1B and L-1 categories this year. ${LINK}`;
    const r = validatePost(bad, "x", facts());
    expect(r.ok).toBe(false);
    // Reported as one figure, not two: thousands separators are normalised away
    // before comparison, so "47,000" is 47000 rather than 47 and 000.
    expect(r.failures.some((f) => f.includes('Figure "47000"'))).toBe(true);
  });

  it("ignores digits inside the URL", () => {
    // The source URL is full of digits; they must not become a licence to use them.
    const bad = `DHS amended the H-1B and L-1 fee. It affects 2026 filings and 16231 petitions. ${LINK}`;
    const r = validatePost(bad, "x", facts());
    expect(r.failures.some((f) => f.includes('Figure "16231"'))).toBe(true);
  });

  it("treats separators and leading zeros as the same number", () => {
    const f = facts({ summary: "The cap is 1,500 petitions.", figures: ["1,500"] });
    const ok = `The cap is 1500 petitions for H-1B and L-1 categories under the rule. ${LINK}`;
    expect(validatePost(ok, "x", f).ok).toBe(true);
  });

  it("accepts a date written out from an ISO effective date", () => {
    // effectiveAt is 2026-09-09; "9 September 2026" must be allowed.
    expect(validatePost(GOOD_X, "x", facts()).ok).toBe(true);
  });

  it("rejects every figure when the fact set carries none", () => {
    const f = facts({ summary: "A page describing the archive.", figures: [], publishedAt: null, effectiveAt: null, title: "Timeline", entities: [] });
    const bad = `The timeline holds 512 recorded changes going back years and years now. ${LINK}`;
    expect(validatePost(bad, "x", f).ok).toBe(false);
  });
});

describe("quotation grounding — no invented quotes, including by paraphrase", () => {
  it("accepts a quotation that is verbatim in the source", () => {
    const ok = `DHS says it is "amending the regulations concerning the fee" for these visas. ${LINK}`;
    expect(validatePost(ok, "x", facts()).ok).toBe(true);
  });

  it("rejects a quotation that is a paraphrase", () => {
    const bad = `DHS called the change "a necessary modernisation of the fee structure" this week. ${LINK}`;
    const r = validatePost(bad, "x", facts());
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes("not verbatim"))).toBe(true);
  });

  it("catches curly quotes too", () => {
    const bad = `DHS called it “a sweeping overhaul of the system” in its notice. ${LINK}`;
    expect(validatePost(bad, "x", facts()).ok).toBe(false);
  });

  it("extractQuotations finds both quote styles", () => {
    expect(extractQuotations('a "one" b “two” c')).toEqual(["one", "two"]);
  });
});

describe("attribution", () => {
  it("accepts an agency named in the fact set", () => {
    expect(validatePost(GOOD_X, "x", facts()).ok).toBe(true);
  });

  it("rejects an agency the source never mentions", () => {
    const bad = `The Department of Labor is amending the fee rules for H-1B and L-1 visas. ${LINK}`;
    const r = validatePost(bad, "x", facts());
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes("does not appear in the source"))).toBe(true);
  });
});

describe("banned constructions", () => {
  const cases: [string, string][] = [
    ["prediction", `The fee will likely rise again for H-1B and L-1 filings next year. ${LINK}`],
    ["prediction", `The rule is expected to reshape H-1B and L-1 hiring across the sector. ${LINK}`],
    ["speculation", `The amendment could mean higher costs for H-1B and L-1 sponsors soon. ${LINK}`],
    ["speculation", `The timing suggests that DHS intends further H-1B and L-1 changes. ${LINK}`],
    ["opinion", `We believe this H-1B and L-1 fee change is the right call for now. ${LINK}`],
    ["advice", `If you sponsor H-1B and L-1 workers you should budget for the fee. ${LINK}`],
    ["advice", `Employers of H-1B and L-1 staff should file now before the fee rises. ${LINK}`],
    ["superlative", `An unprecedented change to the H-1B and L-1 fee regulations lands today. ${LINK}`],
    ["editorializing", `The latest crackdown on H-1B and L-1 visa holders continues apace here. ${LINK}`],
    ["engagement bait", `DHS amended the H-1B and L-1 fee rules. What do you think of that? ${LINK}`],
  ];

  for (const [label, text] of cases) {
    it(`rejects ${label}: ${text.slice(0, 45)}...`, () => {
      expect(validatePost(text, "x", facts()).ok).toBe(false);
    });
  }

  it("does NOT reject a plain future-tense statement of fact", () => {
    // The distinction the whole banned list turns on: "will likely" is a
    // prediction, "takes effect on" is a fact about a published rule.
    expect(validatePost(GOOD_X, "x", facts()).ok).toBe(true);
  });

  it("does NOT reject the word 'require' describing what a rule does", () => {
    const ok = `The rule requires certain H-1B and L-1 petitioners to pay the fee. ${LINK}`;
    expect(validatePost(ok, "x", facts()).ok).toBe(true);
  });

  it("rejects emoji", () => {
    const bad = `DHS amended the H-1B and L-1 fee regulations this week. \u{1F6A8} ${LINK}`;
    expect(validatePost(bad, "x", facts()).ok).toBe(false);
  });
});

describe("proposed rules must not read as law", () => {
  const proposed = facts({ classification: "proposed_rule", effectiveAt: null });

  it("rejects copy that never says the rule is proposed", () => {
    const bad = `DHS is amending the fee regulations for certain H-1B and L-1 visas now. ${LINK}`;
    const r = validatePost(bad, "x", proposed);
    expect(r.failures.some((f) => f.includes("never says so"))).toBe(true);
  });

  it("accepts copy that says so", () => {
    const ok = `DHS has proposed amending the fee regulations for H-1B and L-1 visas. ${LINK}`;
    expect(validatePost(ok, "x", proposed).ok).toBe(true);
  });

  it("rejects describing a proposal as being in effect", () => {
    const bad = `The proposed H-1B and L-1 fee rule takes effect on 9 September 2026. ${LINK}`;
    expect(validatePost(bad, "x", proposed).ok).toBe(false);
  });
});

describe("effective dates must be real", () => {
  it("rejects an effective date when the archive records none", () => {
    const f = facts({ effectiveAt: null, classification: "updated_information" });
    const bad = `The new H-1B and L-1 guidance takes effect on 9 September 2026 per DHS. ${LINK}`;
    const r = validatePost(bad, "x", f);
    expect(r.failures.some((f2) => f2.includes("archive records none"))).toBe(true);
  });
});

describe("platform shape", () => {
  it("rejects an X post over the limit", () => {
    const bad = `${"DHS amended the H-1B and L-1 visa fee regulations. ".repeat(6)}${LINK}`;
    expect(validatePost(bad, "x", facts()).failures.some((f) => f.includes("Too long"))).toBe(true);
  });

  it("keeps five characters of headroom under X's real limit", () => {
    // t.co link length has changed before; the margin is deliberate.
    expect(LIMITS.x.maxChars).toBeLessThan(280);
  });

  it("rejects a LinkedIn post that is too short to be worth the fold", () => {
    expect(validatePost(GOOD_X, "linkedin", facts()).failures.some((f) => f.includes("Too short"))).toBe(true);
  });

  it("rejects a link above the LinkedIn fold", () => {
    const bad = `${LINK}\n\n${GOOD_LI}`;
    const r = validatePost(bad, "linkedin", facts());
    expect(r.failures.some((f) => f.includes("above the LinkedIn fold"))).toBe(true);
  });

  it("allows LinkedIn up to three hashtags but no more", () => {
    const three = GOOD_LI.replace(LINK, `${LINK}\n\n#immigration #H1B #policy`);
    // "#H1B" carries a digit that must still be grounded — 1 is in figures.
    expect(validatePost(three, "linkedin", facts()).ok).toBe(true);

    const four = GOOD_LI.replace(LINK, `${LINK}\n\n#immigration #H1B #policy #visas`);
    expect(validatePost(four, "linkedin", facts()).failures.some((f) => f.includes("Too many hashtags"))).toBe(true);
  });

  it("allows zero hashtags — there is no quota", () => {
    expect(validatePost(GOOD_LI, "linkedin", facts()).ok).toBe(true);
  });

  it("allows at most one hashtag on X", () => {
    const two = GOOD_X.replace(LINK, `#immigration #policy ${LINK}`);
    expect(validatePost(two, "x", facts()).failures.some((f) => f.includes("Too many hashtags"))).toBe(true);
  });

  it("rejects an empty post outright", () => {
    expect(validatePost("   ", "x", facts()).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("extractUrls strips trailing sentence punctuation", () => {
    expect(extractUrls(`see ${LINK}.`)).toEqual([LINK]);
  });

  it("allowedDigitRuns draws on every fact-set field", () => {
    const runs = allowedDigitRuns(facts());
    expect(runs.has("2026")).toBe(true); // publishedAt
    expect(runs.has("9")).toBe(true); // effectiveAt month, leading zero stripped
    expect(runs.has("500")).toBe(true); // summary
    expect(runs.has("47")).toBe(false);
  });
});
