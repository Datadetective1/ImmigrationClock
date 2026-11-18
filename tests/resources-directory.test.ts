// =============================================================================
// /resources — one compact directory, every listing labelled honestly
// =============================================================================

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResourceDirectory } from "@/components/ResourcePanel";
import { allPartners, CATEGORY_META } from "@/lib/partners";

const partners = allPartners();
const html = renderToStaticMarkup(createElement(ResourceDirectory, { partners }));
const esc = (s: string) => s.replace(/&/g, "&amp;");

describe("the resources directory", () => {
  it("shows every listing once, each with its own label", () => {
    for (const p of partners) {
      expect(html.split(`>${p.name}<`).length - 1, p.id).toBe(1);
    }
    const pills = (label: string) => html.match(new RegExp(`tracking-wide [^"]*">${label}</span>`, "g"))?.length ?? 0;
    expect(pills("Affiliate")).toBe(partners.filter((p) => p.kind === "affiliate").length);
    expect(pills("Independent")).toBe(partners.filter((p) => p.kind === "service").length);
    expect(pills("Free · official")).toBe(partners.filter((p) => p.kind === "official").length);
  });

  it("keeps the ImmiTranslate referral link and its placement", () => {
    expect(html).toContain(esc('href="https://immitranslate.com/?ref=948mg968&sub=ic_resources_documents"'));
  });

  it("marks only the affiliates rel=sponsored", () => {
    expect(html.match(/rel="sponsored nofollow noopener noreferrer"/g)?.length).toBe(
      partners.filter((p) => p.kind === "affiliate").length
    );
  });

  it("sends OneNotary clicks to the referral link exactly as issued", () => {
    expect(html).toContain('href="https://app.onenotary.us/acts/no_account/70aea822-098f-485b-8dab-1bbc783b4369"');
  });

  it("offers one filter per need instead of a heading and panel per category", () => {
    for (const c of new Set(partners.map((p) => p.category))) expect(html).toContain(`>${esc(CATEGORY_META[c].label)}</button>`);
    expect(html).not.toContain("<h2");
    expect(html.match(/Compensation never affects/g)?.length).toBe(1);
  });
});
