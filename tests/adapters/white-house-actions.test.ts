// =============================================================================
// WHITE HOUSE PRESIDENTIAL ACTIONS
//
// The fixture is the shape of whitehouse.gov's presidential-actions feed as
// fetched on 2026-11-05, trimmed to four items: one immigration proclamation,
// one commemorative proclamation whose title says "Citizenship", one
// nominations post and one unrelated executive order.
// =============================================================================
import { afterEach, describe, expect, it, vi } from "vitest";
import { __testing as WH, whiteHouseActionsAdapter } from "@/domains/graph/adapters/white-house-actions";
import { validateEvent } from "@/domains/graph/events";

const NAV =
  '<div class="wp-block-whitehouse-topper"><h1>Presidential Actions</h1><nav><a href="https://www.whitehouse.gov/news/">All News</a> Executive Orders Nominations &amp; Appointments</nav></div>';

function item(o: { title: string; slug: string; pubDate: string; cats: string[]; excerpt: string; paras?: string[] }) {
  return `<item>
<title>${o.title}</title>
<link>https://www.whitehouse.gov/presidential-actions/${o.slug}/</link>
<pubDate>${o.pubDate}</pubDate>
${o.cats.map((c) => `<category><![CDATA[${c}]]></category>`).join("\n")}
<description><![CDATA[<p>${o.excerpt} [&#8230;]</p>
<p>The post <a href="https://www.whitehouse.gov/presidential-actions/${o.slug}/">${o.title}</a> appeared first on <a href="https://www.whitehouse.gov">The White House</a>.</p>
]]></description>
<content:encoded><![CDATA[${NAV}${(o.paras ?? []).map((p) => `<p class="wp-block-paragraph">${p}</p>`).join("")}]]></content:encoded>
</item>`;
}

