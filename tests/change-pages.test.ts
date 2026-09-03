// =============================================================================
// STORY PAGES — every record has an address, and the address behaves
//
// The pages are server components rendering data the pipeline already
// validated, so what is worth asserting is the contract: that every record is
// enumerated, that an old slug still resolves and canonicalises, that routine
// paperwork is shareable but not indexable, that the card route knows every
// record the pages know, and that the sitemap agrees with all of it.
// =============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { Metadata } from "next";

import { EVENTS } from "@/lib/event-store";
import { EXPLAINERS } from "@/lib/editorial/explainers";
import { SIGNAL_SLUGS, buildSignal } from "@/lib/editorial/signals";
import { changePath, changeSlug, explainerPath, ogImagePath, shortHash, signalPath } from "@/lib/share";
import { SITE } from "@/lib/site";
import sitemap from "@/app/sitemap";
import * as ChangePage from "@/app/what-changed/[slug]/page";
import * as ExplainerPage from "@/app/explained/[slug]/page";
import * as SignalPage from "@/app/insights/[slug]/page";
import * as OgRoute from "@/app/og/[kind]/[file]/route";
import {
  changesForKeywords,
  relatedChanges,
  storyDescription,
  storyKey,
  storyTitle,
  titleStem,
} from "@/lib/stories";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const TODAY = new Date().toISOString().slice(0, 10);

function robotsOf(meta: Metadata): { index?: boolean } {
  return (meta.robots ?? {}) as { index?: boolean };
}
function ogImageOf(meta: Metadata): string {
  const images = (meta.openGraph as { images?: { url: string }[] } | undefined)?.images ?? [];
  return images[0]?.url ?? "";
}
function twitterImageOf(meta: Metadata): string {
  const images = (meta.twitter as { images?: string[] } | undefined)?.images ?? [];
  return images[0] ?? "";
}
function canonicalOf(meta: Metadata): string {
  return String(meta.alternates?.canonical ?? "");
}

const routine = EVENTS.find((e) => e.severity === "routine")!;
const major = EVENTS.find((e) => e.severity === "major")!;

