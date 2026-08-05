// =============================================================================
// NEWSLETTER SYSTEM
//
// Selection, localization, rendering and validation. Weighted toward the
// failures that are invisible in a browser preview and unrecoverable once sent.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LOCALES, DEFAULT_LOCALE, isRtl, CADENCE_WINDOW_DAYS, type Segment } from "@/lib/newsletter/types";
import { STRINGS, stringsFor } from "@/lib/newsletter/locales";
import { selectIssue, MAX_ITEMS, WATCHLIST } from "@/lib/newsletter/select";
import { EVENTS } from "@/lib/event-store";
import { renderIssue } from "@/lib/newsletter/render";
import { validateIssue, validateRendered } from "@/lib/newsletter/validate";

const BASE = "https://immigrationclock.com";
const CONTACT = "hello@immigrationclock.com";
const seg = (over: Partial<Segment> = {}): Segment => ({
  id: "weekly-en",
  locale: "en",
  cadence: "weekly",
  ...over,
});

// A wide window so the suite has real events to work with regardless of when
// it runs — the committed archive reaches back to January 2025.
const wide = { windowDays: 900, today: "2026-08-04" };

describe("localization completeness", () => {
  it("has a locale file for every declared locale", () => {
    for (const l of LOCALES) expect(STRINGS[l], `missing locale: ${l}`).toBeTruthy();
  });

  it("has a directory entry for every declared locale and no orphans", () => {
    // Guards the failure where someone adds ar.ts but forgets `Locale`, or the
    // reverse — either leaves a language that cannot be selected or a type that
    // cannot be rendered.
    const dir = fileURLToPath(new URL("../src/lib/newsletter/locales", import.meta.url));
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !["index.ts", "strings.ts"].includes(f))
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();
    expect(files).toEqual([...LOCALES].sort());
  });

  it("translates every string, with no English left in a non-English locale", () => {
    for (const l of LOCALES) {
      if (l === "en") continue;
      const t = STRINGS[l];
      const en = STRINGS.en;
      // Product name and "H-1B" are proper nouns and stay identical by design.
      expect(t.item.readDocument, `${l}: readDocument untranslated`).not.toBe(en.item.readDocument);
      expect(t.trust.statement, `${l}: trust statement untranslated`).not.toBe(en.trust.statement);
      expect(t.footer.unsubscribe, `${l}: unsubscribe untranslated`).not.toBe(en.footer.unsubscribe);
      expect(t.sections.topChanges, `${l}: section heading untranslated`).not.toBe(en.sections.topChanges);
    }
  });

  it("declares the same stat keys everywhere, so no edition drops a row", () => {
    const keys = Object.keys(STRINGS.en.stats).sort();
    for (const l of LOCALES) {
      expect(Object.keys(STRINGS[l].stats).sort(), `${l} stat keys differ`).toEqual(keys);
    }
  });

  it("falls back rather than throwing on an unknown locale", () => {
    expect(stringsFor("zz" as never)).toBe(STRINGS[DEFAULT_LOCALE]);
  });

  it("marks Arabic as right-to-left and the rest as not", () => {
    expect(isRtl("ar")).toBe(true);
    for (const l of LOCALES.filter((x) => x !== "ar")) expect(isRtl(l)).toBe(false);
  });
});

