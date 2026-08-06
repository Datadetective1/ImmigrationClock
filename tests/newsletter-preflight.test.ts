/**
 * Newsletter preflight — the gate that stands between an automated pipeline and
 * every subscriber's inbox.
 *
 * Delivery is unattended, so nobody reads the issue before it ships. These
 * tests are the review. They exist because the failure worth fearing is silent:
 * an agency changes its HTML, the adapter still returns 200, the parser yields
 * nothing, and a confident empty newsletter goes out under our name.
 */
import { describe, expect, it } from "vitest";
import { assess } from "../scripts/newsletter-preflight";

const healthyRefresh = {
  ok: true,
  errors: [],
  bls: { ok: true },
  cbp: { ok: true, stale: false },
  warn: { ok: true, stale: false },
};

const healthyEvents = {
  adapters: [
    { key: "federal-register", name: "Federal Register", ok: true, eventCount: 12, warnings: [] },
    { key: "uscis-newsroom", name: "USCIS Newsroom", ok: true, eventCount: 4, warnings: [] },
  ],
  events: Array.from({ length: 400 }, (_, i) => ({ id: `e${i}` })),
};

const healthyNewsletter = {
  today: "2026-08-06",
  editions: (["en", "es", "fr", "ar"] as const).map((locale) => ({
    segment: `weekly-${locale}`,
    locale,
    items: 4,
    errors: [],
    warnings: [],
  })),
};

