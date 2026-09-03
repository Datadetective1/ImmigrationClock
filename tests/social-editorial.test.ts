// =============================================================================
// THE EDITORIAL IDENTITY
//
// The dry run before this change produced accurate copy that could have come
// from any immigration news feed. Nothing was wrong with it; nothing made it
// ImmigrationClock either.
//
// What distinguishes this account is the TIME dimension — when a change bites,
// which window is open, what is still ahead — and, since the ninth prompt, a
// VOICE and a choice of SHAPES rather than one template. These tests pin the
// two halves of making that reliable:
//
//   • The PROMPT must put timing in front of the model, as words, and must make
//     an ABSENT date as visible as a present one — sayable in plain words, and
//     never the opening. It must name the content type, offer the shapes, list
//     the implications the record supports, and show agencies as a person
//     writes them.
//
//   • The VALIDATOR must refuse the one claim this framing makes tempting: that
//     ImmigrationClock knows something about the reader's own case. It tracks
//     rules and calendars and never held a case record, so that claim is false
//     about the product — made to people anxious enough to believe it.
// =============================================================================

import { describe, it, expect } from "vitest";
import { buildUserPrompt, SYSTEM_PROMPT, PROMPT_VERSION } from "@/lib/social/prompt";
import { validatePost, VALIDATOR_VERSION } from "@/lib/social/validate";
import { buildEventFacts, buildKeyDateFacts } from "@/lib/social/facts";
import { SLOT_BY_ID } from "@/lib/social/slots";
import { KEY_DATES } from "@/lib/key-dates";
import type { IndexedEvent } from "@/lib/event-index";
import type { Angle, FactSet, SlotId } from "@/lib/social/types";

const TODAY = "2026-08-11";

function event(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: "federal_register:x1",
    title: "Fee Adjustment for Certain Immigration Benefit Requests",
    publishedAt: "2026-08-10",
    effectiveAt: "2026-09-18",
    scheduled: false,
    severity: "major",
    classification: "final_rule",
    sourceKey: "federal_register",
    sourceUrl: "https://www.federalregister.gov/documents/x1",
    summary: "USCIS is adjusting the fees that apply to certain benefit requests.",
    entityIds: ["agency:uscis", "visa:h-1b"],
    ...over,
  } as IndexedEvent;
}

const ask = (facts: FactSet, angle: Angle = "breaking_change", slot: SlotId = "morning") =>
  buildUserPrompt({ facts, slot: SLOT_BY_ID.get(slot)!, angle, avoidOpenings: [] });

// -----------------------------------------------------------------------------

