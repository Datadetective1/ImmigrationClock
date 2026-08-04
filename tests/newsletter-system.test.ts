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
import { selectIssue, MAX_ITEMS } from "@/lib/newsletter/select";
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