describe("newsletter preflight", () => {
  it("clears a healthy issue for delivery", () => {
    const v = assess(healthyRefresh, healthyEvents, healthyNewsletter);
    expect(v.safe).toBe(true);
    expect(v.blocking).toEqual([]);
  });

  describe("source format changes — the case this gate exists for", () => {
    it("withholds delivery when an adapter reports a parse failure but still says ok", () => {
      const events = {
        ...healthyEvents,
        adapters: [
          ...healthyEvents.adapters,
          {
            key: "uscis-newsroom",
            name: "USCIS Newsroom",
            ok: true, // the trap: HTTP 200, adapter "succeeded"
            eventCount: 0,
            warnings: ["could not find article selector .news-item"],
          },
        ],
      };
      const v = assess(healthyRefresh, events, healthyNewsletter);
      expect(v.safe).toBe(false);
      expect(v.blocking.join(" ")).toMatch(/USCIS Newsroom.*format change/i);
    });

    it.each([
      "unexpected response schema",
      "malformed row at index 4",
      "selector no longer matches",
      "could not find the results table",
      "response shape changed",
    ])("treats %j as a blocking source change", (warning) => {
      const events = {
        ...healthyEvents,
        adapters: [{ key: "a", name: "A", ok: true, eventCount: 0, warnings: [warning] }],
      };
      expect(assess(healthyRefresh, events, healthyNewsletter).safe).toBe(false);
    });

    it("does not block on ordinary operating conditions", () => {
      const events = {
        ...healthyEvents,
        adapters: [
          { key: "congress", name: "Congress", ok: true, eventCount: 0, warnings: ["not configured"] },
          { key: "fr", name: "Federal Register", ok: true, eventCount: 9, warnings: ["offline: skipped"] },
        ],
      };
      const v = assess(healthyRefresh, events, healthyNewsletter);
      expect(v.safe).toBe(true);
      expect(v.warnings.length).toBeGreaterThan(0);
    });

    it("withholds delivery when an adapter outright fails", () => {
      const events = {
        ...healthyEvents,
        adapters: [{ key: "a", name: "A", ok: false, eventCount: 0, warnings: [] }],
      };
      expect(assess(healthyRefresh, events, healthyNewsletter).safe).toBe(false);
    });

    it("withholds delivery when the adapter list is empty", () => {
      const v = assess(healthyRefresh, { ...healthyEvents, adapters: [] }, healthyNewsletter);
      expect(v.safe).toBe(false);
      expect(v.blocking.join(" ")).toMatch(/no adapters/i);
    });
  });

  describe("missing data", () => {
    it("withholds delivery when the event archive is empty", () => {
      const v = assess(healthyRefresh, { ...healthyEvents, events: [] }, healthyNewsletter);
      expect(v.safe).toBe(false);
      expect(v.blocking.join(" ")).toMatch(/archive is empty/i);
    });

    it("refuses to mail an issue with zero items", () => {
      const nl = {
        ...healthyNewsletter,
        editions: healthyNewsletter.editions.map((e) =>
          e.locale === "fr" ? { ...e, items: 0 } : e
        ),
      };
      const v = assess(healthyRefresh, healthyEvents, nl);
      expect(v.safe).toBe(false);
      expect(v.blocking.join(" ")).toMatch(/zero items/i);
    });

    it("refuses to ship when a language edition is missing", () => {
      const nl = {
        ...healthyNewsletter,
        editions: healthyNewsletter.editions.filter((e) => e.locale !== "ar"),
      };
      const v = assess(healthyRefresh, healthyEvents, nl);
      expect(v.safe).toBe(false);
      expect(v.blocking.join(" ")).toMatch(/missing AR edition/i);
    });

    it("propagates an edition's own validation errors", () => {
      const nl = {
        ...healthyNewsletter,
        editions: healthyNewsletter.editions.map((e) =>
          e.locale === "es" ? { ...e, errors: ["subject line is empty"] } : e
        ),
      };
      const v = assess(healthyRefresh, healthyEvents, nl);
      expect(v.safe).toBe(false);
      expect(v.blocking.join(" ")).toMatch(/subject line is empty/);
    });
  });

  describe("upstream feeds", () => {
    it("withholds delivery when the refresh reports failure", () => {
      const v = assess({ ...healthyRefresh, ok: false }, healthyEvents, healthyNewsletter);
      expect(v.safe).toBe(false);
    });

    it("withholds delivery when a feed errored", () => {
      const v = assess(
        { ...healthyRefresh, errors: ["CBP: HTTP 503"] },
        healthyEvents,
        healthyNewsletter
      );
      expect(v.safe).toBe(false);
      expect(v.blocking.join(" ")).toMatch(/HTTP 503/);
    });

    it("withholds delivery when a named feed failed", () => {
      const v = assess(
        { ...healthyRefresh, cbp: { ok: false } },
        healthyEvents,
        healthyNewsletter
      );
      expect(v.safe).toBe(false);
      expect(v.blocking.join(" ")).toMatch(/CBP feed failed/);
    });

    it("still ships when a feed is merely stale — last-good data is real data", () => {
      const v = assess(
        { ...healthyRefresh, warn: { ok: true, stale: true } },
        healthyEvents,
        healthyNewsletter
      );
      expect(v.safe).toBe(true);
      expect(v.warnings.join(" ")).toMatch(/stale/i);
    });
  });

  it("reports every blocking reason at once, not just the first", () => {
    const v = assess(
      { ...healthyRefresh, ok: false },
      { adapters: [], events: [] },
      { today: "x", editions: [] }
    );
    expect(v.safe).toBe(false);
    expect(v.blocking.length).toBeGreaterThanOrEqual(4);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Unsubscribe. spamFlags were computed and then ignored, so "no
  // unsubscribe link" was reported to nobody and stopped nothing.
  // ─────────────────────────────────────────────────────────────────────
  describe("the opt-out is blocking, not advisory", () => {
    const withEdition = (over: Record<string, unknown>) => ({
      ...healthyNewsletter,
      editions: [{ ...healthyNewsletter.editions[0], ...over }, ...healthyNewsletter.editions.slice(1)],
    });

    it("blocks on a spamFlag that mentions unsubscribe", () => {
      const v = assess(healthyRefresh, healthyEvents, withEdition({ spamFlags: ["no unsubscribe link"] }));
      expect(v.safe).toBe(false);
      expect(v.blocking.join(" ")).toMatch(/unsubscribe/i);
    });

    it("blocks on a signup-page opt-out", () => {
      const v = assess(
        healthyRefresh,
        healthyEvents,
        withEdition({ spamFlags: ['unsubscribe link points at the signup page "https://immigrationclock.com/pulse"'] })
      );
      expect(v.safe).toBe(false);
    });

    it("blocks in every language the product ships", () => {
      for (const flag of [
        "unsubscribe link is not labelled",
        "lien Se désabonner manquant",
        "falta el enlace Cancelar suscripción",
        "رابط إلغاء الاشتراك مفقود",
      ]) {
        const v = assess(healthyRefresh, healthyEvents, withEdition({ spamFlags: [flag] }));
        expect(v.safe, `"${flag}" was not treated as blocking`).toBe(false);
      }
    });

    it("blocks on a structured blockingFlag from the build", () => {
      const v = assess(
        healthyRefresh,
        healthyEvents,
        withEdition({ blockingFlags: ["unsubscribe-missing"], safeToSend: false })
      );
      expect(v.safe).toBe(false);
      expect(v.blocking.join(" ")).toMatch(/unsubscribe-missing/);
    });

    it("blocks when the build said unsafe but recorded no code", () => {
      const v = assess(healthyRefresh, healthyEvents, withEdition({ safeToSend: false }));
      expect(v.safe).toBe(false);
      expect(v.blocking.join(" ")).toMatch(/unsafe to send/i);
    });

    it("keeps unrelated deliverability heuristics advisory", () => {
      const v = assess(
        healthyRefresh,
        healthyEvents,
        withEdition({ spamFlags: ["subject may truncate", "high link count", "thin plain-text part"] })
      );
      expect(v.safe).toBe(true);
      expect(v.warnings.join(" ")).toMatch(/subject may truncate/);
    });

    it("clears an edition whose build recorded a clean verdict", () => {
      const v = assess(
        healthyRefresh,
        healthyEvents,
        withEdition({ spamFlags: [], blockingFlags: [], safeToSend: true })
      );
      expect(v.safe).toBe(true);
    });
  });
});
