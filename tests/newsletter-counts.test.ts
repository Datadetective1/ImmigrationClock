// =============================================================================
// CANONICAL COUNTS
//
// The first production issue (2026-08-08) shipped with a subject and opening
// saying "5 changes" beside a "By the numbers" block totalling 6. Both numbers
// were correct. Statistics were computed from the full in-window set and the
// story count from the capped slice, and the template presented two answers to
// two different questions as though they answered one.
//
// Every gate in the pipeline passed that issue, because no gate had ever
// compared two user-facing numbers to each other. These tests are that gate.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  canonicalCounts,
  categoryOf,
  countInconsistencies,
  dedupe,
  type IssueCounts,
} from "@/lib/newsletter/counts";
import { selectIssue, MAX_ITEMS } from "@/lib/newsletter/select";
import { renderIssue } from "@/lib/newsletter/render";
import { validateIssue, validateRendered } from "@/lib/newsletter/validate";
import { LOCALES, type Segment } from "@/lib/newsletter/types";
import { stringsFor } from "@/lib/newsletter/locales";
import type { ImmigrationEvent } from "@/domains/graph/events";

const BASE = "https://immigrationclock.com";
const CONTACT = "hello@immigrationclock.com";
const seg = (over: Partial<Segment> = {}): Segment => ({ id: "weekly-en", locale: "en", cadence: "weekly", ...over });

function ev(over: Partial<ImmigrationEvent> & { id: string }): ImmigrationEvent {
  return {
    sourceKey: "federal_register",
    classification: "final_rule",
    severity: "notable",
    title: "T",
    summary: "S",
    publishedAt: "2026-08-05",
    effectiveAt: null,
    lastVerifiedAt: "2026-08-08",
    sourceUrl: "https://www.federalregister.gov/x",
    entities: [],
    impact: { countries: [], visaCategories: [], agencies: [], employers: [], universities: [], states: [], completeness: "unspecified" },
    reviewStatus: "auto",
    limitations: [],
    ...over,
  } as unknown as ImmigrationEvent;
}

const all = (es: ImmigrationEvent[]) => new Set(es.map((e) => e.id));

// =============================================================================
// The arithmetic
// =============================================================================
describe("categories partition the recorded set", () => {
  it("puts every event in exactly one bucket", () => {
    const events = [
      ev({ id: "a", sourceKey: "uscis_policy_manual" }),
      ev({ id: "b", sourceKey: "uscis_newsroom" }),
      ev({ id: "c", sourceKey: "federal_register" }),
      ev({ id: "d", classification: "court_decision", sourceKey: "federal_courts" }),
      ev({ id: "e", classification: "executive_action" }),
    ];
    const c = canonicalCounts(events, all(events));
    expect(c.categories.reduce((n, x) => n + x.value, 0)).toBe(c.recorded);
    expect(c.recorded).toBe(5);
  });

  it("does NOT double-count a DHS-issued Federal Register rule", () => {
    // The old facets counted this in both `federal_register` (by source) and
    // `dhs_announcements` (by entity link). They summed to the total on
    // 2026-08-08 only by luck.
    const e = ev({ id: "x", sourceKey: "federal_register", entities: [{ entityId: "agency:dhs", relation: "issued_by", basis: "explicit", confidence: 1 }] as never });
    const c = canonicalCounts([e], all([e]));
    expect(c.recorded).toBe(1);
    expect(c.categories.reduce((n, x) => n + x.value, 0)).toBe(1);
    expect(categoryOf(e)).toBe("federal_register");
  });

  it("prefers the most specific bucket", () => {
    expect(categoryOf(ev({ id: "1", classification: "court_decision", sourceKey: "uscis_newsroom" }))).toBe("court_decisions");
    expect(categoryOf(ev({ id: "2", classification: "executive_action", sourceKey: "federal_register" }))).toBe("executive_actions");
  });

  it("DUPLICATE RECORDS DO NOT INFLATE COUNTS", () => {
    const a = ev({ id: "same", sourceKey: "uscis_newsroom" });
    const c = canonicalCounts([a, { ...a }, { ...a }], all([a]));
    expect(c.recorded).toBe(1);
    expect(dedupe([a, { ...a }])).toHaveLength(1);
    expect(countInconsistencies(c)).toEqual([]);
  });

  it("FILTERED RECORDS DO NOT LINGER IN AGGREGATES", () => {
    // Only what is passed in is counted; the caller does the filtering, and the
    // count never reaches back to an unfiltered source.
    const kept = [ev({ id: "k1" }), ev({ id: "k2" })];
    const c = canonicalCounts(kept, all(kept));
    expect(c.recorded).toBe(2);
  });

  it("reconciles shown, recorded and omitted", () => {
    const events = [ev({ id: "a" }), ev({ id: "b" }), ev({ id: "c" })];
    const c = canonicalCounts(events, new Set(["a", "b"]));
    expect(c).toMatchObject({ recorded: 3, shown: 2, omitted: 1 });
    expect(countInconsistencies(c)).toEqual([]);
  });

  it("ignores shown ids that are not in the canonical set", () => {
    const events = [ev({ id: "a" })];
    const c = canonicalCounts(events, new Set(["a", "ghost"]));
    expect(c.shown).toBe(1);
    expect(countInconsistencies(c)).toEqual([]);
  });
});

