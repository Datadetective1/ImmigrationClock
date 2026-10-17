// =============================================================================
// THE HOMEPAGE'S FIRST HTML — what search engines, link previews and readers
// without JavaScript receive
//
// Two defects found in the redesign audit:
//   • every headline figure rendered as "0" until it was scrolled into view
//     (AnimatedCounter started at 0), so the HTML said "0 ICE arrests" and
//     "$0 average H-1B offered wage";
//   • homepage change titles linked to the /what-changed list, and the only
//     per-change link went off-site, so no change opened its own record.
// =============================================================================

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { RecentChanges } from "@/components/RecentChanges";
import { significantEvents } from "@/lib/event-store";
import { changePath } from "@/lib/share";

describe("headline figures", () => {
  it("are in the server-rendered HTML, not 0", () => {
    const html = renderToStaticMarkup(createElement(AnimatedCounter, { value: 285000 }));
    expect(html).toContain("285,000");
    expect(html).not.toMatch(/>0</);
  });

  it("keep prefix, suffix and decimals in the HTML", () => {
    const html = renderToStaticMarkup(createElement(AnimatedCounter, { value: 4.2, decimals: 1, suffix: "%" }));
    expect(html).toContain("4.2%");
    expect(renderToStaticMarkup(createElement(AnimatedCounter, { value: 156000, prefix: "$" }))).toContain("$156,000");
  });
});

describe("homepage changes", () => {
  const events = significantEvents(5);
  const html = renderToStaticMarkup(createElement(RecentChanges, { events, heading: "Latest immigration changes" }));

  it("link each title to its own ImmigrationClock record", () => {
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(html).toContain(`href="${changePath(e)}"`);
  });

  it("still link each change to its official source", () => {
    for (const e of events) expect(html).toContain(`href="${e.sourceUrl.replace(/&/g, "&amp;")}"`);
  });
});
