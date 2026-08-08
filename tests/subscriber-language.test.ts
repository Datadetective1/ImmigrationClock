// =============================================================================
// SUBSCRIBER LANGUAGE
//
// Two facts kept apart on purpose: WHAT a subscriber chose (a contact property,
// always written) and WHERE that language is delivered (a segment, a
// billing-limited resource — three on the current plan, spent on EN/ES/FR).
//
// The tests that matter most are the ones about Arabic and about changing your
// mind. An Arabic subscriber must be recorded truthfully with no segment to
// deliver to, and a subscriber who switches language must MOVE rather than
// accumulate a second membership — two memberships is two newsletters in two
// languages, every week, at double the send cost.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  LANGUAGE_PROPERTY,
  configuredSegments,
  effectiveLocale,
  parseLocale,
  planSegments,
  segmentEnvVar,
  segmentIdFor,
  segmentSourceName,
  segmentSources,
} from "@/lib/newsletter/subscriber-language";
import { LOCALES } from "@/lib/newsletter/types";

/** The production shape: three segments, no Arabic. */
const THREE = {
  RESEND_SEGMENT_EN: "seg_en",
  RESEND_SEGMENT_ES: "seg_es",
  RESEND_SEGMENT_FR: "seg_fr",
} as unknown as NodeJS.ProcessEnv;

