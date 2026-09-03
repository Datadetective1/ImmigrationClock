// =============================================================================
// NAVIGATION — finding things, and knowing where you are
//
// WHAT THESE TESTS EXIST FOR
// --------------------------
// Four defects, all invisible to the existing suite because nothing tested the
// path a reader actually takes through the site:
//
//   1. The site-wide search box could not find any of the 2,614 H-1B sponsors
//      it already ships to the browser. Its placeholder says "Search employer";
//      typing Wipro, Deloitte or Accenture returned "Nothing matches", because
//      search() only ever scanned the ten curated company profiles.
//
//   2. "h1b" matched nothing — not the search box, not the employer directory,
//      not the change archive — while "H-1B" matched all three. The site's own
//      URLs are the unhyphenated spelling (/h1b/top-sponsors).
//
//   3. Results came back in corpus order, so typing "CA" led with HCL America
//      (because "hcl ameri-CA" contains the letters) and Enter, which follows
//      the first result, went to an employer profile instead of California.
//
//   4. The navbar highlighted nothing on any generated page. isActive() tested
//      pathname.startsWith(navHref), which never fires: no nav href is a prefix
//      of /employer/*, /company/*, /state/*, /country/* or /h1b/salaries/*.
//      That is 2,662 of the site's URLs, and they are its organic entry points
//      — the pages whose readers have the least idea where they have landed.
//
// The nav tests below re-derive the answer from src/lib/site.ts rather than
// hardcoding it, so adding a section keeps them honest instead of stale.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { search, searchTotals, squash, type SearchResult } from "@/lib/data";
import { searchEmployers, EMPLOYERS } from "@/lib/employers";
import { EVENT_INDEX, filterEvents } from "@/lib/event-index";
import { NAV, FOOTER_SECTIONS, type NavItem } from "@/lib/site";
import { buildInsights } from "@/lib/insights";
import { countries } from "@/lib/dataset";

// --- The route table, read off the filesystem --------------------------------

const APP = join(process.cwd(), "src", "app");

/** Every route the App Router will serve, with [param] segments left in place. */
function routes(dir = APP, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "page.tsx") out.push(prefix || "/");
    else if (statSync(full).isDirectory() && !entry.startsWith("_")) {
      out.push(...routes(full, `${prefix}/${entry}`));
    }
  }
  return out;
}

const ROUTES = routes();
/** A concrete URL for every dynamic route family, for the highlight matrix. */
const SAMPLE_URLS = ROUTES.map((r) =>
  r.replace("[slug]", "amazon").replace("[countrySlug]", "india").replace("[stateCode]", "CA").replace("[jobTitle]", "software-engineer")
);

