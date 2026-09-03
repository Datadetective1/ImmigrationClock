// =============================================================================
// THE TWO FAILURES FROM THE FIRST REAL ANTHROPIC PROPOSAL
//
// On 2026-08-09 the first live `social:propose --slot=evening` produced copy for
// the Diversity Visa key date that the validator rejected twice over:
//
//   x:        "Too long for x: 286 chars (max 275)"
//   x + li:   'Attributes this to "state department", which does not appear
//              in the source material'
//
// Both rejections were correct at the time and neither was fixed by touching
// the validator. They were generation-layer problems:
//
//   • "at most 275" is a cliff, and a model writing to a cliff lands past it.
//   • The fact set names its source "U.S. Dept. of State — DV Program", which
//     contains no form of "State Department". The model supplied the attribution
//     from general knowledge — true of the world, absent from the closed world —
//     because nothing had told it which attributions were actually available.
//
// One of the two has since been re-measured rather than relaxed. X counts every
// link as a fixed 23-character t.co token, so the 286-character post was 271 as
// X counts it, and the validator's eighth revision counts the way X does. The
// attribution failure stands exactly as it was. And the fact set now hands the
// writer a TRACKED destination, so the same post fails on destination instead.
//
// This file has two jobs. The FIRST half pins the validator's behaviour on the
// exact strings that failed, so the checks can never be quietly loosened to make
// this candidate pass. The SECOND half asserts the prompt tells the model what
// it needs to know to avoid producing them.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  buildUserPrompt,
  PROMPT_VERSION,
  X_SAFETY_MARGIN,
  X_TARGET_MAX,
  X_TARGET_MIN,
  xBudget,
} from "@/lib/social/prompt";
import {
  AGENCY_DISPLAY,
  LIMITS,
  X_URL_WEIGHT,
  permittedAgencies,
  attributionCorpus,
  ATTRIBUTABLE_AGENCIES,
  validatePost,
  xWeightedLength,
} from "@/lib/social/validate";
import { buildKeyDateFacts, buildEventFacts } from "@/lib/social/facts";
import { KEY_DATES } from "@/lib/key-dates";
import { SLOT_BY_ID } from "@/lib/social/slots";
import type { IndexedEvent } from "@/lib/event-index";
import type { FactSet } from "@/lib/social/types";

const DV = KEY_DATES.find((k) => k.id === "dv-lottery")!;

/** The exact fact set the failing proposal was generated from. */
function dvFacts(): FactSet {
  return buildKeyDateFacts(DV, 53, "2026-10-01", "2026-08-15");
}

/** The exact copy the model returned, byte for byte. */
const FAILING_X =
  "The State Department's Diversity Visa registration opens for roughly one month each fall. It is free, and it does not require an employer or family sponsor. The exact window is set by the agency each year; the date on our calendar is approximate.\n\nhttps://immigrationclock.com/key-dates";

const FAILING_LINKEDIN = [
  "The Diversity Visa lottery registration window opens for about one month in the fall. The exact dates are set by the State Department each year.",
  "",
  "The DV program is one of the few paths to a green card that requires no employer sponsor and no qualifying family relationship. Registration is free. Eligibility is based on nationality, and it is limited to nationals of countries the State Department designates as eligible.",
  "",
  "Because the agency sets the window annually, the date carried on our key-dates page is approximate rather than confirmed. The State Department's own entry page is the controlling source for each year's instructions and timing.",
  "",
  "We track it alongside the other recurring federal immigration dates so it is findable on any day, not only when it is announced.",
  "",
  "https://immigrationclock.com/key-dates",
].join("\n");

// -----------------------------------------------------------------------------
// HALF ONE — the validator must keep rejecting exactly this
// -----------------------------------------------------------------------------

