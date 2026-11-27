// =============================================================================
// IMMIGRATION PULSE REDESIGN (Nov 2026)
//
// The first layout was accurate and nobody wanted to open it: a subject that
// said only "5 changes", five identical cards each printing a full government
// paragraph and its own big button, and the topics readers actually follow
// (H-1B, employment green cards) buried in a box near the bottom. These tests
// pin the parts of the redesign a reader acts on.
// =============================================================================
import { describe, it, expect } from "vitest";

import { LOCALES, CORE_WATCH, type Issue, type Segment } from "@/lib/newsletter/types";
import { stringsFor } from "@/lib/newsletter/locales";
import { selectIssue, WATCHLIST } from "@/lib/newsletter/select";
import { renderIssue } from "@/lib/newsletter/render";
import { validateIssue, validateRendered, mergeResults } from "@/lib/newsletter/validate";
import { preflight } from "@/lib/newsletter/preflight";
import { excerpt, headline, sentences } from "@/lib/newsletter/excerpt";

const BASE = "https://immigrationclock.com";
const CONTACT = "hello@immigrationclock.com";
const seg = (over: Partial<Segment> = {}): Segment => ({ id: "weekly-en", locale: "en", cadence: "weekly", ...over });
const wide = { windowDays: 900, today: "2026-08-04" };

describe("excerpts quote whole sentences, verbatim", () => {
  it("does not split on U.S., C.F.R. or I&N Dec.", () => {
    const s =
      "U.S. Citizenship and Immigration Services (USCIS) is updating guidance. The deadline in 8 C.F.R. § 1003.38(b) is a rule. Matter of X, 28 I&N Dec. 714 (BIA 2023), overruled.";
    expect(sentences(s)).toEqual([
      "U.S. Citizenship and Immigration Services (USCIS) is updating guidance.",
      "The deadline in 8 C.F.R. § 1003.38(b) is a rule.",
      "Matter of X, 28 I&N Dec. 714 (BIA 2023), overruled.",
    ]);
  });

  it("returns a short summary untouched", () => {
    expect(excerpt("Short and complete.")).toEqual({ text: "Short and complete.", shortened: false });
  });

  it("stops at a sentence boundary inside the budget", () => {
    const one = "A".repeat(100) + ".";
    const two = "B".repeat(100) + ".";
    const three = "C".repeat(100) + ".";
    const ex = excerpt(`${one} ${two} ${three}`, 220);
    expect(ex.text).toBe(`${one} ${two}`);
    expect(ex.shortened).toBe(true);
  });

  it("cuts an over-long first sentence at a word and marks it", () => {
    const long = "word ".repeat(100).trim() + ".";
    const ex = excerpt(long, 120);
    expect(ex.text.endsWith("…")).toBe(true);
    expect(ex.text.length).toBeLessThanOrEqual(121);
    expect(long.startsWith(ex.text.slice(0, -1))).toBe(true);
  });

  it("every excerpt in a real issue is a prefix of the official summary", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    for (const it of issue.items) {
      const ex = excerpt(it.summary);
      const norm = it.summary.replace(/\s+/g, " ").trim();
      expect(norm.startsWith(ex.text.replace(/…$/, ""))).toBe(true);
    }
  });

  it("drops only the USCIS alert prefix from a headline", () => {
    expect(headline("Policy alert: Special Immigrant Juvenile Adjustment of Status")).toBe(
      "Special Immigrant Juvenile Adjustment of Status"
    );
    expect(headline("Board of Immigration Appeals precedent: 30 I&N Dec. 249")).toBe(
      "Board of Immigration Appeals precedent: 30 I&N Dec. 249"
    );
  });
});

describe("subject line answers the core question", () => {
  const issue = selectIssue({ segment: seg(), ...wide });

  const quietCore: Issue = {
    ...issue,
    unchanged: WATCHLIST.slice(),
    watch: WATCHLIST.map((w) => ({ key: w.key, changed: false })),
  };
  const h1bNews: Issue = {
    ...issue,
    unchanged: WATCHLIST.filter((w) => w.key !== "h1b"),
    watch: WATCHLIST.map((w) => ({ key: w.key, changed: w.key === "h1b" })),
  };

  it("says H-1B and EB green cards were quiet when they were", () => {
    if (issue.counts.shown === 0) return;
    const out = renderIssue(quietCore, BASE, CONTACT);
    expect(out.subject).toMatch(/^Quiet week for H-1B and EB green cards\. \d+ other update/);
    expect(out.html).toContain("Quiet week for H-1B and EB green cards");
  });

  it("leads with H-1B when H-1B recorded something", () => {
    if (issue.counts.shown === 0) return;
    const out = renderIssue(h1bNews, BASE, CONTACT);
    expect(out.subject).toMatch(/^H-1B: news this week/);
    expect(out.subject).not.toMatch(/No H-1B/);
  });

  for (const locale of LOCALES) {
    it(`${locale}: stays short enough for a phone and still carries the story count`, () => {
      const i = selectIssue({ segment: seg({ id: `weekly-${locale}`, locale }), ...wide });
      const out = renderIssue(i, BASE, CONTACT);
      expect(out.subject.length).toBeLessThanOrEqual(60);
      if (i.counts.shown > 0) {
        const nums = [...out.subject.matchAll(/\d+/g)].map((m) => Number(m[0]));
        expect(nums).toContain(i.counts.shown);
      }
    });

    it(`${locale}: has a core-topic name for every CORE_WATCH key`, () => {
      for (const k of CORE_WATCH) expect(stringsFor(locale).core[k]).toBeTruthy();
    });
  }

  it("names the top story in the preview line, not the subject again", () => {
    const out = renderIssue(issue, BASE, CONTACT);
    if (issue.items.length === 0) return;
    const pre = /<div style="display:none[^>]*>([^&<]*)/.exec(out.html)![1];
    expect(pre).toMatch(/^Top story: /);
    expect(pre).not.toContain(out.subject);
  });
});