describe("the inconsistency detector", () => {
  const sound: IssueCounts = { recorded: 6, shown: 5, omitted: 1, categories: [{ key: "uscis_policy", value: 4 }, { key: "federal_register", value: 1 }, { key: "court_decisions", value: 1 }], absent: [] };

  it("passes a sound set", () => {
    expect(countInconsistencies(sound)).toEqual([]);
  });

  it("catches categories that do not sum to the total", () => {
    const bad = { ...sound, categories: [{ key: "uscis_policy", value: 4 }] };
    expect(countInconsistencies(bad).join()).toMatch(/sum to 4 but 6/);
  });

  it("catches more shown than recorded", () => {
    expect(countInconsistencies({ ...sound, shown: 9 }).join()).toMatch(/renders 9 stories but only 6/);
  });

  it("catches an omitted figure that does not reconcile", () => {
    expect(countInconsistencies({ ...sound, omitted: 4 }).join()).toMatch(/does not reconcile/);
  });

  it("catches a category reported both present and absent", () => {
    expect(countInconsistencies({ ...sound, absent: ["uscis_policy"] }).join()).toMatch(/both present and absent/);
  });
});

// =============================================================================
// End to end, against the real archive
// =============================================================================
describe("a real issue's user-facing numbers agree", () => {
  const wide = { windowDays: 900, today: "2026-08-04" };

  for (const locale of LOCALES) {
    it(`${locale}: subject count is the SHOWN count, never the archive total`, () => {
      const issue = selectIssue({ segment: seg({ id: `weekly-${locale}`, locale }), ...wide });
      const out = renderIssue(issue, BASE, CONTACT);
      const numbers = [...out.subject.matchAll(/\d+/g)].map((m) => Number(m[0]));
      expect(numbers).toContain(issue.counts.shown);
      if (issue.counts.recorded > issue.counts.shown) {
        expect(numbers, "subject leaked the archive total").not.toContain(issue.counts.recorded);
      }
    });

    it(`${locale}: the opening reconciles shown with recorded`, () => {
      const issue = selectIssue({ segment: seg({ id: `weekly-${locale}`, locale }), ...wide });
      const out = renderIssue(issue, BASE, CONTACT);
      if (issue.counts.recorded > issue.counts.shown) {
        const opening = stringsFor(locale).opening.withChanges(issue.counts.shown, issue.counts.recorded);
        expect(opening).toContain(String(issue.counts.recorded));
        expect(opening).toContain(String(issue.counts.shown));
        expect(out.text).toContain(opening);
      }
    });

    it(`${locale}: every category has a label, so none vanishes from the total`, () => {
      const issue = selectIssue({ segment: seg({ id: `weekly-${locale}`, locale }), ...wide });
      const t = stringsFor(locale);
      for (const c of issue.counts.categories) expect(t.stats[c.key], `${locale} missing label for ${c.key}`).toBeTruthy();
    });

    it(`${locale}: printed categories sum to the printed total`, () => {
      const issue = selectIssue({ segment: seg({ id: `weekly-${locale}`, locale }), ...wide });
      const out = renderIssue(issue, BASE, CONTACT);
      const t = stringsFor(locale);
      const sum = issue.counts.categories.reduce((n, c) => n + c.value, 0);
      expect(sum).toBe(issue.counts.recorded);
      expect(out.text).toContain(`${t.stats.total_recorded}: ${issue.counts.recorded}`);
    });
  }

  it("caps at five and reports the true total", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    expect(issue.counts.shown).toBeLessThanOrEqual(MAX_ITEMS);
    expect(issue.counts.recorded).toBeGreaterThanOrEqual(issue.counts.shown);
    expect(validateIssue(issue).errors).toEqual([]);
  });
});

