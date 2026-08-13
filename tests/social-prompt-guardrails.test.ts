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
// Both rejections were correct and neither is fixed by touching the validator.
// They are generation-layer problems:
//
//   • "at most 275" is a cliff, and a model writing to a cliff lands past it.
//   • The fact set names its source "U.S. Dept. of State — DV Program", which
//     contains no form of "State Department". The model supplied the attribution
//     from general knowledge — true of the world, absent from the closed world —
//     because nothing had told it which attributions were actually available.
//
// This file has two jobs. The FIRST half pins the validator's behaviour on the
// exact strings that failed, so the checks can never be quietly loosened to make
// this candidate pass. The SECOND half asserts the prompt now tells the model
// what it needs to know to avoid producing them.
// =============================================================================

import { describe, it, expect } from "vitest";
import { buildUserPrompt, PROMPT_VERSION, X_TARGET_MIN, X_TARGET_MAX } from "@/lib/social/prompt";
import {
  LIMITS,
  permittedAgencies,
  attributionCorpus,
  ATTRIBUTABLE_AGENCIES,
  validatePost,
} from "@/lib/social/validate";
import { buildKeyDateFacts, buildEventFacts } from "@/lib/social/facts";
import { KEY_DATES } from "@/lib/key-dates";
import { SLOT_BY_ID } from "@/lib/social/slots";
import type { IndexedEvent } from "@/lib/event-index";
import type { FactSet } from "@/lib/social/types";

const DV = KEY_DATES.find((k) => k.id === "dv-lottery")!;

/** The exact fact set the failing proposal was generated from. */
function dvFacts(): FactSet {
  return buildKeyDateFacts(DV, 53, "2026-10-01");
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

  it("rejects the X variant for length, at the length it actually was", () => {
    expect(FAILING_X.trim().length).toBe(286);
    const result = validatePost(FAILING_X, "x", facts);
    expect(result.ok).toBe(false);
    expect(result.failures).toContain(`Too long for x: 286 chars (max ${LIMITS.x.maxChars})`);
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

  it("still rejects the attribution after the length is fixed", () => {
    // Proves the two failures are independent. Trimming to fit does not make the
    // attribution available, and a fix that only shortened the copy would ship
    // an unsupported claim.
    const shortened =
      "Diversity Visa registration opens for roughly one month each fall. It is free and needs no employer or family sponsor. The State Department sets the exact window each year. https://immigrationclock.com/key-dates";
    expect(shortened.length).toBeLessThanOrEqual(LIMITS.x.maxChars);
    const result = validatePost(shortened, "x", facts);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/state department/i);
  });

  it("accepts the same post written without the unsupported attribution", () => {
    // The wording the prompt now steers toward: neutral, and grounded in the
    // fact set's own phrasing rather than in what the model knows.
    const neutral =
      "Diversity Visa registration opens for about one month in the fall. It is free and needs no employer or family sponsor. The exact window is set by the agency each year, so our date is approximate. https://immigrationclock.com/key-dates";
    expect(neutral.length).toBeLessThanOrEqual(LIMITS.x.maxChars);
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
    expect(ask(dvFacts())).toContain('Do not write "State Department"');
  });

  it("offers concrete neutral wording instead of only a prohibition", () => {
    const prompt = ask(dvFacts());
    expect(prompt).toContain('"the official instructions"');
    expect(prompt).toContain('"the program rules"');
  });

  it("says that certainty about the responsible agency is not permission", () => {
    expect(ask(dvFacts())).toMatch(/even if you are certain which agency is responsible/);
  });

  it("lists the agencies when the fact set does support them", () => {
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
    expect(prompt).toContain("These agency names, which the fact set does support");
    expect(prompt).toContain("uscis");
    expect(prompt).not.toContain("No agency short name is available");
  });

  it("never advertises an agency the validator would reject", () => {
    // The prompt and the check read the same list, corpus and regex, so this
    // holds by construction — asserted anyway, because the two drifting apart is
    // exactly how a false permission would be introduced.
    const facts = dvFacts();
    const prompt = ask(facts);
    for (const agency of ATTRIBUTABLE_AGENCIES) {
      if (permittedAgencies(facts).includes(agency)) continue;
      const advertised = prompt.includes(
        `These agency names, which the fact set does support: ${agency}`
      );
      expect(advertised, agency).toBe(false);
    }
  });
});

describe("the prompt asks X to leave margin below the hard limit", () => {
  const slot = SLOT_BY_ID.get("evening")!;
  const prompt = buildUserPrompt({
    facts: dvFacts(),
    slot,
    angle: "deadline_approaching",
    avoidOpenings: [],
  });

  it("states the 240–260 band", () => {
    expect(prompt).toContain(`${X_TARGET_MIN}–${X_TARGET_MAX} characters`);
  });

  it("keeps the band strictly inside the validator's limit", () => {
    expect(X_TARGET_MAX).toBeLessThan(LIMITS.x.maxChars);
    expect(X_TARGET_MIN).toBeGreaterThan(LIMITS.x.minChars);
  });

  it("says what happens at the limit rather than only naming it", () => {
    expect(prompt).toMatch(/hard limit that fails the post/);
    expect(prompt).toContain(`Copy that lands at ${LIMITS.x.maxChars + 1} is discarded`);
  });

  it("tells the model to count the link at full length", () => {
    expect(prompt).toMatch(/Count the link at its full literal length/);
  });

  it("is recorded as a new prompt version, so ledger rows are traceable", () => {
    expect(PROMPT_VERSION).toBe("social-prompt/4");
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
