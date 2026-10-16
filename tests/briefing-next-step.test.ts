// =============================================================================
// BRIEFING NEXT STEPS — written for a reader, not a compliance team
//
// The Monitor's brief tells teams to review "internal workflows, templates or
// checklists". A Briefing subscriber is usually following policy for
// themselves or their family, so the Briefing and its exports say what a
// reader can do: read the official record, and ask qualified help about
// their own situation. Never a statement about whether a change applies.
// =============================================================================

import { describe, expect, it } from "vitest";
import { EVENTS } from "@/lib/event-store";
import { toPublicChange, type ChangeInput } from "@/lib/intelligence/change";
import { readerNextStep } from "@/lib/pro/assess";
import { buildBriefing, savedBriefs } from "@/lib/pro/feed";
import { renderBriefHtml, renderBriefMarkdown } from "@/lib/pro/export";

const ALL = EVENTS as unknown as ChangeInput[];
const TODAY = "2026-10-16";
const ENTERPRISE = /workflow|template|checklist|procedure|\bteams?\b|internal/i;
const ADVICE = /\byou (must|should|need to|qualify|are eligible)|affects you|applies to you/i;

describe("readerNextStep", () => {
  const steps = ALL.map((e) => [e.id, readerNextStep(toPublicChange(e, TODAY), TODAY)] as const);

  it("never frames a step as an organisation's compliance work, or as advice about a case", () => {
    for (const [id, step] of steps) {
      expect(step, id).not.toMatch(ENTERPRISE);
      expect(step, id).not.toMatch(ADVICE);
    }
  });

  it("points at the record, and says what kind of record a proposal is", () => {
    const proposal = ALL.find((e) => toPublicChange(e, TODAY).status === "proposed")!;
    expect(readerNextStep(toPublicChange(proposal, TODAY), TODAY)).toMatch(/proposal, not a final rule/);
    const base = toPublicChange(ALL.find((e) => e.classification === "final_rule")!, TODAY);
    const ahead = readerNextStep({ ...base, status: "scheduled", effectiveDate: "2026-12-01", amendedBy: [] }, TODAY);
    expect(ahead).toMatch(/before 2026-12-01/);
    expect(ahead).toMatch(/immigration attorney or a DOJ-accredited representative/);
    expect(readerNextStep({ ...base, amendedBy: ["x"] }, TODAY)).toMatch(/later record amends this one/);
  });

  it("only uses a date the record states", () => {
    for (const e of ALL) {
      const c = toPublicChange(e, TODAY);
      const dates = readerNextStep(c, TODAY).match(/\d{4}-\d{2}-\d{2}/g) ?? [];
      for (const d of dates) expect(d, e.id).toBe(c.effectiveDate);
    }
  });
});

describe("exports use the reader's next step", () => {
  it("feed and saved briefs carry no compliance-team wording", () => {
    const feed = buildBriefing({ follows: ["visa:h-1b", "agency:uscis"], savedIds: [], today: TODAY }).feed;
    const entries = feed.slice(0, 15).map((i) => ({ change: i.change, brief: i.brief, path: i.path, statusText: i.assessment.status }));
    const saved = savedBriefs(feed.slice(0, 5).map((i) => i.change.id), TODAY);
    for (const doc of [entries, saved]) {
      const args = { title: "Brief", generatedAt: TODAY, origin: "https://immigrationclock.com", entries: doc };
      // The documents' own text may say "procedures"; only our sentences are checked.
      for (const out of [renderBriefMarkdown(args), renderBriefHtml(args)]) {
        const ours = out.split("\n").filter((l) => /Suggested next step|Potential relevance/.test(l));
        expect(ours.length).toBe(doc.length);
        for (const l of ours) expect(l).not.toMatch(ENTERPRISE);
      }
    }
  });
});
