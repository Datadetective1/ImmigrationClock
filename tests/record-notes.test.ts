// =============================================================================
// RECORD NOTES AND THE KEY-DATES CORRECTIONS — every figure is the document's
//
// A comment deadline or a docket number an editor typed is only as good as the
// copy it came from. These tests hold each note to the archived text of its own
// Federal Register document, so a typo, or a date taken from a secondary source,
// fails here rather than in front of a reader.
// =============================================================================

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RECORD_NOTES, openCommentPeriods } from "@/lib/editorial/record-notes";
import { EVENTS } from "@/lib/event-store";
import { KEY_DATES } from "@/lib/key-dates";
import { EXPLAINER_BY_SLUG } from "@/lib/editorial/explainers";
import { KeyDates } from "@/components/KeyDates";
import { ChangeRecordV2 } from "@/components/ChangeRecordV2";
import { changePath } from "@/lib/share";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const sourceText = (id: string) =>
  read(`data/source-text/${id.replace("federal_register:", "federal_register_")}.txt`).replace(/\s+/g, " ");
const routeExists = (href: string) => {
  const path = href.split(/[?#]/)[0];
  if (path.startsWith("/explained/")) return EXPLAINER_BY_SLUG.has(path.slice("/explained/".length));
  return existsSync(join(process.cwd(), "src/app", path, "page.tsx"));
};

describe("record notes", () => {
  it("annotate only records that exist and are still proposals", () => {
    for (const id of Object.keys(RECORD_NOTES)) {
      const event = EVENTS.find((e) => e.id === id);
      expect(event, id).toBeDefined();
      expect(event!.classification, id).toBe("proposed_rule");
    }
  });

  it("take the comment deadline and docket from the document's own text", () => {
    for (const [id, note] of Object.entries(RECORD_NOTES)) {
      if (!note.comments) continue;
      const text = sourceText(id);
      const [y, m, d] = note.comments.closes.split("-").map(Number);
      const month = new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
      expect(text, `${id}: deadline`).toContain(`on or before ${month} ${d}, ${y}`);
      expect(text, `${id}: docket`).toContain(`Docket No. ${note.comments.docket}`);
      expect(note.comments.url).toContain(note.comments.docket);
    }
  });

  it("put only the document's own dates and figures in the search copy", () => {
    for (const [id, note] of Object.entries(RECORD_NOTES)) {
      const text = sourceText(id);
      for (const figure of note.searchDescription.match(/\$[\d,]+/g) ?? []) {
        expect(text, `${id}: ${figure}`).toContain(figure);
      }
      expect(note.searchTitle.length, id).toBeLessThanOrEqual(65);
      expect(note.searchDescription.length, id).toBeLessThanOrEqual(220);
      // A proposal is never described as in force.
      expect(`${note.searchTitle} ${note.searchDescription}`).not.toMatch(/\b(now in effect|takes effect|is final)\b/i);
      for (const l of note.readNext) expect(routeExists(l.href), l.href).toBe(true);
    }
  });

  it("list open comment periods soonest first and drop them once closed", () => {
    expect(openCommentPeriods("2026-10-17").map((x) => x.note.comments!.closes)).toEqual(["2026-11-09", "2026-11-10"]);
    expect(openCommentPeriods("2026-11-10").map((x) => x.id)).toEqual(["federal_register:2026-18631"]);
    expect(openCommentPeriods("2026-11-11")).toEqual([]);
  });

  it("feed the record's metadata", () => {
    expect(read("src/app/what-changed/[slug]/page.tsx")).toContain("note?.searchTitle ?? storyTitle(event)");
  });

  const renderOn = (id: string, today: string) => {
    const e = EVENTS.find((x) => x.id === id)!;
    return renderToStaticMarkup(
      createElement(ChangeRecordV2, {
        event: e,
        title: e.title,
        path: changePath(e),
        canonical: `https://immigrationclock.com${changePath(e)}`,
        storyKey: `change:${e.id}`,
        today,
        related: [],
        context: [],
        amendedBy: [],
      })
    ).replace(/<[^>]+>/g, " ");
  };

  it("show the comment deadline, the docket and the editor's links on the record", () => {
    const open = renderOn("federal_register:2026-20660", "2026-10-17");
    expect(open).toContain("Comments due");
    expect(open).toContain("Nov 9, 2026 · docket ICEB-2026-0100");
    expect(open).toContain("Docket on regulations.gov");
    expect(open).toContain("OPT in plain terms");
    // Still a proposal on the record itself.
    expect(open).toContain("Proposed");

    const closed = renderOn("federal_register:2026-20660", "2026-11-10");
    expect(closed).toContain("Comments closed");
    expect(closed).not.toContain("Docket on regulations.gov");

    expect(renderOn("federal_register:2026-18631", "2026-10-17")).toContain("Nov 10, 2026 · docket USCIS-2026-0364");
  });
});

describe("the Diversity Visa key date", () => {
  const dv = KEY_DATES.find((k) => k.id === "dv-lottery")!;

  it("shows no countdown while the State Department has announced no entry period", () => {
    expect(dv.month).toBeUndefined();
    expect(dv.day).toBeUndefined();
    expect(dv.cadence).toBeTruthy();
  });

  it("no longer calls registration free, and says nothing is open", () => {
    expect(dv.detail).not.toMatch(/\bfree\b/i);
    expect(dv.detail).toContain("$1 registration fee");
    expect(dv.detail).not.toMatch(/\b(is open|now open|opens on)\b/i);
    // Both facts come from archived State Department rules.
    expect(sourceText("federal_register:2025-17851")).toContain("$1 fee to register for the Diversity Visa lottery");
    expect(sourceText("federal_register:2026-04737")).toContain(
      "deferral of the opening of the entry period for the 2027 Diversity Visa program year"
    );
  });
});

describe("/key-dates", () => {
  it("links each explained deadline to its explainer", () => {
    const html = renderToStaticMarkup(createElement(KeyDates, { dates: KEY_DATES, placement: "test", anchors: true }));
    for (const d of KEY_DATES.filter((k) => k.explainerSlug)) {
      expect(EXPLAINER_BY_SLUG.has(d.explainerSlug!), d.id).toBe(true);
      expect(html).toContain(`href="/explained/${d.explainerSlug}"`);
    }
  });

  it("lists open comment periods and leads its title with the deadlines readers search for", () => {
    const page = read("src/app/key-dates/page.tsx");
    expect(page).toContain("Open comment periods");
    expect(page).toContain('title: "Immigration Deadlines & Key Dates: H-1B, OPT, Visa Bulletin"');
    expect(page).not.toMatch(/Diversity Visa lottery, the Visa Bulletin/);
  });
});
