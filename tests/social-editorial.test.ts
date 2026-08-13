// =============================================================================
// THE EDITORIAL IDENTITY
//
// The dry run before this change produced accurate copy that could have come
// from any immigration news feed. Nothing was wrong with it; nothing made it
// ImmigrationClock either.
//
// What distinguishes this account is the TIME dimension — when a change bites,
// which window is open, what is still ahead. These tests pin the two halves of
// making that reliable:
//
//   • The PROMPT must put timing in front of the model, and must make an ABSENT
//     date as visible as a present one. A missing effective date is information
//     ("no date has been set"), not a gap to write around, and it is the honest
//     answer far more often than a date is.
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
const LINK = "https://immigrationclock.com/what-changed?q=fee";

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
  it("states the time dimension as the subject, not as a nice-to-have", () => {
    expect(SYSTEM_PROMPT).toContain("TIME DIMENSION");
    expect(SYSTEM_PROMPT).toMatch(/Anyone can restate a Federal Register summary/);
  });

  it("gives the post a shape rather than a checklist", () => {
    expect(SYSTEM_PROMPT).toContain(
      "WHAT CHANGED  ->  WHEN IT MATTERS  ->  WHO SHOULD PAY ATTENTION  ->  WHAT HAPPENS NEXT"
    );
    // The beats are droppable. A four-part template applied to a two-fact
    // subject is padding, which is what the whole system exists to avoid.
    expect(SYSTEM_PROMPT).toMatch(/Drop a beat the fact set cannot support/);
  });

  it("forbids implying the account knows about a reader's own filing", () => {
    expect(SYSTEM_PROMPT).toMatch(/does not track anyone's individual case/);
    expect(SYSTEM_PROMPT).toMatch(/never the reader's file/);
  });

  it("is versioned, so a change of voice is traceable in the ledger", () => {
    expect(PROMPT_VERSION).toBe("social-prompt/4");
    expect(VALIDATOR_VERSION).toBe("social-validator/3");
  });
});

describe("timing is rendered as a fact, in both directions", () => {
  it("puts a recorded effective date in front of the model", () => {
    const prompt = ask(buildEventFacts(event(), "/what-changed?q=fee", TODAY));
    expect(prompt).toContain("TIMING — the part this account exists for");
    expect(prompt).toContain("Takes effect: 2026-09-18");
    expect(prompt).toMatch(/most useful fact you have/);
  });

  it("states an ABSENT date positively, instead of only forbidding one", () => {
    // The failure this prevents: a model told "do not state an effective date"
    // simply omits timing, and the post reads like a news summary again.
    const prompt = ask(buildEventFacts(event({ effectiveAt: null }), "/what-changed?q=fee", TODAY));
    expect(prompt).toMatch(/NO effective or implementation date is recorded/);
    expect(prompt).toMatch(/the absence is the timing information/i);
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
    expect(prompt).not.toMatch(/NO effective or implementation date is recorded/);
    expect(SYSTEM_PROMPT).toMatch(/Never give a proposed rule an effective date/);
  });

  it("closes the door on any other timing claim", () => {
    const prompt = ask(buildEventFacts(event(), "/what-changed?q=fee", TODAY));
    expect(prompt).toMatch(/not available unless it appears in the facts below/);
  });

  it("asks a recurring window for preparation time, not a description of the programme", () => {
    const dv = KEY_DATES.find((k) => k.id === "dv-lottery")!;
    const prompt = buildUserPrompt({
      facts: buildKeyDateFacts(dv, 51, "2026-10-01"),
      slot: SLOT_BY_ID.get("evening")!,
      angle: "preparation_window",
      avoidOpenings: [],
    });
    expect(prompt).toMatch(/The value is knowing it is coming, not being hurried/);
    expect(SYSTEM_PROMPT).toMatch(/the useful thing is the preparation time ahead of it/);
  });

  it("pairs a requirement with the date it applies from", () => {
    const prompt = ask(buildEventFacts(event(), "/what-changed?q=fee", TODAY), "what_it_requires");
    expect(prompt).toMatch(/the reader's real question is FROM WHEN/);
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
    const fine = `ImmigrationClock tracks the fee schedule and records when each change takes effect, with the source on every entry. ${link}`;
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
    ];
    for (const [text, expected] of cases) {
      const result = validatePost(text, "x", facts);
      expect(result.ok, text).toBe(false);
      expect(result.failures.join(" "), text).toMatch(expected);
    }
  });
});