const FEED = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<title>Presidential Actions &#8211; The White House</title>
${item({
  title: "Emergency Tax Relief on Diesel Fuel",
  slug: "2026/10/emergency-tax-relief-on-diesel-fuel",
  pubDate: "Tue, 06 Oct 2026 01:13:53 +0000",
  cats: ["Presidential Actions", "Executive Orders"],
  excerpt: "By the authority vested in me as President by the Constitution and the laws of the United States of America, it is hereby ordered: Section 1. Purpose and Policy. Farmers and truckers are essential to the American way of life.",
})}
${item({
  title: "Nominations Sent to the Senate",
  slug: "2026/09/nominations-sent-to-the-senate-e1fc",
  pubDate: "Mon, 28 Sep 2026 19:59:28 +0000",
  cats: ["Presidential Actions", "Nominations &amp; Appointments"],
  excerpt: "NOMINATIONS SENT TO THE SENATE: a Member of the Farm Credit Administration Board.",
})}
${item({
  title: "Restriction on Entry of Certain Nonimmigrant Workers",
  slug: "2026/09/restriction-on-entry-of-certain-nonimmigrant-workers-faad",
  pubDate: "Fri, 18 Sep 2026 21:42:13 +0000",
  cats: ["Presidential Actions", "Proclamations"],
  excerpt: "BY THE PRESIDENT OF THE UNITED STATES OF AMERICA A PROCLAMATION On September 19, 2025, Proclamation 10973 (Restriction on Entry of Certain Nonimmigrant Workers) (2025 Proclamation), was issued to address significant abuses of the H-1B nonimmigrant visa program.",
  paras: [
    "BY THE PRESIDENT OF THE UNITED STATES OF AMERICA",
    "A PROCLAMATION",
    "On September 19, 2025, Proclamation 10973 was issued to address significant abuses of the H&#8209;1B nonimmigrant visa program.",
    "DONALD J. TRUMP",
  ],
})}
${item({
  title: "Constitution Day, Citizenship Day, and Constitution Week, 2026",
  slug: "2026/09/constitution-day-citizenship-day-and-constitution-week-2026",
  pubDate: "Wed, 16 Sep 2026 20:09:16 +0000",
  cats: ["Presidential Actions", "Proclamations"],
  excerpt: "BY THE PRESIDENT OF THE UNITED STATES OF AMERICA A PROCLAMATION During Constitution Week, we proudly commemorate the 239th anniversary of the signing of the United States Constitution.",
})}
</channel></rss>`;

const items = () => WH.parseWhiteHouseFeed(FEED);
const byTitle = (t: string) => items().find((i) => i.title.startsWith(t))!;

describe("feed parsing", () => {
  it("reads every item with its link, categories and an excerpt free of WordPress furniture", () => {
    expect(items()).toHaveLength(4);
    const p = byTitle("Restriction on Entry");
    expect(p.link).toBe("https://www.whitehouse.gov/presidential-actions/2026/09/restriction-on-entry-of-certain-nonimmigrant-workers-faad/");
    expect(p.categories).toEqual(["Presidential Actions", "Proclamations"]);
    expect(p.excerpt).toMatch(/^BY THE PRESIDENT/);
    expect(p.excerpt).not.toMatch(/appeared first/);
  });

  it("keeps only the document paragraphs as body, not the site navigation", () => {
    const body = byTitle("Restriction on Entry").body!;
    expect(body).toMatch(/Proclamation 10973/);
    expect(body).not.toMatch(/All News|Nominations/);
  });

  it("dates by Washington time, so an evening post is not pushed to the next day", () => {
    // 01:13 UTC on Oct 6 is 9:13 PM on Oct 5 in Washington.
    expect(byTitle("Emergency Tax Relief").publishedAt).toBe("2026-10-05");
    expect(WH.washingtonDate("Fri, 18 Sep 2026 21:42:13 +0000")).toBe("2026-09-18");
    expect(WH.washingtonDate("not a date")).toBeNull();
  });
});

describe("what is kept", () => {
  it("keeps the immigration proclamation", () => {
    const p = byTitle("Restriction on Entry");
    expect(WH.isPersonnel(p) || WH.isCommemorative(p)).toBe(false);
    expect(WH.isImmigrationRelevant(p)).toBe(true);
  });

  it("skips a commemorative proclamation even though its title says Citizenship", () => {
    const c = byTitle("Constitution Day");
    expect(WH.isImmigrationRelevant(c)).toBe(true);
    expect(WH.isCommemorative(c)).toBe(true);
  });

  it("skips nominations and unrelated orders", () => {
    expect(WH.isPersonnel(byTitle("Nominations"))).toBe(true);
    expect(WH.isImmigrationRelevant(byTitle("Emergency Tax Relief"))).toBe(false);
  });
});

describe("events", () => {
  const ev = () => WH.toEvent(byTitle("Restriction on Entry"), "2026-11-05");

  it("produces a valid, major executive action that cites the White House page", () => {
    const e = ev();
    expect(validateEvent(e)).toEqual([]);
    expect(e.id).toBe("white_house_actions:restriction-on-entry-of-certain-nonimmigrant-workers-faad");
    expect(e.classification).toBe("executive_action");
    expect(e.severity).toBe("major");
    expect(e.title).toBe("Proclamation: Restriction on Entry of Certain Nonimmigrant Workers");
    expect(e.sourceUrl).toMatch(/^https:\/\/www\.whitehouse\.gov\/presidential-actions\//);
    expect(e.publishedAt).toBe("2026-09-18");
    expect((e.limitations ?? []).join(" ")).toMatch(/Federal Register copy is the official record/);
  });

  it("puts a title posted in capitals into readable case", () => {
    const shouting = { ...byTitle("Restriction on Entry"), title: "RESTRICTION ON ENTRY OF CERTAIN NONIMMIGRANT WORKERS" };
    expect(WH.toEvent(shouting, "2026-11-05").title).toBe("Proclamation: Restriction on Entry of Certain Nonimmigrant Workers");
  });
});

describe("one action, one event", () => {
  const wh = { sourceKey: "white_house_actions", classification: "executive_action" as const, title: "Proclamation: RESTRICTION ON ENTRY OF CERTAIN NONIMMIGRANT WORKERS" };
  const other = { sourceKey: "white_house_actions", classification: "executive_action" as const, title: "Executive Order: Something Else" };
  const fr = { sourceKey: "federal_register", classification: "executive_action" as const, title: "Proclamation: Restriction on Entry of Certain Nonimmigrant Workers" };

  it("drops the White House entry once the Federal Register copy is in the store", () => {
    const { events, collapsed } = WH.collapseWhiteHouseDuplicates([wh, other, fr]);
    expect(collapsed).toBe(1);
    expect(events).toEqual([other, fr]);
  });

  it("keeps the White House entry while the Federal Register has not caught up", () => {
    expect(WH.collapseWhiteHouseDuplicates([wh, other]).collapsed).toBe(0);
  });

  it("matches an Executive Order whose Federal Register title carries its number", () => {
    const eoWh = { ...wh, title: "Executive Order: Securing the Border" };
    const eoFr = { ...fr, title: "Executive Order 14400: Securing the Border" };
    expect(WH.collapseWhiteHouseDuplicates([eoWh, eoFr]).collapsed).toBe(1);
  });
});

describe("fetch", () => {
  afterEach(() => vi.unstubAllGlobals());
  const ctx = { since: "2026-09-01", limit: 50 };

  it("returns only the immigration action from the live feed shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(FEED, { status: 200 })));
    const r = await whiteHouseActionsAdapter.fetchEvents!(ctx);
    expect(r.failed).toBe(false);
    expect(r.events.map((e) => e.id)).toEqual(["white_house_actions:restriction-on-entry-of-certain-nonimmigrant-workers-faad"]);
    expect(r.warnings.join(" ")).toMatch(/commemorative/);
  });

  it("reports the source as unreachable rather than returning a quiet week", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    const r = await whiteHouseActionsAdapter.fetchEvents!(ctx);
    expect(r.failed).toBe(true);
    expect(r.warnings[0]).toMatch(/HTTP 403/);
  });

  it("reports a feed that parses to nothing as a format change", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>maintenance</html>", { status: 200 })));
    const r = await whiteHouseActionsAdapter.fetchEvents!(ctx);
    expect(r.failed).toBe(true);
    expect(r.warnings[0]).toMatch(/structure may have changed/);
  });
});