describe("selection", () => {
  it("bounds an issue to the cadence window", () => {
    const issue = selectIssue({ segment: seg(), today: "2026-08-04" });
    expect(issue.from <= issue.to).toBe(true);
    for (const it of issue.items) {
      expect(it.publishedAt >= issue.from).toBe(true);
      expect(it.publishedAt <= issue.to).toBe(true);
    }
  });

  it("caps items but reports the true total, so an edit never looks like a gap", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    expect(issue.items.length).toBeLessThanOrEqual(MAX_ITEMS);
    expect(issue.totalInWindow).toBeGreaterThanOrEqual(issue.items.length);
  });

  it("leads with the most important story", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    const rank = { major: 0, notable: 1, routine: 2 } as const;
    for (let i = 1; i < issue.items.length; i++) {
      expect(rank[issue.items[i].severity]).toBeGreaterThanOrEqual(rank[issue.items[i - 1].severity]);
    }
  });

  it("excludes routine paperwork by default", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    expect(issue.items.every((i) => i.severity !== "routine")).toBe(true);
  });

  it("filters to a segment's entities — the hook every future edition uses", () => {
    const all = selectIssue({ segment: seg(), ...wide });
    const uscis = selectIssue({ segment: seg({ entityIds: ["agency:uscis"] }), ...wide });
    expect(uscis.totalInWindow).toBeLessThanOrEqual(all.totalInWindow);
    expect(uscis.totalInWindow).toBeGreaterThan(0);
  });

  it("honours excludeIds, so a breaking alert cannot repeat a story", () => {
    const first = selectIssue({ segment: seg({ cadence: "breaking" }), ...wide });
    if (first.items.length === 0) return;
    const seen = new Set(first.items.map((i) => i.id));
    const second = selectIssue({ segment: seg({ cadence: "breaking" }), ...wide, excludeIds: seen });
    for (const it of second.items) expect(seen.has(it.id)).toBe(false);
  });

  it("gives each cadence a distinct window", () => {
    expect(CADENCE_WINDOW_DAYS.daily).toBeLessThan(CADENCE_WINDOW_DAYS.weekly);
    expect(CADENCE_WINDOW_DAYS.weekly).toBeLessThan(CADENCE_WINDOW_DAYS.monthly);
  });

  it("never invents a 'why it matters'", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    for (const it of issue.items) {
      if (it.whyItMatters !== undefined) expect(it.whyItMatters.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("rendering, in every language", () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      const issue = selectIssue({ segment: seg({ id: `weekly-${locale}`, locale }), ...wide });
      const out = renderIssue(issue, BASE, CONTACT);

      it("passes its own validator", () => {
        const a = validateIssue(issue);
        const b = validateRendered(issue, out, BASE);
        expect([...a.errors, ...b.errors]).toEqual([]);
      });

      it("uses no construct that breaks a mail client", () => {
        expect(out.html).not.toMatch(/<style[\s>]/i);
        expect(out.html).not.toMatch(/<img[\s>]/i);
        expect(out.html).not.toMatch(/display:\s*(flex|grid)/i);
        expect(out.html).toMatch(/<table[^>]+role="presentation"/);
      });

      it("makes every link absolute", () => {
        const hrefs = [...out.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
        expect(hrefs.length).toBeGreaterThan(5);
        for (const h of hrefs) expect(h, `relative: ${h}`).toMatch(/^(https?:\/\/|mailto:)/);
      });

      it("ships a real plain-text part", () => {
        expect(out.text.length).toBeGreaterThan(400);
        expect(out.text).not.toMatch(/<[a-z/][^>]*>/i);
      });

      it("keeps the source document link on every card", () => {
        for (const it of issue.items) expect(out.html).toContain(it.sourceUrl);
      });

      it("carries the trust statement", () => {
        expect(out.html).toContain(stringsFor(locale).trust.statement.slice(0, 30));
      });

      it("declares direction correctly", () => {
        expect(out.html).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
      });

      it("offers every language, including its own", () => {
        for (const l of LOCALES) expect(out.html).toContain(stringsFor(l).endonym);
      });
    });
  }
});

describe("the quiet week", () => {
  // A window with nothing in it is legitimate and must not read as a broken
  // pipeline — or as "nothing happened", which we cannot claim.
  const issue = selectIssue({ segment: seg(), today: "2020-01-01", windowDays: 1 });
  const out = renderIssue(issue, BASE, CONTACT);

  it("produces no items", () => {
    expect(issue.items).toHaveLength(0);
  });

  it("still validates and still sends something honest", () => {
    expect(validateRendered(issue, out, BASE).errors).toEqual([]);
    expect(out.html).toContain("No significant official changes");
    expect(out.html).toMatch(/not a guarantee that nothing happened/i);
  });

  it("warns an operator rather than failing silently", () => {
    expect(validateIssue(issue).warnings.join()).toMatch(/no items/i);
  });
});

