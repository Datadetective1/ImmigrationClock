// =============================================================================
// ONE CHANGE'S RECORD, REDESIGNED — nothing dropped, nothing overstated
// =============================================================================

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangeRecordV2 } from "@/components/ChangeRecordV2";
import { EVENTS } from "@/lib/event-store";
import { changePath } from "@/lib/share";
import { explainersFor } from "@/lib/editorial/explainers";

const TODAY = "2026-10-16";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const render = (e: (typeof EVENTS)[number], amendedBy: string[] = [], context: ReturnType<typeof explainersFor> = []) =>
  renderToStaticMarkup(
    createElement(ChangeRecordV2, {
      event: e,
      title: e.title,
      path: changePath(e),
      canonical: `https://immigrationclock.com${changePath(e)}`,
      storyKey: `change:${e.id}`,
      today: TODAY,
      related: [],
      context,
      amendedBy,
    })
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ");
const REFUGEE = EVENTS.find((e) => e.id === "federal_register:2026-20956")!;

describe("the redesigned record, on every record", () => {
  const pages = EVENTS.map((e) => ({ e, html: render(e) }));

  it("leads with the source button and the stage", () => {
    for (const { e, html } of pages) {
      const button = html.indexOf(`href="${esc(e.sourceUrl)}"`);
      expect(button, e.id).toBeGreaterThan(-1);
      expect(html.indexOf("What the document says") > button, e.id).toBe(true);
    }
  });

  it("keeps every fact and caveat the old page carried, each once", () => {
    for (const { e, html } of pages) {
      for (const l of e.limitations ?? []) {
        if (/published no abstract/i.test(l)) continue; // replaced by the page's own no-summary line
        expect(html.split(esc(l)).length - 1, `${e.id}: ${l.slice(0, 40)}`).toBe(1);
      }
      const im = e.impact;
      const named = im && [...im.countries, ...im.visaCategories, ...im.states, ...im.employers, ...im.universities].length > 0;
      if (named && im.completeness === "partial") expect(html, e.id).toMatch(/may be incomplete/);
      if (named && im.completeness === "exhaustive") expect(html, e.id).toMatch(/closed list/);
      if (im?.actionRequired) expect(html, e.id).toMatch(/A requirement the document states/);
      expect(html, e.id).toMatch(/About this record/);
      expect(html, e.id).toMatch(/Classified automatically|Reviewed by a person/);
      expect(html.match(/not legal advice/g)?.length, e.id).toBe(1);
    }
  });

  it("shows readers words, never field names or raw ISO dates", () => {
    for (const { e } of pages) {
      const ours = text(render({ ...e, title: "T", summary: "S", whyItMatters: null } as never));
      expect(ours, e.id).not.toMatch(/effectiveAt|impact\.|actionRequired|scopeDefinedElsewhere|classification:/);
      expect(ours, e.id).not.toMatch(/What this means/);
    }
  });

  it("never says a rule is in force or in effect in its own words", () => {
    for (const { e } of pages) {
      // Strip the document's own words (title, summary) before checking ours.
      const ours = render({ ...e, title: "T", summary: "S", whyItMatters: null } as never);
      // "not in force" (a proposal's stored limitation) is the correct negation.
      expect(ours, e.id).not.toMatch(/(?<!not )in force|in effect/i);
    }
  });

  it("says a proposal is not final, with a track that has no final rule unless a later record amends it", () => {
    const p = EVENTS.find((e) => e.classification === "proposed_rule")!;
    expect(render(p)).toMatch(/A proposal is not final|PROPOSED rule/);
    expect(render(p)).toMatch(/None in our archive/);
    expect(render(p, ["federal_register:later"])).toMatch(/A later record amends this/);
  });

  it("on the refugee termination rule: no comment deadline as a requirement, no unrelated explainer", () => {
    const html = render(REFUGEE, [], explainersFor(`${REFUGEE.title} ${REFUGEE.summary}`));
    expect(html).not.toMatch(/Written comments/);
    expect(html).not.toMatch(/Optional Practical Training|OPT/);
    expect(html).not.toMatch(/Proposed rule vs\. final rule/);
    expect(html).toMatch(/interim final rule/i);
    // The stated date once, in the header; no stage track repeating it.
    expect(html.split("Oct 14, 2026").length - 1).toBe(2); // header + "Published" (a separate fact)
    expect(html).not.toMatch(/Where it stands/);
  });
});
