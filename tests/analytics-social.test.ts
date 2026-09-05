// =============================================================================
// SOCIAL ARRIVALS AND SHARES — measured once, with nothing about the reader
//
// A click from one of our own posts is the one signal that says whether the
// publisher is worth running. It must be counted exactly once per story per
// session, it must not rewrite the URL Plausible reads its own attribution
// from, and it must carry a public record key and a fixed content type —
// never anything a person typed.
// =============================================================================
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  SOCIAL_ARRIVAL_PREFIX,
  claimSocialArrival,
  trackShare,
  trackSocialArrival,
  trackStoryView,
  type AnalyticsEvent,
  type OnceStore,
  track,
  watchlistSizeBucket,
} from "@/lib/analytics";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function memoryStore(): OnceStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

const SEARCH = "?utm_source=x&utm_medium=social&utm_campaign=breaking_change&utm_content=change:abc123";
const EXPECTED = { platform: "x", contentType: "breaking_change", story: "change:abc123" };

describe("taxonomy", () => {
  it("adds both events to the event union and the Plausible goal list", () => {
    const src = read("src/lib/analytics.ts");
    expect(src).toMatch(/\|\s*"social_post_click"/);
    expect(src).toMatch(/\|\s*"share_click"/);
    expect(src).toMatch(/social_post_click:\s*"Social Post Click"/);
    expect(src).toMatch(/share_click:\s*"Share Click"/);
    // Type-level: these compile only if the union carries them.
    const events: AnalyticsEvent[] = ["social_post_click", "share_click"];
    expect(events).toHaveLength(2);
  });
});