describe("status board", () => {
  it("shows every watched topic, quiet or not, before the first story", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    const out = renderIssue(issue, BASE, CONTACT);
    const t = stringsFor("en");
    const firstStory = out.html.indexOf(t.sections.topChanges);
    for (const w of WATCHLIST) {
      const at = out.html.indexOf(t.unchanged.topics[w.key]);
      expect(at, `board missing ${w.key}`).toBeGreaterThan(-1);
      expect(at).toBeLessThan(firstStory);
    }
  });

  it("agrees with the silence check, topic by topic", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    const quiet = new Set(issue.unchanged.map((w) => w.key));
    for (const w of issue.watch!) expect(w.changed).toBe(!quiet.has(w.key));
  });
});

describe("one primary action per issue", () => {
  for (const locale of LOCALES) {
    it(`${locale}: at most one story gets a filled button`, () => {
      const issue = selectIssue({ segment: seg({ id: `weekly-${locale}`, locale }), ...wide });
      const out = renderIssue(issue, BASE, CONTACT);
      if (issue.items.length === 0) return;
      const filled = out.html.match(/<td bgcolor="#0369a1"/g) ?? [];
      expect(filled.length).toBeLessThanOrEqual(1);
      // Every source link still renders, unaltered.
      for (const it of issue.items) expect(out.html).toContain(it.sourceUrl);
    });

    it(`${locale}: links the free Visa Bulletin alerts, tagged`, () => {
      const issue = selectIssue({ segment: seg({ id: `weekly-${locale}`, locale }), ...wide });
      const out = renderIssue(issue, BASE, CONTACT);
      expect(out.html).toMatch(/href="https:\/\/immigrationclock\.com\/visa-bulletin-alerts\?utm_source=newsletter/);
      expect(out.html).toContain(stringsFor(locale).cta.button);
    });

    it(`${locale}: still validates and passes preflight`, () => {
      const issue = selectIssue({ segment: seg({ id: `weekly-${locale}`, locale }), ...wide });
      const out = renderIssue(issue, BASE, CONTACT);
      const { errors } = mergeResults(validateIssue(issue), validateRendered(issue, out, BASE));
      expect(errors).toEqual([]);
      expect(preflight(out, locale).safeToSend).toBe(true);
    });
  }
});

describe("H-1B, EB green card and Visa Bulletin stories lead", () => {
  it("puts every core story ahead of every other story", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    const firstOther = issue.items.findIndex((i) => !i.core);
    if (firstOther === -1) return;
    for (const it of issue.items.slice(firstOther)) expect(it.core).toBe(false);
  });

  it("renders core stories as cards and the rest as one-liners without excerpts", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    const out = renderIssue(issue, BASE, CONTACT);
    const t = stringsFor("en");
    const others = issue.items.filter((i) => !i.core);
    if (others.length === 0) return;
    const othersAt = out.html.indexOf(t.sections.others);
    expect(othersAt).toBeGreaterThan(-1);
    const tail = out.html.slice(othersAt);
    expect(tail).not.toContain(t.item.fromDocument);
    for (const it of others) expect(tail).toContain(it.sourceUrl);
  });

  it("names who this week's real documents are about, from their own text", async () => {
    const { audienceFor } = await import("@/lib/newsletter/audience");
    expect(audienceFor("Policy alert: Special Immigrant Juvenile Adjustment of Status", "")).toBe("sij");
    expect(
      audienceFor(
        "Board of Immigration Appeals precedent: 30 I&N Dec. 259 (BIA 2026)",
        "It is improper to grant lawful permanent residence conditioned upon the future submission of a Form I-693."
      )
    ).toBe("medicalExam");
    expect(audienceFor("Board of Immigration Appeals precedent: 30 I&N Dec. 249 (BIA 2026)", "Immigration Judges and the Board")).toBe(
      "immigrationCourt"
    );
    expect(audienceFor("Employee or Independent Contractor Status Under the Fair Labor Standards Act", "")).toBe("labor");
    expect(audienceFor("Notice of a meeting", "Routine notice.")).toBeUndefined();
  });

  it("has an audience label in every language for every rule", async () => {
    const { AUDIENCE_RULES } = await import("@/lib/newsletter/audience");
    for (const l of LOCALES) for (const r of AUDIENCE_RULES) expect(stringsFor(l).audience[r.key], `${l} ${r.key}`).toBeTruthy();
  });
});

describe("the alerts block promises nothing that is switched off", () => {
  for (const locale of LOCALES) {
    it(`${locale}: no delivery schedule in the sign-up copy`, () => {
      const c = stringsFor(locale).cta;
      const copy = `${c.title} ${c.body} ${c.button}`;
      expect(copy).not.toMatch(/each time|every month|monthly|chaque|cada vez|mensual|mensuel|كلما|شهري/i);
    });
  }
});