describe("the account knows what it is for", () => {
  it("states the voice, and what it is not", () => {
    expect(SYSTEM_PROMPT).toContain("THE VOICE");
    expect(SYSTEM_PROMPT).toMatch(/Clear\. Curious\. Precise\. Calm\. Useful\. Human\. Data-literate\./);
    expect(SYSTEM_PROMPT).toMatch(/not the voice of a press release or a database/);
  });

  it("makes timing the point, and never invented", () => {
    expect(SYSTEM_PROMPT).toContain("TIMING IS THE POINT, AND TIMING IS NEVER INVENTED");
    expect(SYSTEM_PROMPT).toMatch(/If the facts record an effective date, it belongs in the post, as words/);
    expect(SYSTEM_PROMPT).toMatch(/Never state a consequence, deadline or next step the facts do not carry/);
  });

  it("gives the post a choice of shapes rather than one template", () => {
    expect(SYSTEM_PROMPT).toContain("THE SHAPE OF THE POST");
    expect(SYSTEM_PROMPT).toMatch(/Do not blend shapes, and do not open every post the same way/);
    expect(SYSTEM_PROMPT).toMatch(/the account must not read as one template with the nouns swapped/);
  });

  it("names the stage words, because the difference is the story", () => {
    for (const stage of ["proposed", "announced", "finalised", "effective", "enjoined", "rescinded"]) {
      expect(SYSTEM_PROMPT, stage).toMatch(new RegExp(`^\\s*${stage}\\s{2,}`, "m"));
    }
  });

  it("forbids implying the account knows about a reader's own filing", () => {
    expect(SYSTEM_PROMPT).toMatch(/does not track anyone's individual case/);
    expect(SYSTEM_PROMPT).toMatch(/Never write "your case", "check your status here"/);
  });

  it("is versioned, so a change of voice is traceable in the ledger", () => {
    expect(PROMPT_VERSION).toBe("social-prompt/9");
    expect(VALIDATOR_VERSION).toBe("social-validator/8");
  });
});

describe("timing is rendered as a fact, in both directions", () => {
  it("puts a recorded effective date in front of the model, as words and as ISO", () => {
    const prompt = ask(buildEventFacts(event(), "/what-changed?q=fee", TODAY));
    expect(prompt).toContain("TIMING — the part this publication exists for");
    expect(prompt).toContain("Takes effect: September 18, 2026 (2026-09-18)");
    expect(prompt).toMatch(/Write it as words/);
    expect(prompt).toMatch(/most useful fact you have/);
  });

  it("renders every date as words with the ISO in parentheses, never as a bare ISO", () => {
    // Dates appeared as "2026-09-18" in published posts because that is how
    // the fact set showed them. Now the words come first.
    const prompt = ask(buildEventFacts(event(), "/what-changed?q=fee", TODAY));
    expect(prompt).toContain("PUBLISHED: August 10, 2026 (2026-08-10)");
    expect(prompt).toContain("EFFECTIVE: September 18, 2026 (2026-09-18)");
    expect(SYSTEM_PROMPT).toMatch(/Write dates as words/);
    expect(SYSTEM_PROMPT).toMatch(/Never "2026-09-30"/);
  });

  it("states an ABSENT date positively, and forbids leading with it", () => {
    // The failure this prevents in both directions: a model told "do not state
    // an effective date" simply omits timing, and a model told "state that none
    // is recorded" opens on the absence before naming the subject.
    const prompt = ask(buildEventFacts(event({ effectiveAt: null }), "/what-changed?q=fee", TODAY));
    expect(prompt).toMatch(/No effective or implementation date is recorded for this document/);
    expect(prompt).toMatch(/You may say so in plain words/);
    expect(prompt).toMatch(/never open on its absence/);
  });

  it("tells the model a proposal is not on anyone's calendar, and what would change that", () => {
    const proposed = event({ classification: "proposed_rule", effectiveAt: null });
    const prompt = ask(buildEventFacts(proposed, "/what-changed?q=fee", TODAY));
    expect(prompt).toMatch(/This is a PROPOSAL\. It is not on anyone's calendar/);
    expect(prompt).toMatch(/would have to be finalised/);
  });

  it("never invites a proposal to carry an effective date", () => {
    const proposed = event({ classification: "proposed_rule", effectiveAt: null });
    const prompt = ask(buildEventFacts(proposed, "/what-changed?q=fee", TODAY));
    expect(prompt).not.toMatch(/No effective or implementation date is recorded/i);
    expect(SYSTEM_PROMPT).toMatch(/A proposed rule is not on anyone's calendar/);
    expect(SYSTEM_PROMPT).toMatch(/never give it a start date; use the conditional/);
  });

  it("closes the door on any other timing claim", () => {
    const prompt = ask(buildEventFacts(event(), "/what-changed?q=fee", TODAY));
    expect(prompt).toMatch(/not available unless it appears below/);
  });

  it("asks a recurring window for how far away it is, not a description of the programme", () => {
    const dv = KEY_DATES.find((k) => k.id === "dv-lottery")!;
    const prompt = buildUserPrompt({
      facts: buildKeyDateFacts(dv, 51, "2026-10-01", "2026-08-15"),
      slot: SLOT_BY_ID.get("evening")!,
      angle: "preparation_window",
      avoidOpenings: [],
    });
    expect(prompt).toMatch(/CONTENT TYPE: KEY DATE/);
    expect(prompt).toMatch(/recurring calendar window, not a change/);
    expect(prompt).toMatch(/how far away it is/);
    expect(prompt).toMatch(/Never tell anyone to act/);
  });

  it("pairs a requirement with the date it applies from", () => {
    const prompt = ask(buildEventFacts(event(), "/what-changed?q=fee", TODAY), "what_it_requires");
    expect(prompt).toContain("Takes effect: September 18, 2026 (2026-09-18)");
    expect(prompt).toMatch(/the post is rejected without it/);
  });
});

describe("the ninth prompt tells the writer what kind of post this is", () => {
  const facts = () => buildEventFacts(event(), "/what-changed?q=fee", TODAY);

  it("names the content type and its brief", () => {
    const prompt = ask(facts());
    expect(prompt).toMatch(/^CONTENT TYPE: BREAKING \/ MATERIAL CHANGE/m);
    expect(prompt).toMatch(/The stage word is load-bearing/);
  });

  it("offers the shapes, marks the ones used recently, and refuses a third run", () => {
    const prompt = buildUserPrompt({
      facts: facts(),
      slot: SLOT_BY_ID.get("morning")!,
      angle: "breaking_change",
      contentType: "breaking_change",
      structures: ["news", "direct", "address", "date_lede"],
      recentStructures: ["news", "news"],
      avoidOpenings: [],
    });
    expect(prompt).toContain("SHAPES ON OFFER");
    expect(prompt).toMatch(/- news \(News\) — USED RECENTLY/);
    expect(prompt).toMatch(/- direct \(Direct\): /);
    expect(prompt).toMatch(/A third consecutive use of the same shape is refused/);
  });

  it("lists the implications the record supports, as the only significance it may claim", () => {
    const prompt = ask(facts());
    expect(prompt).toContain("IMPLICATIONS YOU MAY STATE");
    expect(prompt).toMatch(/The rule is final but does not apply until September 18, 2026/);
    expect(prompt).toMatch(/ImmigrationClock is watching the September 18, 2026 effective date/);
  });

  it("shows permitted agencies as a person writes them, not as match strings", () => {
    // Five published posts wrote "dhs's final rule" because the prompt showed
    // the lowercase match strings. The attribution line now shows display case.
    const prompt = ask(facts());
    const line = prompt.split("\n").find((l) => l.startsWith("- These agencies, written exactly like this:"))!;
    expect(line).toBeDefined();
    expect(line).toContain("USCIS");
    expect(line).toContain("the Federal Register");
    expect(line).not.toMatch(/\buscis\b/);
  });
});

describe("the validator refuses individual-case claims", () => {
  const facts = buildEventFacts(event(), "/what-changed?q=fee", TODAY);
  const link = facts.deepLink;

  const rejected = [
    `The fee changes on 18 September. Track your case status here. ${link}`,
    `New fees are set. Check your application status for the new amount. ${link}`,
    `Fees are adjusting. What this means for your petition, in detail. ${link}`,
    `A fee change lands next month. Your case outcome may differ from the schedule. ${link}`,
  ];

  it("rejects copy implying it follows a reader's own filing", () => {
    for (const text of rejected) {
      const result = validatePost(text, "x", facts);
      expect(result.ok, text).toBe(false);
      expect(result.failures.join(" "), text).toMatch(/individual case|reader's own case/i);
    }
  });

  it("still accepts the ordinary sense of 'track' — we track rules, not people", () => {
    // Carries the effective date because this fact set has a future one, and
    // the validator requires the date to survive into the copy. The test is
    // about the verb "track", and a sample that failed a different rule would
    // prove nothing about it either way.
    const fine = `ImmigrationClock tracks the fee schedule and records when each change takes effect — this one on 2026-09-18 — with the source on every entry. ${link}`;
    expect(validatePost(fine, "x", facts).failures).toEqual([]);
  });

  it("accepts a timing-led post of exactly the shape the strategy asks for", () => {
    // What changed, when it matters, who should pay attention — grounded, no
    // instruction, no case claim, no invented date.
    const good =
      `USCIS is adjusting fees for certain benefit requests. The change takes effect on 2026-09-18, so filings before that date fall under the current schedule. ${link}`;
    const result = validatePost(good, "x", facts);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("keeps every pre-existing refusal intact", () => {
    // The new group is an addition. Spot-check one member of each older group so
    // a future edit to ALL_BANNED cannot quietly drop one.
    const cases: [string, RegExp][] = [
      [`The rule is likely to expand next year. ${link}`, /prediction/],
      [`You should file before the deadline. ${link}`, /instruction to the reader/],
      [`An unprecedented change to the fee schedule. ${link}`, /superlative/],
      [`Follow us for more immigration updates. ${link}`, /engagement bait/],
      [`Did you know the fee schedule changed? ${link}`, /engagement bait/],
    ];
    for (const [text, expected] of cases) {
      const result = validatePost(text, "x", facts);
      expect(result.ok, text).toBe(false);
      expect(result.failures.join(" "), text).toMatch(expected);
    }
  });
});