/** Does a concrete path match a route pattern that may contain [params]? */
function matchesRoute(path: string, pattern: string): boolean {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return false;
  return p.every((seg, i) => (seg.startsWith("[") ? true : seg === s[i]));
}
/** Fragments and query strings are not part of the route. */
const bare = (href: string) => href.split(/[#?]/)[0] || "/";
const routeExists = (path: string) => ROUTES.some((r) => matchesRoute(bare(path), r));

// --- The navbar's own logic, mirrored ----------------------------------------
//
// Navbar.tsx is a client component; importing it here would drag React in for
// no benefit. under()/isActive() are transcribed, and the guard below fails if
// the real implementation drifts away from this copy.

function under(pathname: string, base: string): boolean {
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}
function isActive(pathname: string, item: NavItem): boolean {
  if (item.href && under(pathname, item.href)) return true;
  if (item.match?.some((m) => under(pathname, m))) return true;
  return Boolean(item.children?.some((c) => under(pathname, c.href)));
}
const sectionsFor = (path: string) => NAV.filter((i) => isActive(path, i)).map((i) => i.label);

// --- Search ------------------------------------------------------------------

describe("site-wide search finds what the site actually publishes", () => {
  it("reaches the H-1B sponsor directory, not just the ten curated profiles", () => {
    // Every one of these returned zero results before. They are among the
    // largest sponsors in the dataset.
    for (const name of ["wipro", "deloitte", "accenture", "capgemini", "jpmorgan"]) {
      const hits = search(name).filter((r) => r.type === "employer");
      expect(hits.length, `search("${name}") found no sponsor`).toBeGreaterThan(0);
      expect(hits[0].href.startsWith("/employer/")).toBe(true);
    }
  });

  it("answers the unhyphenated spelling the site's own URLs use", () => {
    for (const q of ["h1b", "H1B", "h-1b"]) {
      expect(search(q).map((r) => r.href), q).toContain("/h1b/top-sponsors");
    }
    for (const q of ["f1", "F-1"]) {
      expect(search(q).map((r) => r.href), q).toContain("/visa/f1-student-visas");
    }
  });

  it("matches employer names across their punctuation and spacing", () => {
    // Data Hub legal names are "WAL MART ASSOCIATES INC", "AMAZON.COM SERVICES
    // LLC" — nothing a reader reproduces.
    expect(searchEmployers("walmart").length).toBeGreaterThan(0);
    expect(searchEmployers("amazoncom").length).toBeGreaterThan(0);
    expect(searchEmployers("wal-mart").length).toBeGreaterThan(0);
  });

  it("leads with the exact answer, not an accident in the middle of a word", () => {
    // "hcl ameri(ca)" used to win this, so Enter went to /company/hcl-america.
    expect(search("CA")[0]?.href).toBe("/state/CA");
    expect(search("california")[0]?.href).toBe("/state/CA");
    expect(search("india")[0]?.href).toBe("/country/india");
    expect(search("amazon")[0]?.href).toBe("/company/amazon");
  });

  it("treats a one- or two-character query as a code, not a prefix", () => {
    // Otherwise "CA" word-start-matches 297 employers (Capgemini, Capital One,
    // Caterpillar) and buries California among them.
    const ca = search("CA", { perType: 100, limit: 500 });
    expect(ca.every((r) => r.type === "state")).toBe(true);
    expect(search("NY")[0]?.href).toBe("/state/NY");
  });

  it("never offers a destination that does not discuss the thing searched", () => {
    // J-1, EB and Family-based IV are in the dataset but have no page. Every
    // unmatched class used to be pointed at /h1b/top-sponsors.
    expect(search("J-1")).toHaveLength(0);
    expect(search("j1")).toHaveLength(0);
  });

  it("only ever returns hrefs that resolve to a real route", () => {
    const queries = ["amazon", "india", "california", "h1b", "software", "wipro", "texas", "f1"];
    for (const q of queries) {
      for (const r of search(q, { perType: 50, limit: 200 })) {
        expect(routeExists(r.href), `search("${q}") offered ${r.href}, which is not a route`).toBe(true);
      }
    }
  });

  it("caps each type so one large corpus cannot crowd out the rest", () => {
    // "america" matches hundreds of employers and one country-ish entity; the
    // reader must still see the other kinds of answer.
    const results = search("america", { perType: 3, limit: 30 });
    const perType = new Map<SearchResult["type"], number>();
    for (const r of results) perType.set(r.type, (perType.get(r.type) ?? 0) + 1);
    for (const [type, n] of perType) expect(n, type).toBeLessThanOrEqual(3);
  });

  it("reports the true number of matches, not the size of the trimmed list", () => {
    // The results page prints this next to a capped list. It used to print the
    // capped length, so hundreds of matches read as eight.
    const totals = searchTotals("services");
    const shown = search("services", { perType: 4, limit: 20 }).filter((r) => r.type === "employer");
    expect(totals.employer ?? 0).toBeGreaterThan(shown.length);
    expect(totals.employer ?? 0).toBe(
      EMPLOYERS.filter((e) => squash(e.name).includes("services")).length
    );
  });

  it("hands the archive fallback a query the archive can answer", () => {
    // The no-results state offers "search the change archive for X". That offer
    // has to work: "h1b" returned 0 events while "H-1B" returned 14.
    const hyphenated = filterEvents(EVENT_INDEX, { q: "H-1B" }).length;
    expect(hyphenated).toBeGreaterThan(0);
    expect(filterEvents(EVENT_INDEX, { q: "h1b" }).length).toBe(hyphenated);
  });

  it("does not let an all-punctuation term match every event", () => {
    expect(filterEvents(EVENT_INDEX, { q: "&&&" }).length).toBe(0);
  });

  it("returns nothing for an empty or punctuation-only query", () => {
    for (const q of ["", "   ", "-", "&"]) expect(search(q), q).toHaveLength(0);
  });
});

// --- "You are here" ----------------------------------------------------------

describe("the navbar says which section you are in", () => {
  it("mirrors the isActive() implementation in Navbar.tsx", async () => {
    // Guard against this file's transcription drifting from the real thing.
    const { isActive: real } = await import("@/components/Navbar");
    for (const url of SAMPLE_URLS) {
      for (const item of NAV) {
        expect(real(url, item), `${url} / ${item.label}`).toBe(isActive(url, item));
      }
    }
  });

  it("highlights a section on every generated content page", () => {
    // These are the site's organic entry points and every one of them used to
    // arrive with the navbar entirely unlit.
    const generated = [
      "/company/amazon",
      "/employer/wipro-limited",
      "/state/CA",
      "/country/india",
      "/h1b/salaries/software-engineer",
      "/h1b/state/CA",
    ];
    for (const url of generated) {
      expect(sectionsFor(url), `${url} highlights nothing`).toEqual(["Work & Visas"]);
    }
  });

  it("never highlights two sections at once", () => {
    for (const url of SAMPLE_URLS) {
      expect(sectionsFor(url).length, `${url} -> ${sectionsFor(url).join(" + ")}`).toBeLessThanOrEqual(1);
    }
  });

  it("does not let one section claim another by shared prefix", () => {
    // /layoffs vs /layoffs-vs-h1b is the collision a plain startsWith() makes.
    // They happen to share a section, so assert the primitive directly.
    expect(under("/layoffs-vs-h1b", "/layoffs")).toBe(false);
    expect(under("/layoffs/anything", "/layoffs")).toBe(true);
    expect(under("/", "/")).toBe(true);
    expect(under("/anything", "/")).toBe(false);
  });

  it("leaves only utility pages unlit", () => {
    // Legal, transparency and admin pages genuinely belong to no section.
    // Anything else appearing here is a page that fell out of the navigation.
    const unlit = SAMPLE_URLS.filter((u) => sectionsFor(u).length === 0).sort();
    expect(unlit).toEqual([
      "/about",
      // Billing pages belong to no section on purpose: the paid tier gets one
      // footer link, not a nav slot. See docs/monetization.md.
      "/account",
      "/admin/pulse-email",
      "/admin/refresh-status",
      "/data",
      "/data-manifest",
      "/developers",
      "/disclosure",
      "/methodology",
      "/pricing",
      "/privacy",
      "/search",
      "/sources",
      "/terms",
    ]);
  });
});

// --- Link integrity ----------------------------------------------------------

describe("site chrome links somewhere real", () => {
  const navHrefs = NAV.flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)]).filter(
    (h): h is string => Boolean(h)
  );
  const footerHrefs = FOOTER_SECTIONS.flatMap((s) => s.links.map((l) => l.href));

  it("every navbar destination is a route", () => {
    for (const href of navHrefs) expect(routeExists(href), href).toBe(true);
  });

  it("every footer destination is a route", () => {
    for (const href of footerHrefs) expect(routeExists(href), href).toBe(true);
  });

  it("offers the follow feature somewhere other than the homepage", () => {
    // It had exactly one entry point on the whole site, so a reader who arrived
    // anywhere else could not find a finished feature.
    expect(navHrefs).toContain("/following");
  });

  it("does not send readers to an operator tool from the public footer", () => {
    // /admin/pulse-email is a build dashboard — spam flags, byte sizes, and an
    // instruction to set RESEND_AUDIENCE_<LOCALE>. It was labelled "Pulse email
    // (weekly)", which is what a reader looking for the newsletter clicks.
    expect(footerHrefs.filter((h) => h.startsWith("/admin/pulse-email"))).toEqual([]);
    expect(footerHrefs.map(bare)).toContain("/pulse");
  });

  it("gives each nav section a match list that covers its own children", () => {
    for (const item of NAV) {
      for (const child of item.children ?? []) {
        expect(sectionsFor(child.href), `${child.href} under ${item.label}`).toEqual([item.label]);
      }
    }
  });

  it("only links to a fragment that is rendered before hydration", () => {
    // A #anchor inside a component that returns a placeholder until it hydrates
    // is not there when the browser tries to scroll to it, so the reader is
    // dropped at the top of the page with no explanation. FollowingPanel's
    // #follow is exactly that, which is why nothing links to it any more.
    const src = readFileSync(join(process.cwd(), "src", "components", "FollowingPanel.tsx"), "utf8");
    expect(src, "FollowingPanel still gates #follow behind hydration").toContain("if (!hydrated)");

    const componentDir = join(process.cwd(), "src", "components");
    const linkers = readdirSync(componentDir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => readFileSync(join(componentDir, f), "utf8").includes('"/what-changed#follow"'));
    expect(linkers, "these link at an anchor that does not exist on first paint").toEqual([]);
  });

  it("sends every generated insight to a real page", () => {
    // The top-country card built its href by lowercasing the display name.
    // "South Korea" becomes "south korea"; /country/south korea is a 404.
    for (const i of buildInsights()) {
      if (!i.href) continue;
      expect(routeExists(i.href), `insight "${i.key}" links to ${i.href}`).toBe(true);
    }
  });

  it("resolves a country page from its display name, never from lowercase", () => {
    const multiword = countries.find((c) => c.name.includes(" "));
    expect(multiword, "expected at least one multi-word country to guard").toBeTruthy();
    expect(`/country/${multiword!.name.toLowerCase()}`).not.toBe(`/country/${multiword!.slug}`);
    expect(routeExists(`/country/${multiword!.slug}`)).toBe(true);
  });
});