// =============================================================================
// Validation refuses a contradictory issue
// =============================================================================
describe("a newsletter whose numbers disagree cannot be sent", () => {
  const wide = { windowDays: 900, today: "2026-08-04" };
  const issue = selectIssue({ segment: seg(), ...wide });

  it("rejects category counts that do not sum to the total", () => {
    const broken = { ...issue, counts: { ...issue.counts, categories: [{ key: "uscis_policy", value: 99 }] } };
    expect(validateIssue(broken).errors.join()).toMatch(/sum to 99/);
  });

  it("rejects a shown count that disagrees with the rendered story count", () => {
    const broken = { ...issue, counts: { ...issue.counts, shown: issue.counts.shown + 1 } };
    expect(validateIssue(broken).errors.join()).toMatch(/stories are shown but the issue renders/);
  });

  it("rejects a subject that states the archive total instead of the story count", () => {
    if (issue.counts.recorded <= issue.counts.shown) return;
    const good = renderIssue(issue, BASE, CONTACT);
    const broken = { ...good, subject: `Immigration Pulse — ${issue.counts.recorded} changes` };
    expect(validateRendered(issue, broken, BASE).errors.join()).toMatch(/archive total/);
  });

  it("rejects an opening that never reconciles the two numbers", () => {
    if (issue.counts.recorded <= issue.counts.shown) return;
    const good = renderIssue(issue, BASE, CONTACT);
    const opening = stringsFor("en").opening.withChanges(issue.counts.shown, issue.counts.recorded);
    const broken = { ...good, html: good.html.replace(opening.slice(0, 60), "This week brought some updates.") };
    expect(validateRendered(issue, broken, BASE).errors.join()).toMatch(/does not reconcile/);
  });
});

// =============================================================================
// Edge weeks
// =============================================================================
describe("edge weeks", () => {
  it("ZERO stories: no counts, no contradiction, quiet-week copy", () => {
    const issue = selectIssue({ segment: seg(), today: "2020-01-01", windowDays: 1 });
    expect(issue.counts).toMatchObject({ recorded: 0, shown: 0, omitted: 0 });
    expect(countInconsistencies(issue.counts)).toEqual([]);
    const out = renderIssue(issue, BASE, CONTACT);
    expect(out.html).toContain("No significant official changes");
    expect(validateRendered(issue, out, BASE).errors).toEqual([]);
  });

  it("ONE story: singular copy, and shown equals recorded", () => {
    const one = [ev({ id: "solo", sourceKey: "uscis_newsroom" })];
    const c = canonicalCounts(one, all(one));
    expect(c).toMatchObject({ recorded: 1, shown: 1, omitted: 0 });
    expect(stringsFor("en").opening.withChanges(1, 1)).toMatch(/1 official immigration update\./);
    expect(countInconsistencies(c)).toEqual([]);
  });

  it("MULTIPLE CATEGORIES reconcile exactly", () => {
    const events = [
      ev({ id: "u1", sourceKey: "uscis_policy_manual" }),
      ev({ id: "u2", sourceKey: "uscis_newsroom" }),
      ev({ id: "f1", sourceKey: "federal_register" }),
      ev({ id: "c1", classification: "court_decision", sourceKey: "federal_courts" }),
      ev({ id: "x1", classification: "executive_action" }),
    ];
    const c = canonicalCounts(events, new Set(["u1", "u2", "f1"]));
    expect(c.recorded).toBe(5);
    expect(c.shown).toBe(3);
    expect(c.omitted).toBe(2);
    expect(Object.fromEntries(c.categories.map((x) => [x.key, x.value]))).toEqual({
      uscis_policy: 2,
      federal_register: 1,
      court_decisions: 1,
      executive_actions: 1,
    });
    expect(countInconsistencies(c)).toEqual([]);
  });

  it("reproduces the 2026-08-08 shape and finds it sound", () => {
    // 4 USCIS + 1 Federal Register + 1 court = 6 recorded, 5 shown.
    const events = [
      ev({ id: "u1", sourceKey: "uscis_newsroom" }),
      ev({ id: "u2", sourceKey: "uscis_policy_manual" }),
      ev({ id: "u3", sourceKey: "uscis_policy_manual" }),
      ev({ id: "u4", sourceKey: "uscis_policy_manual" }),
      ev({ id: "f1", sourceKey: "federal_register" }),
      ev({ id: "c1", classification: "court_decision", sourceKey: "federal_courts" }),
    ];
    const c = canonicalCounts(events, new Set(["u1", "u2", "u3", "f1", "c1"]));
    expect(c.recorded).toBe(6);
    expect(c.shown).toBe(5);
    expect(c.categories.reduce((n, x) => n + x.value, 0)).toBe(6);
    expect(countInconsistencies(c)).toEqual([]);
    // And the copy now says both numbers.
    const opening = stringsFor("en").opening.withChanges(5, 6);
    expect(opening).toMatch(/6 official immigration updates/);
    expect(opening).toMatch(/5 most consequential/);
  });
});
