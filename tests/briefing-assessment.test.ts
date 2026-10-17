// =============================================================================
// BRIEFING: RELEVANCE, URGENCY AND STATUS — against real records
//
// Each case below was found in production by reading the feed:
//   • a December 2025 major final rule listed under "Needs attention" in
//     October 2026, on severity alone;
//   • the 9-11 H-1B/L-1 biometric fee rule matching an F-1 follow on a body
//     sentence that only defines F-1;
//   • proposals needing to be kept apart from final rules, and never dated.
// =============================================================================

import { describe, expect, it } from "vitest";
import { EVENTS } from "@/lib/event-store";
import { reminderAlerts } from "@/lib/billing/alerts";
import type { IndexedEvent } from "@/lib/event-index";
import { toPublicChange, type ChangeInput } from "@/lib/intelligence/change";
import { assessChange, explainMatches, statusText, whatChangedText } from "@/lib/pro/assess";
import { buildBriefing } from "@/lib/pro/feed";
import { renderBriefMarkdown } from "@/lib/pro/export";

const ALL = EVENTS as unknown as ChangeInput[];
const TODAY = "2026-10-16";
const record = (id: string) => {
  const r = ALL.find((e) => e.id === id);
  if (!r) throw new Error(`fixture record ${id} is no longer in the archive`);
  return r;
};
const views = (input: ChangeInput, today = TODAY) => ({
  strong: toPublicChange(input, today),
  weak: toPublicChange(input, today, [], true),
});

const BIOMETRIC_FEE = "federal_register:2026-16231"; // H-1B/L-1 fee, final, effective 2026-09-09
const ENTRY_EXIT_2025 = "federal_register:2025-19655"; // major final rule, effective 2025-12-26

describe("historical importance is not current urgency", () => {
  it("a 2025 major final rule is historical in October 2026, not urgent", () => {
    const input = record(ENTRY_EXIT_2025);
    expect(input.severity).toBe("major");
    const { strong, weak } = views(input);
    const follow = strong.agency ? `agency:${strong.agency}` : "agency:dhs";
    const a = assessChange(input, strong, weak, [follow], TODAY, false);
    expect(a.section).toBe("historical");
    expect(a.urgency.tone).toBe("muted");
    expect(a.urgency.label).toBe("Earlier · Oct 2025");
    // The significance is kept, separately.
    expect(a.recordedMajor).toBe(true);
  });

  it("no record in the real feed is urgent without a stated date ahead", () => {
    const b = buildBriefing({ follows: ["visa:h-1b", "visa:f-1", "agency:uscis", "agency:dhs", "topic:h1b"], savedIds: [], today: TODAY });
    for (const item of b.feed) {
      if (item.assessment.urgency.tone !== "attention") continue;
      expect(item.assessment.section).toBe("upcoming");
      expect(item.assessment.daysUntilEffective).not.toBeNull();
      expect(item.assessment.daysUntilEffective!).toBeGreaterThanOrEqual(0);
      expect(item.change.status).not.toBe("proposed");
    }
    for (const item of b.sections.historical) expect(item.assessment.urgency.tone).toBe("muted");
  });

  it("a followed final rule taking effect within 30 days is the urgent case", () => {
    const input = record(BIOMETRIC_FEE);
    const before = "2026-09-01"; // eight days before its stated effective date
    const { strong, weak } = views(input, before);
    const a = assessChange(input, strong, weak, ["visa:h-1b"], before, false);
    expect(a.section).toBe("upcoming");
    expect(a.urgency).toEqual({ label: "Takes effect in 8 days", tone: "attention" });
    expect(a.dates).toContainEqual({ label: "Takes effect", date: "2026-09-09" });
  });

  it("a recently effective rule is current, then becomes historical", () => {
    const input = record(BIOMETRIC_FEE);
    const soonAfter = "2026-09-20";
    let { strong, weak } = views(input, soonAfter);
    expect(assessChange(input, strong, weak, ["visa:h-1b"], soonAfter, false).urgency.label).toBe("Stated date passed Sep 9, 2026");
    ({ strong, weak } = views(input, TODAY));
    expect(assessChange(input, strong, weak, ["visa:h-1b"], TODAY, false).section).toBe("historical");
  });
});