describe("/what-changed/[slug]", () => {
  it("generates a page for every recorded change and nothing else", () => {
    const params = ChangePage.generateStaticParams();
    expect(params.length).toBe(EVENTS.length);
    expect(new Set(params.map((p) => p.slug))).toEqual(new Set(EVENTS.map(changeSlug)));
    // Prerendered in full, but an address the build did not see is still
    // answered: an old slug redirects, a slug naming nothing is a 404.
    expect(ChangePage.dynamicParams).toBe(true);
  });

  it("sends an old slug on to the current address with a permanent redirect", () => {
    const stale = `some-old-wording-${shortHash(major.id)}`;
    expect(() => ChangePage.default({ params: { slug: stale } })).toThrow(/NEXT_REDIRECT/);
    expect(() => ChangePage.default({ params: { slug: changeSlug(major) } })).not.toThrow();
    expect(() => ChangePage.default({ params: { slug: "names-nothing-zzzzzz" } })).toThrow(/NEXT_NOT_FOUND/);
  });

  it("keeps routine paperwork shareable but out of the index", () => {
    expect(robotsOf(ChangePage.generateMetadata({ params: { slug: changeSlug(routine) } })).index).toBe(false);
    expect(robotsOf(ChangePage.generateMetadata({ params: { slug: changeSlug(major) } })).index).toBe(true);
  });

  it("points every change at its own card, on both networks' tags", () => {
    const meta = ChangePage.generateMetadata({ params: { slug: changeSlug(major) } });
    const expected = `${SITE.url}${ogImagePath("change", changeSlug(major))}`;
    expect(ogImageOf(meta)).toBe(expected);
    expect(twitterImageOf(meta)).toBe(expected);
    expect(String(meta.title)).toContain(storyTitle(major));
  });

  it("canonicalises a link minted before a title correction", () => {
    const stale = `some-old-wording-${shortHash(major.id)}`;
    const meta = ChangePage.generateMetadata({ params: { slug: stale } });
    expect(canonicalOf(meta)).toBe(`${SITE.url}${changePath(major)}`);
    expect(ogImageOf(meta)).toBe(`${SITE.url}${ogImagePath("change", changeSlug(major))}`);
  });

  it("refuses an address that matches no record", () => {
    expect(robotsOf(ChangePage.generateMetadata({ params: { slug: "nothing-here-000000" } })).index).toBe(false);
    // notFound() throws Next's NEXT_NOT_FOUND signal rather than rendering.
    expect(() => ChangePage.default({ params: { slug: "nothing-here-000000" } })).toThrow();
  });

  it("renders the full record, its context and its measurement", () => {
    const page = read("src/app/what-changed/[slug]/page.tsx");
    expect(page).toMatch(/matchesChangeSlug\(e, slug\)/);
    expect(page).toMatch(/<EventCard event=\{event\} \/>/);
    expect(page).toMatch(/explainersFor\(/);
    expect(page).toMatch(/relatedChanges\(event, EVENTS\)/);
    expect(page).toMatch(/<StoryAnalytics story=\{key\} category=\{event\.classification\} \/>/);
    expect(page).toMatch(/"@type": "Article"/);
    expect(page).toMatch(/jsonLd\(article\)/);
    expect(page).toMatch(/noindex: event\.severity === "routine"/);
    expect(page).toMatch(/surface="change"/);
    expect(page).toMatch(/href="\/following"/);
    // A scheduled document must not be presented as published here either.
    expect(page).toMatch(/isScheduled\(event\)/);
  });

  it("is reachable from every event card", () => {
    const card = read("src/components/EventCard.tsx");
    expect(card).toMatch(/<Link href=\{changePath\(event\)\}/);
    expect(card).toMatch(/Permalink/);
  });
});

describe("/explained/[slug]", () => {
  it("generates a page per explainer with its own card", () => {
    const params = ExplainerPage.generateStaticParams();
    expect(params.map((p) => p.slug)).toEqual(EXPLAINERS.map((e) => e.slug));
    expect(ExplainerPage.dynamicParams).toBe(false);
    for (const e of EXPLAINERS) {
      const meta = ExplainerPage.generateMetadata({ params: { slug: e.slug } });
      expect(ogImageOf(meta)).toBe(`${SITE.url}${ogImagePath("explainer", e.slug)}`);
      expect(canonicalOf(meta)).toBe(`${SITE.url}${explainerPath(e.slug)}`);
      expect(meta.description).toBe(e.kicker);
      expect(robotsOf(meta).index).toBe(true);
    }
  });

  it("renders the closed fact set and nothing generated", () => {
    const page = read("src/app/explained/[slug]/page.tsx");
    for (const field of ["e.facts", "e.whyItMatters", "e.sources", "e.relatedPaths", "e.verifiedAt"]) {
      expect(page).toContain(field);
    }
    expect(page).toMatch(/rel="noopener noreferrer"/);
    expect(page).toMatch(/changesForKeywords\(e\.keywords, EVENTS\)/);
  });

  it("is listed on the hub", () => {
    const hub = read("src/app/explained/page.tsx");
    expect(hub).toMatch(/from "@\/lib\/editorial\/explainers"/);
    expect(hub).toMatch(/explainerPath\(e\.slug\)/);
    // The existing reading-level list is untouched.
    expect(hub).toMatch(/<ExplainList items=\{EXPLAINERS\} \/>/);
  });
});

describe("/insights/[slug]", () => {
  it("generates a page only for signals the build's data supports", () => {
    const params = SignalPage.generateStaticParams().map((p) => p.slug);
    expect(SignalPage.dynamicParams).toBe(false);
    expect(params.length).toBeGreaterThan(0);
    for (const slug of params) {
      expect(SIGNAL_SLUGS).toContain(slug);
      expect(buildSignal(slug, TODAY)).not.toBeNull();
      const meta = SignalPage.generateMetadata({ params: { slug } });
      expect(ogImageOf(meta)).toBe(`${SITE.url}${ogImagePath("signal", slug)}`);
      expect(canonicalOf(meta)).toBe(`${SITE.url}${signalPath(slug)}`);
    }
    for (const slug of SIGNAL_SLUGS) {
      if (!buildSignal(slug, TODAY)) expect(params).not.toContain(slug);
    }
  });

  it("renders the figure, the points, the caveats, the source and the way in", () => {
    const page = read("src/app/insights/[slug]/page.tsx");
    for (const field of [
      "s.figure",
      "s.figureLabel",
      "s.points",
      "s.caveats",
      "s.sourceUrl",
      "s.provenance",
      "s.periodLabel",
      "s.explorePath",
      "s.relatedChangePaths",
    ]) {
      expect(page).toContain(field);
    }
  });

  it("is listed on the hub", () => {
    const hub = read("src/app/insights/page.tsx");
    expect(hub).toMatch(/buildSignals\(BUILD_DATE\)/);
    expect(hub).toMatch(/signalPath\(s\.slug\)/);
    expect(hub).toMatch(/<InsightCard key=\{insight\.key\} insight=\{insight\} \/>/);
  });
});

describe("/og/[kind]/[file]", () => {
  const params = OgRoute.generateStaticParams();
  const files = new Set(params.map((p) => `${p.kind}/${p.file}`));

  it("is static, closed, and enumerates every card the pages reference", () => {
    expect(OgRoute.dynamic).toBe("force-static");
    expect(OgRoute.dynamicParams).toBe(false);
    for (const e of EVENTS) expect(files.has(`change/${changeSlug(e)}.png`), e.id).toBe(true);
    for (const x of EXPLAINERS) expect(files.has(`explainer/${x.slug}.png`), x.slug).toBe(true);
    for (const p of SignalPage.generateStaticParams()) {
      expect(files.has(`signal/${p.slug}.png`), p.slug).toBe(true);
    }
    expect(files.has("page/what-changed.png")).toBe(true);
    expect(files.has("page/h1b-employers.png")).toBe(true);
    expect(files.size).toBe(params.length);
  });

  it("answers an unknown record with a 404, not a card", async () => {
    const req = new Request("http://localhost/og/change/does-not-exist.png");
    expect((await OgRoute.GET(req, { params: { kind: "change", file: "does-not-exist.png" } })).status).toBe(404);
    expect((await OgRoute.GET(req, { params: { kind: "change", file: "does-not-exist-000000.png" } })).status).toBe(
      404
    );
    expect((await OgRoute.GET(req, { params: { kind: "nope", file: "x.png" } })).status).toBe(404);
    expect((await OgRoute.GET(req, { params: { kind: "page", file: "layoffs" } })).status).toBe(404);
    expect((await OgRoute.GET(req, { params: { kind: "explainer", file: "not-an-explainer.png" } })).status).toBe(
      404
    );
  });

  it(
    "serves a real card for a real record",
    async () => {
      const req = new Request("http://localhost/og/page/layoffs.png");
      const res = await OgRoute.GET(req, { params: { kind: "page", file: "layoffs.png" } });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.readUInt32BE(16)).toBe(1200);
      expect(buf.readUInt32BE(20)).toBe(630);
    },
    60_000
  );
});