describe("parsing a submitted language", () => {
  it("accepts every supported locale", () => {
    for (const l of LOCALES) expect(parseLocale(l)).toBe(l);
  });

  it("normalises case and surrounding space", () => {
    expect(parseLocale(" EN ")).toBe("en");
    expect(parseLocale("Fr")).toBe("fr");
  });

  it("REJECTS anything else rather than defaulting", () => {
    // A silent default is indistinguishable from a real choice once stored.
    for (const bad of ["", "de", "en-US", "english", "EN_US", null, undefined, 1, true, {}, ["en"]]) {
      expect(parseLocale(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("resolving a segment for a language", () => {
  it("names the env var predictably, so adding Arabic is configuration", () => {
    expect(segmentEnvVar("ar")).toBe("RESEND_SEGMENT_AR");
    expect(segmentEnvVar("en")).toBe("RESEND_SEGMENT_EN");
  });

  it("returns null for a language with no segment", () => {
    expect(segmentIdFor("ar", THREE)).toBeNull();
  });

  it("resolves the three configured languages", () => {
    expect(segmentIdFor("en", THREE)).toBe("seg_en");
    expect(segmentIdFor("es", THREE)).toBe("seg_es");
    expect(segmentIdFor("fr", THREE)).toBe("seg_fr");
  });

  it("falls back to the legacy single segment for English only", () => {
    // The three existing subscribers live in RESEND_NEWSLETTER_SEGMENT_ID and
    // chose nothing. Reading it keeps them exactly where they are.
    const legacy = { RESEND_NEWSLETTER_SEGMENT_ID: "seg_legacy" } as unknown as NodeJS.ProcessEnv;
    expect(segmentIdFor("en", legacy)).toBe("seg_legacy");
    expect(segmentIdFor("es", legacy)).toBeNull();
    expect(segmentIdFor("fr", legacy)).toBeNull();
    expect(segmentIdFor("ar", legacy)).toBeNull();
  });

  it("prefers an explicit English segment over the legacy one", () => {
    const both = { ...THREE, RESEND_NEWSLETTER_SEGMENT_ID: "seg_legacy" } as unknown as NodeJS.ProcessEnv;
    expect(segmentIdFor("en", both)).toBe("seg_en");
  });

  it("lists only languages that have somewhere to deliver", () => {
    expect([...configuredSegments(THREE).keys()]).toEqual(["en", "es", "fr"]);
  });

  it("ADDING ARABIC IS CONFIGURATION ONLY — no code path changes", () => {
    const withAr = { ...THREE, RESEND_SEGMENT_AR: "seg_ar" } as unknown as NodeJS.ProcessEnv;
    expect(segmentIdFor("ar", withAr)).toBe("seg_ar");
    expect(planSegments("ar", withAr).join).toBe("seg_ar");
    expect([...configuredSegments(withAr).keys()]).toEqual([...LOCALES]);
  });
});

// =============================================================================
// ONE VARIABLE FAMILY
//
// Signup wrote RESEND_SEGMENT_<LOCALE> while the sender read
// RESEND_AUDIENCE_<LOCALE> — two independent names for one Resend destination,
// with nothing enforcing that they matched. A subscriber added to one segment
// while the broadcast targeted another produces no error anywhere: the signup
// works, the send reports success, and the inbox stays empty.
// =============================================================================
describe("consolidated configuration", () => {
  it("prefers the canonical name over every alias", () => {
    const all = {
      RESEND_SEGMENT_EN: "canonical",
      RESEND_AUDIENCE_EN: "alias",
      RESEND_NEWSLETTER_SEGMENT_ID: "legacy",
    } as unknown as NodeJS.ProcessEnv;
    expect(segmentIdFor("en", all)).toBe("canonical");
    expect(segmentSourceName("en", all)).toBe("RESEND_SEGMENT_EN");
  });

  it("still honours RESEND_AUDIENCE_* so the deployed config survives the cutover", () => {
    // This is what the first production send actually used. If it stopped
    // resolving, Thursday would mail nobody and report success.
    const deployed = {
      RESEND_AUDIENCE_EN: "aud_en",
      RESEND_AUDIENCE_ES: "aud_es",
      RESEND_AUDIENCE_FR: "aud_fr",
    } as unknown as NodeJS.ProcessEnv;
    expect(segmentIdFor("en", deployed)).toBe("aud_en");
    expect(segmentIdFor("es", deployed)).toBe("aud_es");
    expect(segmentIdFor("fr", deployed)).toBe("aud_fr");
    expect(segmentSourceName("es", deployed)).toBe("RESEND_AUDIENCE_ES");
  });

  it("falls back through canonical, alias, then legacy — in that order", () => {
    expect(segmentSources("en")).toEqual([
      "RESEND_SEGMENT_EN",
      "RESEND_AUDIENCE_EN",
      "RESEND_NEWSLETTER_SEGMENT_ID",
    ]);
    // The legacy single segment is ENGLISH ONLY. Offering it to another
    // language would be the exact cross-language leak this work removes.
    expect(segmentSources("es")).toEqual(["RESEND_SEGMENT_ES", "RESEND_AUDIENCE_ES"]);
    expect(segmentSources("ar")).toEqual(["RESEND_SEGMENT_AR", "RESEND_AUDIENCE_AR"]);
  });

  it("never resolves a non-English language from the legacy single segment", () => {
    const legacyOnly = { RESEND_NEWSLETTER_SEGMENT_ID: "seg_legacy" } as unknown as NodeJS.ProcessEnv;
    for (const l of ["es", "fr", "ar"] as const) {
      expect(segmentIdFor(l, legacyOnly), `${l} borrowed the English segment`).toBeNull();
    }
  });

  it("reports no source when nothing is configured", () => {
    expect(segmentSourceName("ar", THREE)).toBeNull();
  });
});

// =============================================================================
// LEGACY SUBSCRIBERS
// =============================================================================
describe("a contact with no language property", () => {
  it("is treated as English — by rule, not by inference", () => {
    // The three existing subscribers chose nothing. Treating absent as unknown
    // would silently drop them from every future send.
    expect(effectiveLocale(null)).toBe("en");
    expect(effectiveLocale(undefined)).toBe("en");
    expect(effectiveLocale({})).toBe("en");
    expect(effectiveLocale({ other: "value" })).toBe("en");
  });

  it("uses a stored preference when there is one", () => {
    for (const l of LOCALES) expect(effectiveLocale({ language: l })).toBe(l);
  });

  it("falls back to English on a corrupt or unsupported stored value", () => {
    // Better a legacy English subscriber keeps receiving than is dropped.
    for (const bad of ["de", "", "en-US", 42, null]) {
      expect(effectiveLocale({ language: bad }), String(bad)).toBe("en");
    }
  });
});

// =============================================================================
// THE BACKFILL CANNOT CORRUPT LANGUAGE MEMBERSHIP
//
// The first version read one variable and added EVERY subscribed contact to it.
// Run after languages existed, it would have swept Spanish, French and Arabic
// subscribers into the English segment — and looked like it worked.
//
// It now derives each destination from the contact's own language through the
// same resolver used here, so these rules ARE the backfill's routing.
// =============================================================================
describe("backfill routing rules", () => {
  const route = (properties: Record<string, unknown> | null) => {
    const locale = effectiveLocale(properties);
    return { locale, target: segmentIdFor(locale, THREE) };
  };

  it("sends a legacy contact with no property to English", () => {
    expect(route(null)).toEqual({ locale: "en", target: "seg_en" });
    expect(route({})).toEqual({ locale: "en", target: "seg_en" });
  });

  it("routes each language to its OWN segment, never English", () => {
    expect(route({ language: "es" })).toEqual({ locale: "es", target: "seg_es" });
    expect(route({ language: "fr" })).toEqual({ locale: "fr", target: "seg_fr" });
    for (const l of ["es", "fr"] as const) {
      expect(route({ language: l }).target, `${l} was routed to English`).not.toBe("seg_en");
    }
  });

  it("leaves an Arabic contact unrouted rather than redirecting them", () => {
    const r = route({ language: "ar" });
    expect(r.locale).toBe("ar");
    expect(r.target).toBeNull();
    expect(r.target).not.toBe("seg_en");
  });

  it("the script no longer accepts a single global target segment", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(
      fileURLToPath(new URL("../scripts/backfill-segment.ts", import.meta.url)),
      "utf8"
    );
    // The old failure mode was one variable read once and applied to everyone.
    expect(src).not.toMatch(/const SEGMENT = process\.env/);
    expect(src).toMatch(/effectiveLocale/);
    expect(src).toMatch(/segmentIdFor/);
    // And it must still refuse to write by default.
    expect(src).toMatch(/--apply/);
  });
});

describe("membership reconciles to the stored preference", () => {
  it("joins the matching segment and leaves every other", () => {
    const plan = planSegments("es", THREE);
    expect(plan.join).toBe("seg_es");
    expect(plan.leave.sort()).toEqual(["seg_en", "seg_fr"]);
  });

  it("EN routes to EN only", () => {
    expect(planSegments("en", THREE).join).toBe("seg_en");
    expect(planSegments("en", THREE).leave).not.toContain("seg_en");
  });

  it("FR routes to FR only", () => {
    const plan = planSegments("fr", THREE);
    expect(plan.join).toBe("seg_fr");
    expect(plan.leave.sort()).toEqual(["seg_en", "seg_es"]);
  });

  it("NO CROSS-LANGUAGE MEMBERSHIP: the joined segment is never also left", () => {
    for (const l of LOCALES) {
      const plan = planSegments(l, THREE);
      if (plan.join) expect(plan.leave, `${l} would leave the segment it just joined`).not.toContain(plan.join);
    }
  });

  it("ARABIC joins nothing and leaves the others — never falls back to English", () => {
    const plan = planSegments("ar", THREE);
    expect(plan.join).toBeNull();
    expect(plan.leave.sort()).toEqual(["seg_en", "seg_es", "seg_fr"]);
    // The critical assertion: an Arabic choice must not put anyone on the
    // English list, where they would receive mail they did not ask for.
    expect(plan.join).not.toBe("seg_en");
  });

  it("does not strip a contact when two languages share one segment id", () => {
    // Possible mid-migration. Joining and then leaving the same id would remove
    // the contact from the list it was just added to.
    const shared = { RESEND_SEGMENT_EN: "seg_shared", RESEND_SEGMENT_ES: "seg_shared" } as unknown as NodeJS.ProcessEnv;
    const plan = planSegments("es", shared);
    expect(plan.join).toBe("seg_shared");
    expect(plan.leave).toEqual([]);
  });

  it("changing language is a MOVE, not an addition", () => {
    // Someone re-subscribing in French leaves English behind.
    const before = planSegments("en", THREE);
    const after = planSegments("fr", THREE);
    expect(before.join).toBe("seg_en");
    expect(after.join).toBe("seg_fr");
    expect(after.leave).toContain("seg_en");
  });

  it("leaves nothing when no segment is configured at all", () => {
    const plan = planSegments("en", {} as unknown as NodeJS.ProcessEnv);
    expect(plan).toEqual({ join: null, leave: [] });
  });

  it("uses one property key everywhere", () => {
    expect(LANGUAGE_PROPERTY).toBe("language");
  });
});
