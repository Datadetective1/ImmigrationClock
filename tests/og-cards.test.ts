// =============================================================================
// OPEN GRAPH CARDS — what a card says, and that it is a real PNG
//
// The status pill is the loudest claim the platform publishes: "IN EFFECT
// SINCE" and "PROPOSED — NOT IN FORCE" are read by people who will never open
// the page. Every case below is a way the card could be technically derived
// from the record and still tell someone something false about what applies.
//
// The rendering tests read the bytes back, because a Response that claims
// image/png is not the same as a PNG a crawler can decode.
// =============================================================================
import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EVENTS } from "@/lib/event-store";
import { EXPLAINERS } from "@/lib/editorial/explainers";
import { buildSignals } from "@/lib/editorial/signals";
import { CLASSIFICATION_LABEL } from "@/lib/event-labels";
import { HEADLINE_MAX_CHARS, OG_SIZE, fitText, headlineFontSize, ogCard } from "@/lib/og/card";
import {
  OG_PAGES,
  OG_PAGE_KEYS,
  agencyShortName,
  changeStatus,
  describeOgSpec,
  ogSpecForChange,
  ogSpecForExplainer,
  ogSpecForPage,
  ogSpecForSignal,
  type ChangeCardInput,
} from "@/lib/og/specs";
import { fallbackCard, serveCard } from "@/lib/og/serve";

const TODAY = "2026-09-02";

const BASE: ChangeCardInput = {
  title: "Policy alert: Something changed",
  summary: "A neutral summary.",
  classification: "final_rule",
  severity: "major",
  sourceKey: "federal_register",
  publishedAt: "2026-08-01",
  effectiveAt: null,
};

// --- status derivation --------------------------------------------------------

describe("the status pill is derived from fields, in the order a reader asks", () => {
  const cases: [name: string, patch: Partial<ChangeCardInput>, status: string, tone: string][] = [
    ["a proposal is not in force", { classification: "proposed_rule" }, "Proposed — not in force", "amber"],
    [
      "a proposal stays a proposal whatever its summary says",
      { classification: "proposed_rule", summary: "This rescinds and restores the prior rule." },
      "Proposed — not in force",
      "amber",
    ],
    ["a court decision", { classification: "court_decision" }, "Court decision", "red"],
    ["a future effective date this year", { effectiveAt: "2026-10-01" }, "Effective Oct 1", "accent"],
    [
      "a future effective date next year names the year",
      { effectiveAt: "2027-01-15" },
      "Effective Jan 15, 2027",
      "accent",
    ],
    ["a past effective date", { effectiveAt: "2026-03-03" }, "In effect since Mar 3, 2026", "green"],
    [
      "a rescission that restores earlier guidance",
      { summary: "This rule rescinds the 2025 guidance and restores the prior policy." },
      "Prior guidance restored",
      "accent",
    ],
    ["a plain rescission", { summary: "Rescission of the 2025 rule." }, "Rescinded", "amber"],
    [
      "a Policy Manual update",
      { classification: "updated_information", sourceKey: "uscis_policy_manual" },
      "Policy Manual update",
      "accent",
    ],
    ["an executive action", { classification: "executive_action" }, "Executive action", "accent"],
    [
      "an announcement",
      { classification: "announcement", sourceKey: "uscis_newsroom" },
      "Agency announcement",
      "muted",
    ],
    ["a data release", { classification: "data_release", sourceKey: "cbp_encounters" }, "Data release", "muted"],
    ["a final rule with no date", { classification: "final_rule" }, CLASSIFICATION_LABEL.final_rule, "accent"],
    ["anything else falls back to its label", { classification: "deadline" }, CLASSIFICATION_LABEL.deadline, "muted"],
  ];

  for (const [name, patch, status, tone] of cases) {
    it(name, () => {
      expect(changeStatus({ ...BASE, ...patch }, TODAY)).toEqual({ status, tone });
    });
  }

  it("lets an effective date outrank a rescission sentence", () => {
    // The date is the stronger fact: a rescission that is in effect is in effect.
    expect(changeStatus({ ...BASE, summary: "Rescission of X.", effectiveAt: "2026-03-03" }, TODAY).status).toBe(
      "In effect since Mar 3, 2026"
    );
  });

  it("treats today as not yet in the future", () => {
    expect(changeStatus({ ...BASE, effectiveAt: TODAY }, TODAY).status).toBe("In effect since Sep 2, 2026");
  });
});

// --- the change spec ----------------------------------------------------------