describe("validation catches what a preview cannot", () => {
  const issue = selectIssue({ segment: seg(), ...wide });
  const good = renderIssue(issue, BASE, CONTACT);

  it("rejects a relative link", () => {
    const broken = { ...good, html: good.html.replace(/href="https:\/\/immigrationclock\.com/, 'href="') };
    expect(validateRendered(issue, broken, BASE).errors.join()).toMatch(/relative link/);
  });

  it("rejects a missing plain-text part", () => {
    expect(validateRendered(issue, { ...good, text: "" }, BASE).errors.join()).toMatch(/plain-text/);
  });

  it("rejects markup leaking into plain text", () => {
    expect(
      validateRendered(issue, { ...good, text: `${good.text}<b>x</b>` }, BASE).errors.join()
    ).toMatch(/markup leaked/);
  });

  it("rejects an Arabic issue without dir=rtl", () => {
    const arIssue = selectIssue({ segment: seg({ locale: "ar" }), ...wide });
    const arOut = renderIssue(arIssue, BASE, CONTACT);
    const stripped = { ...arOut, html: arOut.html.replace(/dir="rtl"/g, "") };
    expect(validateRendered(arIssue, stripped, BASE).errors.join()).toMatch(/dir="rtl"/);
  });

  it("rejects an item published outside its own window", () => {
    const tampered = { ...issue, items: [{ ...issue.items[0], publishedAt: "1999-01-01" }] };
    expect(validateIssue(tampered).errors.join()).toMatch(/outside the issue window/);
  });

  it("rejects a duplicated story", () => {
    if (issue.items.length === 0) return;
    const dup = { ...issue, items: [issue.items[0], issue.items[0]] };
    expect(validateIssue(dup).errors.join()).toMatch(/appears twice/);
  });
});

describe("escaping", () => {
  it("escapes source text rather than trusting it", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    if (issue.items.length === 0) return;
    const evil = {
      ...issue,
      items: [{ ...issue.items[0], title: `Rule <script>alert(1)</script> & "quoted"` }],
    };
    const out = renderIssue(evil, BASE, CONTACT);
    expect(out.html).not.toContain("<script>alert(1)</script>");
    expect(out.html).toContain("&lt;script&gt;");
  });
});

// =============================================================================
// EDITORIAL LAYER — snapshot, the silence section, coming up, rotation, and
// personalization. The claims here are the ones a reader ACTS on.
// =============================================================================
describe("weekly snapshot", () => {
  const issue = selectIssue({ segment: seg(), ...wide });
  const out = renderIssue(issue, BASE, CONTACT);

  it("estimates a plausible reading time", () => {
    expect(issue.readingMinutes).toBeGreaterThanOrEqual(1);
    expect(issue.readingMinutes).toBeLessThan(30);
    expect(out.html).toContain(String(issue.readingMinutes));
  });

  it("reports the categories that were ZERO, not just the ones that fired", () => {
    // "No Executive Orders this week" is reassurance a reader cannot get from a
    // list that simply omits them.
    for (const k of issue.absentStats) {
      expect(issue.stats.map((s) => s.key), `${k} is both present and absent`).not.toContain(k);
    }
  });

  it("appears in the plain-text part too", () => {
    expect(out.text).toContain(stringsFor("en").sections.snapshot.toUpperCase());
  });
});

describe("what did NOT change", () => {
  it("only watches topics that exist in the resolution vocabulary", async () => {
    // A "no change" claim for something we cannot detect is a false negative,
    // and on this subject people act on reassurance.
    const { ENTITY_BY_ID } = await import("@/domains/graph/entities");
    for (const w of WATCHLIST) {
      for (const id of w.entityIds) {
        expect(ENTITY_BY_ID.has(id as never), `watchlist names unknown entity: ${id}`).toBe(true);
      }
    }
  });

  it("never claims a topic was quiet when it produced an event", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    const touched = new Set<string>();
    for (const it of [...(issue.lead?.items ?? []), ...issue.items]) {
      const ev = EVENTS.find((e) => e.id === it.id)!;
      for (const l of ev.entities) touched.add(l.entityId);
    }
    for (const w of issue.unchanged) {
      for (const id of w.entityIds) {
        expect(touched.has(id), `claimed "${w.key}" quiet but ${id} appears in the issue`).toBe(false);
      }
    }
  });

  it("has a label for every watched topic, in every language", () => {
    for (const l of LOCALES) {
      for (const w of WATCHLIST) {
        expect(STRINGS[l].unchanged.topics[w.key], `${l} missing label for ${w.key}`).toBeTruthy();
      }
    }
  });
});

describe("coming up", () => {
  const issue = selectIssue({ segment: seg(), ...wide });

  it("lists only future dates, in order", () => {
    const dated = issue.upcoming.filter((u) => u.date);
    for (const u of dated) expect(u.date! >= issue.to).toBe(true);
    for (let i = 1; i < dated.length; i++) {
      expect(dated[i].date! >= dated[i - 1].date!).toBe(true);
    }
  });

  it("gives every entry a government source", () => {
    for (const u of issue.upcoming) expect(u.sourceUrl).toMatch(/^https?:\/\//);
  });
});

describe("resource rotation", () => {
  it("shows three, not all six", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    expect(issue.resources).toHaveLength(3);
  });

  it("is deterministic — the same issue rebuilds byte-identical", () => {
    const a = selectIssue({ segment: seg(), today: "2026-08-04" });
    const b = selectIssue({ segment: seg(), today: "2026-08-04" });
    expect(a.resources).toEqual(b.resources);
  });

  it("actually rotates across weeks", () => {
    const weeks = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"].map(
      (d) => selectIssue({ segment: seg(), today: d }).resources.map((r) => r.key).join(",")
    );
    expect(new Set(weeks).size).toBeGreaterThan(1);
  });
});

