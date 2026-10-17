// =============================================================================
// Task-first homepage, the For You situation hub, and the wider search box
// =============================================================================

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SITUATIONS } from "@/lib/situations";
import { buildSituationHub, situationChanges } from "@/lib/situation-hub";
import { searchGuides } from "@/lib/site-search";
import { EVENT_INDEX } from "@/lib/event-index";
import { EVENTS } from "@/lib/event-store";
import { EXPLAINER_BY_SLUG } from "@/lib/editorial/explainers";
import { allPartners } from "@/lib/partners";
import { isFollowableId } from "@/lib/follows";
import { SituationHub } from "@/components/SituationHub";
import { KeyDates } from "@/components/KeyDates";
import { KEY_DATES } from "@/lib/key-dates";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const routeExists = (href: string) => {
  const path = href.split(/[?#]/)[0];
  return existsSync(join(process.cwd(), "src/app", path === "/" ? "" : path, "page.tsx"));
};

describe("situations", () => {
  const indexed = new Set(EVENT_INDEX.flatMap((e) => e.entityIds));

  it("follow only ids the Following picker knows", () => {
    for (const s of SITUATIONS) {
      for (const id of s.followIds) {
        expect(isFollowableId(id), `${s.key}: ${id}`).toBe(true);
        expect(indexed.has(id), `${s.key}: ${id} is not in the archive index`).toBe(true);
      }
    }
  });

  it("list a change only when its document names the visa among those affected", () => {
    for (const s of SITUATIONS) {
      for (const e of situationChanges(s.changeIds)) {
        const stated = [...(e.impact?.visaCategories ?? [])].some(
          (v) => s.changeIds.includes(v.entityId) && v.basis === "stated"
        );
        expect(stated, `${s.key}: ${e.id}`).toBe(true);
      }
    }
  });

  it("link to explainers, data pages and resource needs that exist", () => {
    const needs = new Set(allPartners().map((p) => p.category));
    for (const s of SITUATIONS) {
      for (const slug of s.explainerSlugs) expect(EXPLAINER_BY_SLUG.has(slug), slug).toBe(true);
      for (const l of s.dataLinks) expect(routeExists(l.href), l.href).toBe(true);
      expect(needs.has(s.resourceNeed), s.resourceNeed).toBe(true);
    }
  });
});

describe("the For You hub", () => {
  const hub = buildSituationHub();
  const html = renderToStaticMarkup(createElement(SituationHub, { situations: hub }));

  it("renders every situation in the HTML, one visible", () => {
    for (const s of hub) expect(html).toContain(`id="panel-${s.key}"`);
    expect(html.match(/role="tabpanel"[^>]*hidden/g)?.length).toBe(hub.length - 1);
  });

  it("shows each change with its date, status and official source", () => {
    const withChanges = hub.filter((s) => s.changes.length > 0);
    expect(withChanges.length).toBeGreaterThan(0);
    for (const s of withChanges) {
      for (const c of s.changes) {
        expect(EVENTS.some((e) => e.id === c.id)).toBe(true);
        expect(c.status).toBeTruthy();
        expect(c.sourceUrl).toMatch(/^https:\/\//);
        expect(html).toContain(`href="${c.href}"`);
      }
    }
  });

  it("never says a change applies to the reader", () => {
    expect(html).not.toMatch(/affects you\b|applies to you\b|you must/i);
    expect(html).toContain("not legal advice");
  });

  it("sends services to /resources rather than rendering listings", () => {
    expect(html).toContain('href="/resources?need=');
    for (const p of allPartners()) expect(html).not.toContain(p.href);
    expect(read("src/components/SituationHub.tsx")).not.toMatch(/partners"|listingLink/);
  });
});

describe("the homepage", () => {
  const home = read("src/app/page.tsx");

  it("leads with the question and the four tasks", () => {
    expect(home).toContain("What do you need help with?");
    for (const t of ["Understand a change", "Check deadlines", "Track my situation", "Find services"]) {
      expect(home).toContain(`title: "${t}"`);
    }
    expect(home).toContain('<SearchBar size="hero" />');
  });

  it("keeps the source promise, freshness and the professional door", () => {
    expect(home).toContain("back to the official source");
    expect(home).toContain("Last refreshed");
    expect(home).toContain('href="/monitor"');
    expect(home).toContain("<RecentChanges");
  });

  it("links every situation chip to its view on /for-you", () => {
    expect(home).toContain("href={`/for-you?s=${s.key}`}");
  });
});

describe("search beyond entities", () => {
  it("finds deadlines and explainers", () => {
    const opt = searchGuides("OPT").map((r) => r.href);
    expect(opt).toContain("/key-dates#opt-window");
    expect(opt).toContain("/explained/opt-in-plain-terms");
    expect(searchGuides("tax deadline").map((r) => r.href)).toContain("/key-dates#tax-deadline");
    expect(searchGuides("visa bulletin").length).toBeGreaterThan(0);
    expect(searchGuides("x")).toEqual([]);
  });

  it("gives /key-dates anchors for every date, and only there", () => {
    const anchored = renderToStaticMarkup(
      createElement(KeyDates, { dates: KEY_DATES, placement: "test", anchors: true })
    );
    for (const d of KEY_DATES) expect(anchored).toContain(`id="${d.id}"`);
    const plain = renderToStaticMarkup(createElement(KeyDates, { dates: KEY_DATES, placement: "test" }));
    expect(plain).not.toContain(`id="${KEY_DATES[0].id}"`);
  });
});

describe("acquisition surfaces", () => {
  it("offers the newsletter where social and search land, without a second form", () => {
    for (const [file, placement] of [
      ["src/components/ChangeRecordV2.tsx", "change"],
      ["src/components/WhatChangedV2.tsx", "what_changed"],
      ["src/app/for-you/page.tsx", "for_you"],
    ]) {
      expect(read(file), file).toContain(`<PulseSignup variant="inline" placement="${placement}" />`);
    }
  });

  it("gives /monitor a route to Pro and to the example Briefing", () => {
    expect(read("src/app/monitor/page.tsx")).toContain("<MonitorProCta />");
    const cta = read("src/components/MonitorProCta.tsx");
    expect(cta).toContain('href="/pricing"');
    expect(cta).toContain('href="/briefing/example"');
  });

  it("serves the example Briefing without an account", () => {
    const page = read("src/app/briefing/example/page.tsx");
    expect(page).not.toMatch(/proGate|cookies\(\)/);
    expect(page).toContain("example");
  });
});