describe("the change spec", () => {
  it("strips the Policy alert prefix and keeps the rest", () => {
    expect(ogSpecForChange(BASE, TODAY).headline).toBe("Something changed");
    expect(ogSpecForChange({ ...BASE, title: "No prefix here" }, TODAY).headline).toBe("No prefix here");
  });

  it("names the issuing agency, then the source's agency, then the Federal Register", () => {
    expect(agencyShortName("federal_register", "agency:dos")).toBe("Department of State");
    expect(agencyShortName("federal_register", "agency:doj")).toBe("Department of Justice");
    expect(agencyShortName("federal_register", "agency:dhs")).toBe("DHS");
    expect(agencyShortName("uscis_newsroom")).toBe("USCIS");
    expect(agencyShortName("uscis_policy_manual")).toBe("USCIS");
    expect(agencyShortName("federal_courts")).toBe("Federal courts");
    expect(agencyShortName("dol_oflc")).toBe("Department of Labor");
    expect(agencyShortName("cbp_encounters")).toBe("CBP");
    expect(agencyShortName("ice_stats")).toBe("ICE");
    expect(agencyShortName("federal_register")).toBe("Federal Register");
    expect(agencyShortName("nonexistent_source")).toBe("Federal Register");
  });

  it("words a document on public inspection as scheduled, never published", () => {
    expect(ogSpecForChange({ ...BASE, publishedAt: "2026-09-10" }, TODAY).kicker).toMatch(
      /Scheduled for publication on Sep 10, 2026/
    );
    expect(ogSpecForChange(BASE, TODAY).kicker).toMatch(/Published Aug 1, 2026/);
    expect(ogSpecForChange(BASE, TODAY).kicker).not.toMatch(/Scheduled/);
  });

  it("names the source registry entry, never the key", () => {
    expect(ogSpecForChange(BASE, TODAY).source).toBe("Federal Register");
    expect(ogSpecForChange({ ...BASE, sourceKey: "uscis_policy_manual" }, TODAY).source).toBe("USCIS Policy Manual");
  });

  it("produces a bounded, non-empty, fully specified card for every recorded change", () => {
    for (const e of EVENTS) {
      const s = ogSpecForChange(e, TODAY);
      expect(s.headline.length, e.id).toBeGreaterThan(0);
      expect(s.headline.length, e.id).toBeLessThanOrEqual(160);
      expect(s.eyebrow, e.id).toBeTruthy();
      expect(s.status, e.id).toBeTruthy();
      expect(s.source, e.id).toBeTruthy();
      expect(s.statusTone, e.id).toBeTruthy();
    }
  });
});

// --- text fitting -------------------------------------------------------------

describe("text fitting", () => {
  it("leaves short text alone and collapses whitespace", () => {
    expect(fitText("  a   b  ", 10)).toBe("a b");
  });

  it("cuts at a word boundary, drops a stranded function word, and marks the cut", () => {
    const long =
      "Notice of Entry of Limited Appearance for Document Assistance Before the Board of Immigration Appeals";
    const fitted = fitText(long, 40);
    expect(fitted.length).toBeLessThanOrEqual(40);
    expect(fitted.endsWith("…")).toBe(true);
    expect(fitted).not.toMatch(/\b(of|the|for|and)…$/);
    expect(fitText("x".repeat(200), HEADLINE_MAX_CHARS).length).toBeLessThanOrEqual(HEADLINE_MAX_CHARS);
  });

  it("steps the headline size down by length", () => {
    expect(headlineFontSize("a".repeat(60))).toBe(64);
    expect(headlineFontSize("a".repeat(61))).toBe(54);
    expect(headlineFontSize("a".repeat(110))).toBe(54);
    expect(headlineFontSize("a".repeat(111))).toBe(46);
  });
});

// --- the other specs ----------------------------------------------------------