describe("sitemap", () => {
  const paths = new Set(sitemap().map((e) => e.url.replace(SITE.url, "")));

  it("submits every non-routine change and no routine one", () => {
    for (const e of EVENTS) {
      expect(paths.has(changePath(e)), `${e.id} (${e.severity})`).toBe(e.severity !== "routine");
    }
  });

  it("submits every explainer and every signal the build supports", () => {
    for (const x of EXPLAINERS) expect(paths.has(explainerPath(x.slug)), x.slug).toBe(true);
    for (const p of SignalPage.generateStaticParams()) expect(paths.has(signalPath(p.slug)), p.slug).toBe(true);
    for (const slug of SIGNAL_SLUGS) {
      if (!buildSignal(slug, TODAY)) expect(paths.has(signalPath(slug)), slug).toBe(false);
    }
  });
});

describe("story helpers", () => {
  it("title, key and description", () => {
    expect(storyTitle({ title: "Policy alert: X" })).toBe("X");
    expect(storyTitle({ title: "Plain" })).toBe("Plain");
    expect(storyKey({ id: "federal_register:2026-17726" })).toBe("change:pu7qj6");
    const d = storyDescription({ summary: "word ".repeat(100) });
    expect(d.length).toBeLessThanOrEqual(200);
    expect(d.endsWith("…")).toBe(true);
    expect(storyDescription({ summary: "Short." })).toBe("Short.");
  });

  it("relates changes by title stem or a distinctive entity, never to itself or to paperwork", () => {
    expect(titleStem("Policy alert: A B C D E F G H")).toBe("a b c d e f");
    for (const e of EVENTS.filter((x) => x.severity !== "routine").slice(0, 40)) {
      const related = relatedChanges(e, EVENTS);
      expect(related.length).toBeLessThanOrEqual(5);
      expect(related.map((r) => r.id)).not.toContain(e.id);
      for (const r of related) expect(r.severity).not.toBe("routine");
    }
  });

  it("finds the changes an explainer helps read, newest first", () => {
    const hits = changesForKeywords(["h-1b"], EVENTS);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].publishedAt >= hits[i].publishedAt).toBe(true);
    }
    expect(changesForKeywords([], EVENTS)).toEqual([]);
  });
});
