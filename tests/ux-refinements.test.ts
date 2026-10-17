// =============================================================================
// PHASE 1 REFINEMENTS — explainer relevance, the site's calendar, quieter
// secondary content
// =============================================================================

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EXPLAINER_BY_SLUG, explainersFor, mentionsKeyword } from "@/lib/editorial/explainers";
import { siteDay } from "@/lib/format";
import { ReportError } from "@/components/ReportError";
import { EVENTS } from "@/lib/event-store";

describe("explainers match whole words", () => {
  it("does not read 'system' as STEM OPT or 'adopt' as OPT", () => {
    expect(mentionsKeyword("restore integrity to the immigration system", "stem opt")).toBe(false);
    expect(mentionsKeyword("DHS will adopt the rule", "opt")).toBe(false);
    expect(mentionsKeyword("F-1 students on OPT", "opt")).toBe(true);
    expect(mentionsKeyword("the court enjoined the rule", "enjoin*")).toBe(true);
    expect(mentionsKeyword("period of stay", "stay of")).toBe(false);
  });

  it("gives the refugee termination rule no student-visa explainer", () => {
    const e = EVENTS.find((x) => x.id === "federal_register:2026-20956")!;
    const slugs = explainersFor(`${e.title} ${e.summary}`).map((x) => x.slug);
    expect(slugs.some((s) => /opt|f-1|student/i.test(s))).toBe(false);
    expect(slugs).toContain("interim-final-rule");
  });

  it("states an interim final rule's effect conditionally", () => {
    const ifr = EXPLAINER_BY_SLUG.get("interim-final-rule")!;
    const words = [ifr.kicker, ...ifr.facts, ifr.whyItMatters].join(" ");
    expect(words).not.toMatch(/\bin force\b|binding from|applies now/i);
  });
});

describe("the site's calendar is Eastern", () => {
  it("dates a 01:20 UTC build to the previous evening in Washington", () => {
    expect(siteDay("2026-10-17T01:20:00Z")).toBe("2026-10-16");
    expect(siteDay("2026-10-17T05:00:00Z")).toBe("2026-10-17");
  });
});

describe("secondary content", () => {
  it("offers the correction route in one line in compact form", () => {
    process.env.NEXT_PUBLIC_CONTACT_EMAIL ??= "";
    const html = renderToStaticMarkup(createElement(ReportError, { context: "What Changed", compact: true }));
    // Renders nothing without an inbox, one paragraph with one.
    expect(html === "" || /^<p[^>]*>Spotted something wrong\?/.test(html)).toBe(true);
  });
});
