// =============================================================================
// BRIEFING, REDESIGNED — the same data and settings, attention first
// =============================================================================

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BriefingV2 } from "@/components/BriefingV2";
import { buildBriefing } from "@/lib/pro/feed";
import { buildLandscape } from "@/lib/pro/landscape";

const TODAY = "2026-10-16";
const FOLLOWS = ["visa:h-1b", "visa:refugee", "visa:f-1"];
const SETTINGS = { frequency: "daily" as const, relevance: "all" as const, reminders: true, summary: false, calendarUrl: "https://x.test/cal/abc.ics" };

function page(follows = FOLLOWS, intelligence = true) {
  const b = buildBriefing({ follows, savedIds: [], today: TODAY });
  const { upcoming, current, historical } = b.sections;
  return {
    b,
    html: renderToStaticMarkup(
      createElement(BriefingV2, {
        today: TODAY,
        follows,
        upcoming,
        current,
        historical,
        savedItems: [],
        savedCount: 0,
        feedCount: b.feed.length,
        landscape: intelligence && follows.length ? buildLandscape({ follows, today: TODAY }) : null,
        settings: SETTINGS,
        alertsOn: true,
        intelligence,
        history: [],
        limitations: b.limitations,
      })
    ),
  };
}

describe("the redesigned Briefing", () => {
  const { b, html } = page();

  it("keeps every record, each linking to its page and its official source", () => {
    for (const i of b.feed) {
      expect(html, i.change.recordId).toContain(`href="${i.path}"`);
      expect(html, i.change.recordId).toContain(`href="${i.change.source.url.replace(/&/g, "&amp;")}"`);
    }
  });

  it("leads with counts that jump to their lists, then coming up, then new", () => {
    const at = (s: string) => html.indexOf(s);
    expect(at('href="#upcoming-heading"')).toBeGreaterThan(-1);
    expect(at('id="upcoming-heading"')).toBeLessThan(at('id="current-heading"'));
    expect(at('id="current-heading"')).toBeLessThan(at("Email alerts and calendar"));
  });

  it("keeps settings, history and the explanation one tap away", () => {
    for (const t of ["Email alerts and calendar", "Alert history", "How your Briefing works", "Earlier records"]) {
      const i = html.indexOf(t);
      expect(html.lastIndexOf("<details", i), t).toBeGreaterThan(-1);
    }
    expect(html).toContain("Weekly summary email");
    expect(html).toContain("Optional, off by default");
    for (const l of b.limitations) expect(html).toContain(l.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;"));
  });

  it("never says in force or took effect in its own words", () => {
    const ours = html.replace(/<h3[\s\S]*?<\/h3>|<p class="mt-1 line-clamp-2[\s\S]*?<\/p>|<q[\s\S]*?<\/q>/g, "");
    expect(ours).not.toMatch(/(?<!not )in force|in effect|took effect/i);
  });

  it("offers the weekly summary only with Intelligence, and asks a new subscriber to choose follows", () => {
    expect(page(FOLLOWS, false).html).not.toContain("Weekly summary email");
    const empty = page([], true).html;
    expect(empty).toContain("Choose what to follow");
    expect(empty).toMatch(/describes the sources we cover/);
  });
});
