// =============================================================================
// EXPLANATIONS
//
// The requirement: concise explanations that cite their evidence and never
// assert anything the source documents do not.
//
// The whole design rests on one property — every clause RESTATES a verified
// field rather than interpreting it. These tests hold that property, because it
// is the only thing standing between "an explanation" and "a claim about
// immigration law that nobody checked".
// =============================================================================
import { describe, it, expect } from "vitest";
import { explainEvent, explanationText } from "@/domains/graph/explain";
import { labelForEntity } from "@/lib/entity-labels";
import { EVENTS } from "@/lib/event-store";
import type { ImmigrationEvent } from "@/domains/graph/events";

const TODAY = "2026-08-02";

function makeEvent(over: Partial<ImmigrationEvent> = {}): ImmigrationEvent {
  return {
    id: "federal_register:1",
    sourceKey: "federal_register",
    classification: "final_rule",
    severity: "major",
    title: "A rule",
    summary: "A summary.",
    publishedAt: "2026-07-01",
    lastVerifiedAt: "2026-07-01",
    sourceUrl: "https://www.federalregister.gov/x",
    entities: [],
    reviewStatus: "auto",
    ...over,
  };
}

describe("is it in force", () => {
  it("says a proposal changes nothing today", () => {
    // The single most consequential sentence this module produces.
    const [c] = explainEvent(makeEvent({ classification: "proposed_rule" }), TODAY);
    expect(c.text).toMatch(/not a rule/);
    expect(c.text).toMatch(/changes nothing today/);
  });

  it("distinguishes a rule already in effect from one that is not yet", () => {
    const past = explainEvent(makeEvent({ effectiveAt: "2026-01-01" }), TODAY)[0];
    expect(past.text).toMatch(/has been in effect since 2026-01-01/);

    const future = explainEvent(makeEvent({ effectiveAt: "2026-12-01" }), TODAY)[0];
    expect(future.text).toMatch(/does not take effect until 2026-12-01/);
  });

  it("says scheduled rather than published for a document on public inspection", () => {
    const [c] = explainEvent(
      makeEvent({ publishedAt: "2026-08-20", scheduled: true, effectiveAt: null }),
      TODAY
    );
    expect(c.text).toMatch(/scheduled for publication on 2026-08-20/);
    expect(c.text).not.toMatch(/in effect/);
  });

  it("admits when a final rule states no effective date", () => {
    const [c] = explainEvent(makeEvent({ effectiveAt: null }), TODAY);
    expect(c.text).toMatch(/does not state an effective date/);
  });

  it("does not present a court decision as settled", () => {
    const [c] = explainEvent(makeEvent({ classification: "court_decision" }), TODAY);
    expect(c.text).toMatch(/stayed, narrowed, or reversed/);
  });

  it("does not present enactment as implementation", () => {
    const [c] = explainEvent(makeEvent({ classification: "legislative_action" }), TODAY);
    expect(c.text).toMatch(/When its provisions start/);
  });

  it("says a statistical release changes nobody's status", () => {
    const [c] = explainEvent(makeEvent({ classification: "data_release" }), TODAY);
    expect(c.text).toMatch(/changes no one's status or obligations/);
  });

  it("says an announcement is not the legal instrument", () => {
    const [c] = explainEvent(makeEvent({ classification: "announcement" }), TODAY);
    expect(c.text).toMatch(/legal instrument.*published separately/);
  });
});

describe("who it covers", () => {
  const withStated = (over = {}) =>
    makeEvent({
      impact: {
        countries: [{ entityId: "country:venezuela", basis: "stated", evidence: "…Venezuela…", confidence: 1 }],
        visaCategories: [],
        agencies: [],
        employers: [],
        universities: [],
        states: [],
        completeness: "partial",
        ...over,
      },
    });

  it("names only what the document itself states", () => {
    const clauses = explainEvent(withStated(), TODAY, labelForEntity);
    const scope = clauses.find((c) => c.basis.startsWith("impact.stated"))!;
    expect(scope.text).toMatch(/Venezuela/);
  });

  it("never names an inferred entity as covered", () => {
    // An inference is our reading. It has no place in a sentence telling
    // someone whether a change applies to them.
    const inferredOnly = makeEvent({
      impact: {
        countries: [{ entityId: "country:haiti", basis: "inferred", confidence: 0.6 }],
        visaCategories: [], agencies: [], employers: [], universities: [], states: [],
        completeness: "partial",
      },
    });
    const clauses = explainEvent(inferredOnly, TODAY, labelForEntity);
    expect(clauses.some((c) => c.text.includes("Haiti"))).toBe(false);
  });

  it("says a partial list may be incomplete, and an exhaustive one is closed", () => {
    const partial = explainEvent(withStated(), TODAY, labelForEntity).find((c) =>
      c.basis.startsWith("impact.stated")
    )!;
    expect(partial.text).toMatch(/may identify others/);

    const exhaustive = explainEvent(withStated({ completeness: "exhaustive" }), TODAY, labelForEntity).find(
      (c) => c.basis.startsWith("impact.stated")
    )!;
    expect(exhaustive.text).toMatch(/closed list/);
  });

  it("explains delegated scope instead of implying nobody is covered", () => {
    const delegated = makeEvent({
      impact: {
        countries: [], visaCategories: [], agencies: [], employers: [], universities: [], states: [],
        completeness: "unspecified",
        scopeDefinedElsewhere: { evidence: "…as determined by the Secretary…", note: "see the agency list" },
      },
    });
    const clauses = explainEvent(delegated, TODAY, labelForEntity);
    expect(clauses.some((c) => c.basis === "impact.scopeDefinedElsewhere")).toBe(true);
  });

  it("renders entity names as words, never as raw ids", () => {
    // REGRESSION: the naive slug fallback rendered "visa:b-1-b-2" as "b 1 b 2".
    const e = makeEvent({
      impact: {
        countries: [], states: [], agencies: [], employers: [], universities: [],
        visaCategories: [{ entityId: "visa:b-1-b-2", basis: "stated", evidence: "…B-1/B-2…", confidence: 1 }],
        completeness: "partial",
      },
    });
    const scope = explainEvent(e, TODAY, labelForEntity).find((c) => c.basis.startsWith("impact.stated"))!;
    expect(scope.text).toMatch(/B-1\/B-2/);
    expect(scope.text).not.toMatch(/b 1 b 2/i);
    expect(scope.text).not.toMatch(/visa:/);
  });

  it("capitalises only word initials in the fallback labeller", () => {
    // REGRESSION: a corrupted regex uppercased EVERY character, so an unseeded
    // entity rendered as "SOUTH SUDAN" mid-sentence.
    const e = makeEvent({
      impact: {
        countries: [{ entityId: "country:south-sudan", basis: "stated", evidence: "…", confidence: 1 }],
        visaCategories: [], agencies: [], employers: [], universities: [], states: [],
        completeness: "partial",
      },
    });
    const scope = explainEvent(e, TODAY).find((c) => c.basis.startsWith("impact.stated"))!;
    expect(scope.text).toMatch(/South Sudan/);
    expect(scope.text).not.toMatch(/SOUTH SUDAN/);
  });
});

describe("required action", () => {
  const withAction = makeEvent({
    impact: {
      countries: [], visaCategories: [], agencies: [], employers: [], universities: [], states: [],
      completeness: "partial",
      actionRequired: { summary: "The document states a requirement.", evidence: "…may be required to post a bond…" },
    },
  });

  it("says a requirement exists without paraphrasing it", () => {
    // The verbatim quote renders beside this. Paraphrasing the obligation here
    // would be the platform authoring a legal requirement.
    const c = explainEvent(withAction, TODAY).find((x) => x.basis === "impact.actionRequired")!;
    expect(c.text).toMatch(/states a requirement/);
    expect(c.text).toMatch(/quoted above/);
  });

  it("never phrases it as advice", () => {
    for (const e of EVENTS) {
      for (const c of explainEvent(e, TODAY, labelForEntity)) {
        expect(c.text, `${e.id}: advice-shaped`).not.toMatch(/\byou (should|must|need to|have to)\b/i);
        expect(c.text, `${e.id}: recommendation`).not.toMatch(/\bwe recommend\b|\byou can safely\b/i);
      }
    }
  });
});

// =============================================================================
// The property the whole design rests on.
// =============================================================================
describe("every clause is traceable and nothing is invented", () => {
  it("explains every event in the archive", () => {
    // An event with no explanation is one where a reader gets a title and is
    // left to work out whether it binds them.
    const missing = EVENTS.filter((e) => explainEvent(e, TODAY, labelForEntity).length === 0);
    expect(missing.map((e) => e.id)).toEqual([]);
  });

  it("gives every clause a named basis", () => {
    for (const e of EVENTS) {
      for (const c of explainEvent(e, TODAY, labelForEntity)) {
        expect(c.basis, `${e.id} has an unattributed clause`).toBeTruthy();
      }
    }
  });

  it("stays short enough to actually be read", () => {
    // An explanation that has to be skimmed has failed at being an explanation.
    for (const e of EVENTS) {
      expect(explainEvent(e, TODAY, labelForEntity).length, `${e.id} is over-long`).toBeLessThanOrEqual(3);
    }
  });

  it("hedges nothing and predicts nothing", () => {
    // "Likely", "probably", "expected to" would all be the platform speculating
    // about documents rather than reporting them.
    for (const e of EVENTS) {
      const text = explanationText(e, TODAY, labelForEntity);
      expect(text, `${e.id}`).not.toMatch(/\b(likely|probably|presumably|expected to|we think|appears to mean)\b/i);
    }
  });

  it("asserts no date the event does not carry", () => {
    // Any date in an explanation must appear on the event itself.
    for (const e of EVENTS) {
      const text = explanationText(e, TODAY, labelForEntity);
      const dates = text.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
      const known = new Set([e.publishedAt, e.effectiveAt, e.dataThrough].filter(Boolean) as string[]);
      for (const d of dates) {
        expect(known.has(d), `${e.id}: explanation cites ${d}, which is not on the event`).toBe(true);
      }
    }
  });

  it("is deterministic — the same event always explains the same way", () => {
    for (const e of EVENTS.slice(0, 40)) {
      expect(explanationText(e, TODAY, labelForEntity)).toBe(explanationText(e, TODAY, labelForEntity));
    }
  });
});
