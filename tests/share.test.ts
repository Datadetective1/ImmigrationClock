// =============================================================================
// SHARE URLS — one stable, unique address per record
//
// Every social post, every card and every sitemap entry is built from these
// addresses, so a change here is a change to every link ever shared. The hash
// values below are pinned on purpose: if the function moves, the test says so
// before a deploy turns every existing link into a 404.
// =============================================================================
import { describe, it, expect } from "vitest";
import { EVENTS } from "@/lib/event-store";
import {
  changePath,
  changeSlug,
  explainerPath,
  matchesChangeSlug,
  ogImagePath,
  parseTracking,
  shortHash,
  signalPath,
  slugHash,
  trackedUrl,
} from "@/lib/share";

describe("change slugs", () => {
  it("are stable: the hash is a function of the id alone", () => {
    // Pinned values. A different hash function would break every shared link.
    expect(shortHash("federal_register:2026-17726")).toBe("pu7qj6");
    expect(shortHash("uscis_policy_manual:20260831-voterregnatzceremonies")).toBe("ojmc78");
    expect(
      changeSlug({ id: "federal_register:2026-17726", title: "Rescission of Coordinated Enforcement Regulations" })
    ).toBe("rescission-of-coordinated-enforcement-regulations-pu7qj6");
    expect(changeSlug(EVENTS[0])).toBe(changeSlug({ ...EVENTS[0] }));
  });

  it("are unique across every recorded change", () => {
    const slugs = EVENTS.map(changeSlug);
    expect(new Set(slugs).size).toBe(EVENTS.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+-[a-z0-9]{6}$/);
  });

  it("resolve every event to its own slug and to no other", () => {
    for (const e of EVENTS) expect(matchesChangeSlug(e, changeSlug(e))).toBe(true);
    expect(matchesChangeSlug(EVENTS[0], changeSlug(EVENTS[1]))).toBe(false);
    expect(matchesChangeSlug(EVENTS[0], "no-hash-here")).toBe(false);
  });

  it("survive a title correction", () => {
    // The readable part is for people; the hash is the key. An old link keeps
    // resolving after the title upstream is corrected.
    const e = EVENTS[0];
    const old = changeSlug(e);
    const corrected = { ...e, title: "A completely different, corrected title" };
    expect(changeSlug(corrected)).not.toBe(old);
    expect(matchesChangeSlug(corrected, old)).toBe(true);
    expect(slugHash(old)).toBe(shortHash(e.id));
  });

  it("never produce an empty readable part", () => {
    expect(changeSlug({ id: "x:1", title: "!!!" })).toBe(`change-${shortHash("x:1")}`);
  });

  it("keep every path in one shape", () => {
    expect(changePath(EVENTS[0])).toBe(`/what-changed/${changeSlug(EVENTS[0])}`);
    expect(explainerPath("proposed-rule-vs-final-rule")).toBe("/explained/proposed-rule-vs-final-rule");
    expect(signalPath("warn-by-state")).toBe("/insights/warn-by-state");
    expect(ogImagePath("change", "x-abc123")).toBe("/og/change/x-abc123.png");
    expect(ogImagePath("page", "layoffs")).toBe("/og/page/layoffs.png");
  });
});

describe("tracking", () => {
  const tracking = { platform: "x" as const, contentType: "breaking_change", story: "change:abc123" };

  it("round-trips through the query string", () => {
    const url = trackedUrl("https://immigrationclock.com/what-changed/x-abc123", tracking);
    const u = new URL(url);
    expect(u.pathname).toBe("/what-changed/x-abc123");
    expect(u.searchParams.get("utm_source")).toBe("x");
    expect(u.searchParams.get("utm_medium")).toBe("social");
    expect(parseTracking(u.search)).toEqual(tracking);
    // With or without the leading "?", as window.location.search and
    // useSearchParams().toString() respectively hand it over.
    expect(parseTracking(u.search.slice(1))).toEqual(tracking);
  });

  it("keeps any query the page already had", () => {
    const url = trackedUrl("https://immigrationclock.com/what-changed?q=h-1b", tracking);
    expect(new URL(url).searchParams.get("q")).toBe("h-1b");
  });

  it("rejects anything that is not one of our own social posts", () => {
    expect(parseTracking("?utm_source=google&utm_medium=cpc&utm_campaign=x")).toBeNull();
    expect(parseTracking("?utm_source=x&utm_medium=email&utm_campaign=x")).toBeNull();
    expect(parseTracking("?utm_source=facebook&utm_medium=social&utm_campaign=x")).toBeNull();
    expect(parseTracking("?utm_source=x&utm_medium=social")).toBeNull();
    expect(parseTracking("?q=h-1b")).toBeNull();
    expect(parseTracking("")).toBeNull();
  });

  it("bounds what it reads back", () => {
    const t = parseTracking(
      `?utm_source=linkedin&utm_medium=social&utm_campaign=${"a".repeat(80)}&utm_content=${"b".repeat(200)}`
    );
    expect(t?.platform).toBe("linkedin");
    expect(t?.contentType.length).toBe(40);
    expect(t?.story.length).toBe(80);
  });
});