describe("regression: the copy that failed on 2026-08-09 still fails", () => {
  const facts = dvFacts();

  it("is 286 characters as written and 271 as X counts it — inside the limit now", () => {
    // The re-measurement, stated. The literal string is unchanged; what changed
    // is that the validator counts the 38-character link as X's 23.
    expect(FAILING_X.trim().length).toBe(286);
    expect(xWeightedLength(FAILING_X)).toBe(286 - "https://immigrationclock.com/key-dates".length + X_URL_WEIGHT);
    expect(xWeightedLength(FAILING_X)).toBe(271);
    const result = validatePost(FAILING_X, "x", facts);
    expect(result.ok).toBe(false);
    expect(result.codes).not.toContain("length-max");
  });

  it("still rejects a post that is over the limit AS X COUNTS IT, and says how it counted", () => {
    const over = FAILING_X.replace("It is free, and it", "Registration is free of charge, and it");
    const measured = xWeightedLength(over);
    expect(measured).toBeGreaterThan(LIMITS.x.maxChars);
    const result = validatePost(over, "x", facts);
    expect(result.codes).toContain("length-max");
    expect(result.failures).toContain(
      `Too long for x: ${measured} chars as x counts them (max ${LIMITS.x.maxChars}; each URL counts as ${X_URL_WEIGHT})`
    );
  });

  it("rejects the same copy for its destination — the clean URL is not the tracked one", () => {
    // The post must carry the attribution parameters. The clean canonical URL
    // stays on the whitelist so this is a wrong-destination failure rather than
    // an off-site link, but it is still a failure.
    for (const [platform, text] of [
      ["x", FAILING_X],
      ["linkedin", FAILING_LINKEDIN],
    ] as const) {
      const result = validatePost(text, platform, facts);
      expect(result.codes, platform).toContain("wrong-destination");
      expect(result.codes, platform).not.toContain("url-not-whitelisted");
    }
    expect(facts.allowedUrls).toContain("https://immigrationclock.com/key-dates");
    expect(facts.deepLink).not.toBe("https://immigrationclock.com/key-dates");
    expect(facts.deepLink.startsWith("https://immigrationclock.com/key-dates?")).toBe(true);
  });

  it("rejects both variants for the unsupported State Department attribution", () => {
    for (const [platform, text] of [
      ["x", FAILING_X],
      ["linkedin", FAILING_LINKEDIN],
    ] as const) {
      const result = validatePost(text, platform, facts);
      expect(result.ok, platform).toBe(false);
      expect(result.failures.join(" "), platform).toContain(
        'Attributes this to "state department", which does not appear in the source material'
      );
    }
  });

  it("still rejects the attribution after the length and the destination are fixed", () => {
    // Proves the failures are independent. Trimming to fit and linking to the
    // right place does not make the attribution available, and a fix that only
    // did those would ship an unsupported claim.
    const shortened = `Diversity Visa registration opens for roughly one month each fall. It is free and needs no employer or family sponsor. The State Department sets the exact window each year. ${facts.deepLink}`;
    expect(xWeightedLength(shortened)).toBeLessThanOrEqual(LIMITS.x.maxChars);
    const result = validatePost(shortened, "x", facts);
    expect(result.ok).toBe(false);
    expect(result.codes).toEqual(["attribution-unsupported"]);
    expect(result.failures.join(" ")).toMatch(/state department/i);
  });

  it("accepts the same post written without the unsupported attribution", () => {
    // The wording the prompt now steers toward: neutral, and grounded in the
    // fact set's own phrasing rather than in what the model knows.
    const neutral = `Diversity Visa registration opens for about one month in the fall. It is free and needs no employer or family sponsor. The exact window is set by the agency each year, so our date is approximate. ${facts.deepLink}`;
    expect(neutral.length).toBeGreaterThan(LIMITS.x.maxChars); // literally, because the tracked URL is long…
    expect(xWeightedLength(neutral)).toBeLessThanOrEqual(LIMITS.x.maxChars); // …and inside as X counts
    expect(validatePost(neutral, "x", facts).failures).toEqual([]);
  });

  it("the fact set genuinely does not support the attribution — this is not a validator bug", () => {
    expect(facts.sourceName).toBe("U.S. Dept. of State — DV Program");
    expect(attributionCorpus(facts)).not.toMatch(/state department|department of state/);
    expect(permittedAgencies(facts)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// HALF TWO — the prompt now supplies what was missing
// -----------------------------------------------------------------------------

describe("the prompt states which attributions are available", () => {
  const slot = SLOT_BY_ID.get("evening")!;
  const ask = (facts: FactSet) =>
    buildUserPrompt({ facts, slot, angle: "deadline_approaching", avoidOpenings: [] });

  it("tells the model, for this subject, that no agency name is available", () => {
    const prompt = ask(dvFacts());
    expect(prompt).toContain("PERMITTED ATTRIBUTION");
    expect(prompt).toContain("No agency short name is available for this subject");
    expect(prompt).toContain('"U.S. Dept. of State — DV Program"');
  });

  it("names the specific wrong answer the model reached for", () => {
    // Naming it is the point. A generic "do not attribute" instruction did not
    // stop this, because the model did not believe it was inventing anything.
    expect(ask(dvFacts())).toContain('Do not write "the State Department"');
  });

  it("offers concrete neutral wording instead of only a prohibition", () => {
    const prompt = ask(dvFacts());
    expect(prompt).toContain('"the official instructions"');
    expect(prompt).toContain('"the program rules"');
  });

  it("says that certainty about the responsible agency is not permission", () => {
    expect(ask(dvFacts())).toMatch(/however certain you are/);
    expect(ask(dvFacts())).toMatch(/that certainty comes from your own knowledge, not from this fact set/);
  });

  it("lists the agencies when the fact set does support them, as a person writes them", () => {
    const event: IndexedEvent = {
      id: "federal_register:2026-1",
      title: "Fee Adjustment for Certain Immigration Benefit Requests",
      publishedAt: "2026-08-08",
      effectiveAt: "2026-09-08",
      scheduled: false,
      severity: "major",
      classification: "final_rule",
      sourceKey: "federal_register",
      sourceUrl: "https://www.federalregister.gov/documents/2026/1",
      summary: "USCIS is adjusting the fees that apply to certain benefit requests.",
      entityIds: ["agency:uscis"],
    };
    const facts = buildEventFacts(event, "/what-changed?q=fee", "2026-08-09");
    const permitted = permittedAgencies(facts);
    expect(permitted).toContain("uscis");
    expect(permitted).toContain("federal register");

    const prompt = buildUserPrompt({
      facts,
      slot: SLOT_BY_ID.get("morning")!,
      angle: "breaking_change",
      avoidOpenings: [],
    });
    const line = prompt.split("\n").find((l) => l.startsWith("- These agencies, written exactly like this:"))!;
    expect(line).toBeDefined();
    // Display case, not the lowercase match strings the validator compares on.
    // The first design showed "uscis" and the model wrote "dhs's final rule".
    expect(line).toContain(AGENCY_DISPLAY.uscis);
    expect(line).toContain(AGENCY_DISPLAY["federal register"]);
    expect(line).not.toMatch(/\buscis\b/);
    expect(prompt).not.toContain("No agency short name is available");
  });

  it("never advertises an agency the validator would reject", () => {
    // The prompt and the check read the same list, corpus and regex, so this
    // holds by construction — asserted anyway, because the two drifting apart is
    // exactly how a false permission would be introduced.
    const facts = dvFacts();
    const prompt = ask(facts);
    expect(prompt).not.toContain("These agencies, written exactly like this");
    for (const agency of ATTRIBUTABLE_AGENCIES) {
      if (permittedAgencies(facts).includes(agency)) continue;
      const display = AGENCY_DISPLAY[agency] ?? agency;
      expect(prompt.includes(`written exactly like this: ${display}`), agency).toBe(false);
    }
  });
});

describe("the X budget is counted the way X counts", () => {
  // THE 333-CHARACTER FAILURE, PINNED — AND THE TELEGRAM THAT FOLLOWED IT.
  //
  // The prompt once carried `const LINK_BUDGET = 45` and told the model it had
  // "about 215 to work with"; on an 86-character URL a perfectly obedient
  // model produced 302 characters against a 275 limit. The next fix computed
  // the budget from the literal URL, which was right about the arithmetic and
  // wrong about the platform: X wraps every link in a fixed-width t.co token.
  // Counting a 101-character link at its literal length left the writer about
  // 150 characters of prose, and the live account read like a telegram.
  //
  // So these tests assert ARITHMETIC rather than wording: the budget is derived
  // from X's link weight, is independent of the URL's literal length, and
  // leaves the complete post inside the validator's limit as X measures it.
  const slot = SLOT_BY_ID.get("evening")!;
  const facts = dvFacts();
  const prompt = buildUserPrompt({ facts, slot, angle: "deadline_approaching", avoidOpenings: [] });

  it("charges the t.co width for the link, not its literal length", () => {
    const b = xBudget(facts);
    expect(b.linkChars).toBe(X_URL_WEIGHT);
    expect(b.reservedChars).toBe(X_URL_WEIGHT + 1);
    expect(facts.deepLink.length).toBeGreaterThan(X_URL_WEIGHT);
  });

  it("does not move with the URL", () => {
    const short = xBudget({ ...facts, deepLink: "https://immigrationclock.com/key-dates" });
    const long = xBudget({
      ...facts,
      deepLink: "https://immigrationclock.com/what-changed?q=establishing%20fixed%20admission%20nonimmigrant%20students",
    });
    expect(short).toEqual(long);
    expect(short).toEqual(xBudget(facts));
  });

  it("gives the writer a real band, not a telegram", () => {
    const b = xBudget(facts);
    expect(b.proseMax).toBe(X_TARGET_MAX);
    expect(b.proseMin).toBe(X_TARGET_MIN);
    expect(b.proseMax).toBeGreaterThanOrEqual(220);
    expect(b.proseMin).toBeGreaterThanOrEqual(150);
    expect(b.proseMin).toBeLessThan(b.proseMax);
  });

  it("leaves the complete post inside the validator's limit, with margin", () => {
    const b = xBudget(facts);
    expect(b.hardTotal).toBe(LIMITS.x.maxChars);
    expect(b.proseMax + b.reservedChars + X_SAFETY_MARGIN).toBeLessThanOrEqual(LIMITS.x.maxChars);
  });

  it("holds for EVERY destination the catalogue can produce, including the longest", () => {
    // A 150-character tracked URL is the worst case now; the old literal
    // budget would have left it a hundred characters of prose.
    for (const link of [
      "https://immigrationclock.com/key-dates",
      "https://immigrationclock.com/what-changed?q=public%20charge%20ground%20inadmissibility",
      "https://immigrationclock.com/what-changed?q=establishing%20fixed%20admission%20nonimmigrant%20students",
      facts.deepLink,
    ]) {
      const b = xBudget({ ...facts, deepLink: link });
      const worstCasePost = "x".repeat(b.proseMax) + "\n" + link;
      expect(xWeightedLength(worstCasePost), link).toBeLessThanOrEqual(LIMITS.x.maxChars);
      expect(b.proseMax, link).toBeGreaterThan(LIMITS.x.minChars);
    }
  });

  it("states the three numbers in the prompt, so the model can do the arithmetic", () => {
    const b = xBudget(facts);
    expect(prompt).toContain(String(b.hardTotal));
    expect(prompt).toContain(String(b.proseMax));
    expect(prompt).toContain(String(b.linkChars));
    expect(prompt).toMatch(new RegExp(`Write between ${b.proseMin} and ${b.proseMax} characters of prose`));
  });

  it("tells the model the URL is counted the way X counts it", () => {
    expect(prompt).toMatch(/X counts any link as 23 characters/);
    expect(prompt).toContain("THE BUDGET, IN CHARACTERS AS X COUNTS THEM");
  });

  it("says what happens at the limit rather than only naming it", () => {
    expect(prompt).toMatch(/One over and the post is refused/);
  });

  it("names what may never be cut to make room", () => {
    // The failure mode a character budget invites: shortening by deleting the
    // effective date, which is the most useful fact in the post.
    expect(prompt).toMatch(/Never drop the effective date, the stage word, the subject or the link/);
  });

  it("is recorded as a new prompt version, so ledger rows are traceable", () => {
    expect(PROMPT_VERSION).toBe("social-prompt/9");
  });
});

describe("nothing else was relaxed", () => {
  it("the X limit is unchanged", () => {
    expect(LIMITS.x.maxChars).toBe(275);
  });

  it("the attribution list is unchanged", () => {
    expect(ATTRIBUTABLE_AGENCIES).toContain("state department");
    expect(ATTRIBUTABLE_AGENCIES).toContain("department of state");
    expect(ATTRIBUTABLE_AGENCIES.length).toBe(15);
  });

  it("every attributable agency has a display form", () => {
    for (const agency of ATTRIBUTABLE_AGENCIES) {
      expect(AGENCY_DISPLAY[agency], agency).toBeTruthy();
      expect(AGENCY_DISPLAY[agency].toLowerCase(), agency).toContain(agency.split(" ").pop()!);
    }
  });

  it("figure grounding, quotations and URLs still bite on this fact set", () => {
    const facts = dvFacts();
    const link = facts.deepLink;
    expect(
      validatePost(`Registration runs for 41 days this cycle. ${link}`, "x", facts).ok
    ).toBe(false);
    expect(
      validatePost(`The rules say "registration is free for everyone". ${link}`, "x", facts).ok
    ).toBe(false);
    expect(
      validatePost(`Read the entry instructions at https://example.com/dv ${link}`, "x", facts).ok
    ).toBe(false);
  });
});