describe("incidental mentions are not substantive matches", () => {
  it("the H-1B/L-1 biometric fee is a body-only mention for F-1, and named for H-1B", () => {
    const input = record(BIOMETRIC_FEE);
    const { strong, weak } = views(input);
    const [f1] = explainMatches(input, strong, weak, ["visa:f-1"]);
    expect(f1.strength).toBe("mentioned");
    expect(f1.reason).toMatch(/only in the body/);
    expect(f1.reason).toMatch(/may be incidental/);
    expect(f1.quote).toMatch(/F-1/); // the evidence stays available to check

    const [h1b] = explainMatches(input, strong, weak, ["visa:h-1b"]);
    expect(h1b.strength).toBe("named");
    expect(h1b.reason).toMatch(/names it in the title/);
  });

  it("a body-only match never reaches the timeline, the calendar or an urgent label", () => {
    const input = record(BIOMETRIC_FEE);
    const before = "2026-09-01";
    const { strong, weak } = views(input, before);
    const a = assessChange(input, strong, weak, ["visa:f-1"], before, false);
    expect(a.primary).toBe(false);
    expect(a.urgency.tone).toBe("info");
    const b = buildBriefing({ follows: ["visa:f-1"], savedIds: [], today: before });
    expect(b.timeline.some((t) => t.recordId === BIOMETRIC_FEE)).toBe(false);
    // Still in the feed, labelled — not silently dropped.
    expect(b.feed.some((i) => i.change.recordId === BIOMETRIC_FEE && i.assessment.relevance === "mentioned")).toBe(true);
  });

  it("the issuing agency and a saved record are primary", () => {
    const input = record(BIOMETRIC_FEE);
    const { strong, weak } = views(input);
    expect(explainMatches(input, strong, weak, [`agency:${strong.agency}`])[0]).toMatchObject({
      strength: "named",
      reason: expect.stringMatching(/issued this document/),
    });
    expect(assessChange(input, strong, weak, [], TODAY, true).primary).toBe(true);
  });

  it("every match in a real feed explains itself, and only matches real follows", () => {
    const follows = ["visa:h-1b", "visa:f-1", "agency:uscis"];
    const b = buildBriefing({ follows, savedIds: [], today: TODAY });
    expect(b.feed.length).toBeGreaterThan(0);
    for (const item of b.feed) {
      for (const m of item.assessment.matches) {
        expect(follows).toContain(m.follow);
        expect(m.reason).toMatch(/^You follow /);
        if (m.strength === "mentioned" || m.strength === "weak") expect(m.quote).toBeTruthy();
      }
    }
  });
});

describe("proposed rules", () => {
  const proposal = ALL.find((e) => e.classification === "proposed_rule" && e.publishedAt >= "2026-09-20");

  it("are labelled as proposals, with no effective date", () => {
    expect(proposal).toBeDefined();
    const { strong, weak } = views(proposal!);
    const a = assessChange(proposal!, strong, weak, [`agency:${strong.agency}`], TODAY, false);
    expect(strong.status).toBe("proposed");
    expect(a.status).toMatch(/^Proposed — not in force/);
    expect(a.daysUntilEffective).toBeNull();
    expect(a.dates.map((d) => d.label)).toEqual(["Published"]);
    expect(a.urgency.label).toMatch(/proposal — not in force/i);
  });

  it("never get a date or a reminder, even if a date were attached", () => {
    // A proposal carrying a date would be a proposed date, not a stated one.
    const dated = { ...proposal!, effectiveAt: "2026-10-20" } as ChangeInput;
    const { strong, weak } = views(dated);
    const a = assessChange(dated, strong, weak, [`agency:${strong.agency}`], TODAY, true);
    expect(a.section).not.toBe("upcoming");
    expect(a.daysUntilEffective).toBeNull();
    const b = buildBriefing({ follows: [`agency:${strong.agency}`], savedIds: [dated.id], today: TODAY }, [dated]);
    expect(b.timeline).toEqual([]);

    const indexed: IndexedEvent = {
      id: dated.id,
      title: dated.title,
      publishedAt: dated.publishedAt,
      effectiveAt: "2026-10-20",
      scheduled: false,
      severity: "major",
      classification: "proposed_rule",
      sourceKey: dated.sourceKey,
      sourceUrl: dated.sourceUrl,
      summary: "",
      entityIds: ["visa:h-1b"],
    };
    expect(reminderAlerts([indexed], ["visa:h-1b"], {}, TODAY, 7)).toEqual([]);
  });
});

describe("presentation", () => {
  it("leads with the document's own summary, cut at a sentence", () => {
    const input = record(BIOMETRIC_FEE);
    const text = whatChangedText(input);
    expect(input.summary.replace(/\s+/g, " ")).toContain(text.replace(/…$/, ""));
    expect(text.length).toBeLessThanOrEqual(281);
  });

  it("never presents the publisher's no-abstract placeholder as the change", () => {
    const blank = ALL.find((e) => /^No abstract was published/.test(e.summary ?? ""));
    if (!blank) return;
    const text = whatChangedText(blank);
    expect(text).not.toMatch(/^No abstract was published/);
    expect(text).toMatch(/gave no summary/);
  });

  it("states status from the record, never more", () => {
    const { strong } = views(record(BIOMETRIC_FEE));
    expect(statusText(strong, TODAY)).toBe("The document states an effective date of Sep 9, 2026, which has passed. A later rule or court order can change whether it still applies.");
    const undated = ALL.find((e) => !e.effectiveAt && e.classification === "final_rule");
    if (undated) expect(statusText(toPublicChange(undated, TODAY), TODAY)).toMatch(/states no effective date/);
  });

  it("the feed brief says why each record is there", () => {
    const b = buildBriefing({ follows: ["visa:f-1"], savedIds: [], today: TODAY });
    const item = b.feed.find((i) => i.change.recordId === BIOMETRIC_FEE)!;
    const md = renderBriefMarkdown({
      title: "Brief",
      generatedAt: TODAY,
      origin: "https://immigrationclock.com",
      entries: [{ change: item.change, brief: item.brief, path: item.path, why: item.assessment.matches.map((m) => m.reason), statusText: item.assessment.status }],
    });
    expect(md).toContain("Why it is in your Briefing");
    expect(md).toMatch(/may be incidental/);
    expect(md).toContain(item.change.source.url);
  });
});