describe("personalization", () => {
  it("leads with the subscriber's own topic, then general news", () => {
    const s = seg({ id: "weekly-en-h1b", entityIds: ["agency:uscis"] });
    const issue = selectIssue({ segment: s, ...wide });
    if (!issue.lead) return; // no matching stories in the window
    expect(issue.lead.entityId).toBe("agency:uscis");
    expect(issue.lead.items.length).toBeGreaterThan(0);
    // A story must never appear in both groups.
    const leadIds = new Set(issue.lead.items.map((i) => i.id));
    for (const it of issue.items) expect(leadIds.has(it.id)).toBe(false);
  });

  it("renders the lead group under its own heading, above the general feed", () => {
    const s = seg({ id: "weekly-en-uscis", entityIds: ["agency:uscis"] });
    const issue = selectIssue({ segment: s, ...wide });
    if (!issue.lead) return;
    const out = renderIssue(issue, BASE, CONTACT);
    const leadPos = out.html.indexOf(stringsFor("en").leadGroup(issue.lead.label));
    const generalPos = out.html.indexOf(stringsFor("en").sections.topChanges);
    expect(leadPos).toBeGreaterThan(-1);
    if (generalPos > -1) expect(leadPos).toBeLessThan(generalPos);
  });

  it("omits the lead group entirely on a general edition", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    expect(issue.lead).toBeUndefined();
  });
});

describe("analytics tagging", () => {
  const issue = selectIssue({ segment: seg(), ...wide });
  const out = renderIssue(issue, BASE, CONTACT);
  const hrefs = [...out.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

  it("tags internal links with the full parameter set", () => {
    const internal = hrefs.filter((h) => h.startsWith(BASE) && !h.includes("/newsletter/"));
    expect(internal.length).toBeGreaterThan(0);
    for (const h of internal) {
      for (const p of ["utm_source=newsletter", "utm_medium=email", "utm_campaign=", "locale=", "edition=", "segment="]) {
        expect(h, `${h} missing ${p}`).toContain(p);
      }
    }
  });

  it("NEVER rewrites a government source URL", () => {
    // Appending our tracking to a federalregister.gov link would alter a
    // citation — the one thing this product cannot do.
    for (const it of issue.items) {
      expect(out.html).toContain(it.sourceUrl);
      expect(it.sourceUrl).not.toContain("utm_");
    }
    for (const h of hrefs.filter((x) => /\.gov/.test(x))) {
      expect(h, `government URL was tagged: ${h}`).not.toContain("utm_");
    }
  });
});

describe("section icons", () => {
  const issue = selectIssue({ segment: seg(), ...wide });
  const out = renderIssue(issue, BASE, CONTACT);

  it("uses unicode glyphs, never images", () => {
    expect(out.html).not.toMatch(/<img[\s>]/i);
    expect(out.html).toMatch(/[◷◆✓→▦★]/);
  });

  it("hides decorative icons from screen readers", () => {
    // An icon read aloud as "black diamond" before every heading is noise.
    // Only DECORATIVE spans are checked — the brand wordmark uses the same
    // accent colour and is real text, so it must NOT be hidden.
    const iconSpans = [...out.html.matchAll(/<span[^>]*>([◷◆✓→▦★•])<\/span>/g)];
    expect(iconSpans.length).toBeGreaterThan(0);
    for (const m of iconSpans) {
      expect(m[0], `icon not hidden from screen readers: ${m[1]}`).toContain('aria-hidden="true"');
    }
  });

  it("keeps icons out of the plain-text part", () => {
    expect(out.text).not.toMatch(/[◷◆▦★]/);
  });
});

describe("accessibility", () => {
  for (const locale of LOCALES) {
    const issue = selectIssue({ segment: seg({ id: `weekly-${locale}`, locale }), ...wide });
    const out = renderIssue(issue, BASE, CONTACT);
    const heads = [...out.html.matchAll(/<h([1-6])[^>]*>/g)].map((m) => Number(m[1]));

    it(`${locale}: has exactly one h1 and no skipped levels`, () => {
      // Before this, the issue was four h2 story titles and nothing else: a
      // screen-reader user navigating by heading got no document structure.
      expect(heads.filter((h) => h === 1)).toHaveLength(1);
      for (let i = 1; i < heads.length; i++) {
        expect(heads[i] - heads[i - 1], `skip h${heads[i - 1]} -> h${heads[i]}`).toBeLessThanOrEqual(1);
      }
    });

    it(`${locale}: sections are headings, not styled paragraphs`, () => {
      expect(out.html).toMatch(/<h2[^>]*>[\s\S]{0,80}?<\/h2>/);
    });

    it(`${locale}: declares lang and dir together`, () => {
      expect(out.html).toMatch(new RegExp(`lang="${stringsFor(locale).htmlLang}"`));
      expect(out.html).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
    });

    it(`${locale}: gives the primary action a thumb-sized target`, () => {
      // 14px vertical padding on a 15px line clears 44px.
      if (issue.items.length > 0) expect(out.html).toContain("padding:14px 22px");
    });
  }
});