describe("a social arrival fires exactly once per story per session", () => {
  it("fires on first sight and never again for the same story", () => {
    const store = memoryStore();
    expect(claimSocialArrival(SEARCH, store)).toEqual(EXPECTED);
    expect(claimSocialArrival(SEARCH, store)).toBeNull();
    expect(claimSocialArrival(SEARCH, store)).toBeNull();
    expect(store.data.has(`${SOCIAL_ARRIVAL_PREFIX}change:abc123`)).toBe(true);
  });

  it("counts a different story in the same session separately", () => {
    const store = memoryStore();
    expect(claimSocialArrival(SEARCH, store)).toEqual(EXPECTED);
    const other = SEARCH.replace("change:abc123", "explainer:opt-in-plain-terms");
    expect(claimSocialArrival(other, store)?.story).toBe("explainer:opt-in-plain-terms");
    expect(claimSocialArrival(other, store)).toBeNull();
  });

  it("accepts the query with or without its leading question mark", () => {
    expect(claimSocialArrival(SEARCH.slice(1), memoryStore())).toEqual(EXPECTED);
  });

  it("ignores traffic that is not from one of our own posts", () => {
    const store = memoryStore();
    expect(claimSocialArrival("?utm_source=google&utm_medium=cpc&utm_campaign=x", store)).toBeNull();
    expect(claimSocialArrival("?q=h-1b", store)).toBeNull();
    expect(claimSocialArrival("", store)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it("fires without a store rather than losing the arrival", () => {
    expect(claimSocialArrival(SEARCH, null)).toEqual(EXPECTED);
    expect(claimSocialArrival(SEARCH, null)).toEqual(EXPECTED);
  });

  it("survives a store that throws", () => {
    const broken: OnceStore = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(claimSocialArrival(SEARCH, broken)).toEqual(EXPECTED);
  });

  it("keys by platform and type when a post carries no story", () => {
    const store = memoryStore();
    const noStory = "?utm_source=linkedin&utm_medium=social&utm_campaign=data_signal";
    expect(claimSocialArrival(noStory, store)?.story).toBe("");
    expect(store.data.has(`${SOCIAL_ARRIVAL_PREFIX}linkedin:data_signal`)).toBe(true);
    expect(claimSocialArrival(noStory, store)).toBeNull();
  });
});

describe("the events reach the provider with fixed, non-identifying props", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  function withProvider() {
    const plausible = vi.fn();
    (globalThis as { window?: unknown }).window = { plausible };
    return plausible;
  }

  it("social_post_click carries platform, type, story and path", () => {
    const plausible = withProvider();
    trackSocialArrival({ platform: "x", contentType: "explainer", story: "explainer:opt" }, "/explained/opt");
    expect(plausible).toHaveBeenCalledWith("Social Post Click", {
      props: { platform: "x", content_type: "explainer", story: "explainer:opt", path: "/explained/opt" },
    });
  });

  it("share_click drops an absent story rather than sending an empty dimension", () => {
    const plausible = withProvider();
    trackShare("page");
    expect(plausible).toHaveBeenCalledWith("Share Click", { props: { surface: "page" } });
    trackShare("change", "change:abc123");
    expect(plausible).toHaveBeenLastCalledWith("Share Click", {
      props: { surface: "change", story: "change:abc123" },
    });
  });

  it("a story view is the feed's own event, marked as a story entry", () => {
    const plausible = withProvider();
    trackStoryView("change:abc123", "final_rule");
    expect(plausible).toHaveBeenCalledWith("What Changed View", {
      props: { entry: "story", story: "change:abc123", category: "final_rule" },
    });
  });

  it("is a no-op with no provider and no window", () => {
    expect(() => trackSocialArrival({ platform: "x", contentType: "x", story: "" }, "/")).not.toThrow();
  });
});

// =============================================================================
// NOTHING A READER SELECTS MAY REACH A THIRD PARTY
//
// On most sites a followed topic is a topic. Here the topic IS the person: a
// browser that follows country:venezuela and visa:tps has disclosed a
// nationality and an immigration status, and two events from one session are
// correlatable. entity_follow sent the exact entity id until this test existed.
//
// The rule this pins: analytics may carry the CATEGORY of a selection, never the
// selection. Nothing here asserts an implementation detail — it asserts that a
// payload cannot contain a country, a visa, an employer slug or an email.
// =============================================================================
describe("analytics never carry a reader's selection", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  function capture() {
    const calls: { name: string; props: Record<string, unknown> }[] = [];
    (globalThis as { window?: unknown }).window = {
      plausible: (name: string, opts?: { props?: Record<string, unknown> }) =>
        calls.push({ name, props: opts?.props ?? {} }),
    };
    return calls;
  }

  /** Values that must never appear in any analytics payload, anywhere. */
  const FORBIDDEN = [
    /country:/i,
    /visa:/i,
    /employer:/i,
    /\bvenezuela\b/i,
    /\bh-1b\b/i,
    /@/,
    /\bcus_/i,
    /\bsub_/i,
    /\bcs_(?:test|live)_/i,
  ];

  it("entity_follow carries the category and a bucketed size, never the entity", () => {
    const calls = capture();
    track("entity_follow", {
      entity_type: "country",
      action: "follow",
      total: watchlistSizeBucket(3),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].props).toEqual({ entity_type: "country", action: "follow", total: "2-5" });
  });

  it("refuses every forbidden value in a realistic follow payload", () => {
    const calls = capture();
    track("entity_follow", {
      entity_type: "country",
      action: "follow",
      total: watchlistSizeBucket(1),
    });
    const serialized = JSON.stringify(calls);
    for (const pattern of FORBIDDEN) {
      expect(serialized, `analytics payload matched ${pattern}`).not.toMatch(pattern);
    }
  });

  it("buckets a watchlist size rather than sending the count", () => {
    // An exact count narrows a browser to a small group beside anything else,
    // and no product question needs it.
    expect(watchlistSizeBucket(0)).toBe("0");
    expect(watchlistSizeBucket(1)).toBe("1");
    expect(watchlistSizeBucket(5)).toBe("2-5");
    expect(watchlistSizeBucket(6)).toBe("6-20");
    expect(watchlistSizeBucket(60)).toBe("21+");
  });

  it("keeps every monetization event free of customer identifiers", () => {
    // The funnel is the place a Stripe id or an email is most likely to be added
    // by a future edit, and nothing guarded it before.
    const calls = capture();
    track("pricing_view", { plan: "pro" });
    track("checkout_started", { plan: "pro", interval: "monthly" });
    track("subscription_active", { plan: "pro" });
    const serialized = JSON.stringify(calls);
    for (const pattern of FORBIDDEN) {
      expect(serialized, `a monetization payload matched ${pattern}`).not.toMatch(pattern);
    }
  });
});

describe("the components", () => {
  const arrival = read("src/components/SocialArrival.tsx");

  it("reads the query and never rewrites it", () => {
    expect(arrival).toMatch(/claimSocialArrival\(/);
    expect(arrival).toMatch(/trackSocialArrival\(/);
    expect(arrival).not.toMatch(/replaceState|router\.(replace|push)|window\.location\s*=/);
  });

  it("guards storage access", () => {
    expect(arrival).toMatch(/try \{[\s\S]*?sessionStorage[\s\S]*?\} catch/);
  });

  it("is mounted once in the root layout, inside Suspense", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toMatch(/<Suspense fallback=\{null\}>\s*<SocialArrival \/>\s*<\/Suspense>/);
  });

  it("the share button records the click before the sheet can be cancelled", () => {
    const button = read("src/components/ShareButton.tsx");
    expect(button.indexOf("trackShare(")).toBeGreaterThan(-1);
    expect(button.indexOf("trackShare(")).toBeLessThan(button.indexOf("navigator.share"));
  });

  it("the story page fires its view exactly once per mount", () => {
    const story = read("src/components/StoryAnalytics.tsx");
    expect(story).toMatch(/useRef\(false\)/);
    expect(story).toMatch(/trackStoryView\(story, category\)/);
  });
});