describe("explainer, signal and hub-page specs", () => {
  it("an explainer leads with its title and kicker", () => {
    const s = ogSpecForExplainer(EXPLAINERS[0]);
    expect(s.eyebrow).toBe("Explainer");
    expect(s.headline).toBe(EXPLAINERS[0].title);
    expect(s.kicker).toBe(EXPLAINERS[0].kicker);
    expect(s.source).toBe(EXPLAINERS[0].sources[0].name);
    expect(s.figure).toBeUndefined();
  });

  it("a signal leads with its figure and labels its provenance", () => {
    const signals = buildSignals(TODAY);
    expect(signals.length).toBeGreaterThan(0);
    for (const sig of signals) {
      const s = ogSpecForSignal(sig);
      expect(s.eyebrow).toBe("Data signal");
      expect(s.figure).toBe(sig.figure);
      expect(s.figureLabel).toBe(sig.figureLabel);
      expect(s.kicker).toBe(sig.title);
      expect(s.source).toBe(sig.sourceName);
      expect(s.status).toContain(sig.periodLabel);
      expect(s.statusTone).toBe(sig.provenance === "reported" ? "green" : "accent");
    }
  });

  it("every hub key names a real page that references its own card", () => {
    for (const key of OG_PAGE_KEYS) {
      const page = OG_PAGES[key];
      expect(page.path.startsWith("/"), key).toBe(true);
      const file = join(process.cwd(), "src", "app", page.path.slice(1), "page.tsx");
      expect(existsSync(file), `${key}: ${file}`).toBe(true);
      expect(readFileSync(file, "utf8"), `${key} does not pass its card to buildMetadata`).toContain(
        `ogImagePath("page", "${key}")`
      );
      const spec = ogSpecForPage(key);
      expect(spec?.eyebrow, key).toBeTruthy();
      expect(spec?.headline, key).toBeTruthy();
      if (spec?.figure) expect(spec.figureLabel, `${key} has a figure with no label`).toBeTruthy();
    }
    expect(ogSpecForPage("not-a-page")).toBeNull();
  });

  it("reads hub figures from the data, not from prose", () => {
    expect(ogSpecForPage("h1b-employers")?.figure).toMatch(/^[\d,]+$/);
    expect(ogSpecForPage("layoffs")?.figure).toMatch(/^[\d,]+$/);
    expect(ogSpecForPage("what-changed")?.figure).toBe(EVENTS.length.toLocaleString("en-US"));
  });

  it("describes a spec on one line for a build log", () => {
    const line = describeOgSpec(ogSpecForChange(BASE, TODAY));
    expect(line).toBe("Federal Register | Something changed [Final rule]");
    expect(line).not.toContain("\n");
    expect(describeOgSpec({ eyebrow: "Data signal", headline: "T", figure: "42" })).toBe("Data signal | 42 — T");
  });
});

// --- rendering ----------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function bytes(res: Response): Promise<Buffer> {
  return Buffer.from(await res.arrayBuffer());
}

function expectPng(buf: Buffer) {
  expect(buf.subarray(0, 8).equals(PNG_SIGNATURE), "PNG signature").toBe(true);
  expect(buf.toString("ascii", 12, 16)).toBe("IHDR");
  expect(buf.readUInt32BE(16)).toBe(OG_SIZE.width);
  expect(buf.readUInt32BE(20)).toBe(OG_SIZE.height);
}

describe("rendering", () => {
  const longest = [...EVENTS].sort((a, b) => b.title.length - a.title.length)[0];

  const cases: [name: string, build: () => ReturnType<typeof ogSpecForChange>][] = [
    ["a change", () => ogSpecForChange(EVENTS[0], TODAY)],
    ["the longest title in the archive", () => ogSpecForChange(longest, TODAY)],
    ["an explainer", () => ogSpecForExplainer(EXPLAINERS[0])],
    ["a data signal", () => ogSpecForSignal(buildSignals(TODAY)[0])],
    ["a hub page", () => ogSpecForPage("h1b-employers")!],
  ];

  for (const [name, build] of cases) {
    it(
      `renders ${name} as a 1200×630 PNG`,
      async () => {
        const res = ogCard(build());
        expect(res.headers.get("content-type")).toBe("image/png");
        expectPng(await bytes(res));
      },
      60_000
    );
  }
});

describe("serving never hands a crawler a 500", () => {
  it(
    "passes a rendered card through, buffered, with the PNG headers",
    async () => {
      const res = await serveCard("page/layoffs", ogSpecForPage("layoffs")!);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expectPng(await bytes(res));
    },
    60_000
  );

  it("serves the brand card when the renderer throws, and says which record", async () => {
    const logged: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((m: unknown) => {
      logged.push(String(m));
    });
    const res = await serveCard("change/abc123", ogSpecForPage("layoffs")!, () => {
      throw new Error("satori exploded");
    });
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const buf = await bytes(res);
    expectPng(buf);
    expect(buf.equals(readFileSync(join(process.cwd(), "public", "brand", "og-image.png")))).toBe(true);
    expect(logged.join("\n")).toContain("change/abc123");
    expect(logged.join("\n")).toContain("satori exploded");
  });

  it("serves the brand card when the stream fails after the constructor returned", async () => {
    // ImageResponse renders lazily: the constructor succeeds and the error
    // arrives on the body. That is the case a naive try/catch misses.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await serveCard(
      "explainer/x",
      ogSpecForPage("layoffs")!,
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("wasm failed"));
            },
          }),
          { headers: { "content-type": "image/png" } }
        )
    );
    spy.mockRestore();
    expect(res.status).toBe(200);
    expectPng(await bytes(res));
  });

  it("the fallback is the brand card itself", async () => {
    const res = fallbackCard();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expectPng(await bytes(res));
  });
});
