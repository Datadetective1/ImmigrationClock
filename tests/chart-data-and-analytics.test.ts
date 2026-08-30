// =============================================================================
// CHART DATA, CHART ACCESSIBILITY, AND THE ANALYTICS QUEUE
//
// WHAT THESE TESTS EXIST FOR
// --------------------------
// 1. THE QUEUE NOBODY DRAINED. Plausible's script replays whatever it finds on
//    `window.plausible.q` when it loads. The loader queued onto a private
//    `window.__plq` instead — a name Plausible knows nothing about and nothing
//    in this codebase ever read. Every event fired before the deferred script
//    arrived went into that array and stayed there. The GA block two functions
//    below carries a comment about exactly this class of mistake ("Must push the
//    `arguments` object … Google requirement"); the same care had not been
//    applied to Plausible's contract.
//
// 2. SEARCH TERMS BECOME TRANSMITTED DATA. The terms readers type are the one
//    free-text field that leaves the browser, and the privacy design explicitly
//    permits them (docs/analytics-event-plan.md — search_no_results is "the
//    roadmap input the Directive explicitly asks for"). Turning a provider on
//    changes them from a no-op into real network traffic, so the sanitizer is
//    pinned here: an SSN or a phone number written with separators slipped past
//    the old \d{6,} rule entirely.
//
// 3. CHART VALUES WERE INVISIBLE. Measured on the served build: eight of ten
//    chart routes exposed 5-21% of their plotted values in rendered markup;
//    /border/encounters showed 5 of 92 datapoints. With JavaScript off the page
//    showed "Loading chart…" permanently, and a screen reader read the chart's
//    axis ticks as one unbroken string.
// =============================================================================

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sanitizeSearchTerm } from "@/lib/analytics";
import { ChartData, type DataColumn } from "@/components/charts/ChartData";

const SRC = join(process.cwd(), "src");
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8");

/** Every chart call site in the app, as [route file, the JSX of that element]. */
function chartCallSites(): { file: string; jsx: string }[] {
  const out: { file: string; jsx: string }[] = [];
  const walk = (dir: string, prefix = "") => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(dir, e.name), rel);
      else if (e.name.endsWith(".tsx")) {
        const src = readFileSync(join(dir, e.name), "utf8");
        if (rel.startsWith("components/charts/")) continue;
        for (const m of src.matchAll(
          /<(TrendLineChart|GroupedBarChart|HorizontalBarChart)\b([\s\S]*?)\/>/g
        )) {
          out.push({ file: rel, jsx: m[0] });
        }
      }
    }
  };
  walk(SRC);
  return out;
}

// --- MEAS-1: the analytics queue --------------------------------------------

describe("events fired before Plausible loads are not thrown away", () => {
  const loader = read("components", "AnalyticsScripts.tsx");

  it("queues onto window.plausible.q, the property Plausible actually drains", () => {
    expect(loader).toMatch(/stub\.q\s*=\s*stub\.q\s*\|\|\s*\[\]/);
  });

  it("no longer uses a private queue name nothing reads", () => {
    // Code only: the comment above the fix names __plq deliberately, so that
    // whoever reads this next knows what the bug was.
    const code = loader
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    expect(code).not.toContain("__plq");
  });

  it("installs the queue before requesting the script, not after", () => {
    // Otherwise there is a window where track() sees no global at all and the
    // event is dropped rather than queued.
    const stubAt = loader.indexOf("w.plausible = w.plausible || stub");
    const appendAt = loader.indexOf("document.head.appendChild(s)");
    expect(stubAt).toBeGreaterThan(-1);
    expect(appendAt).toBeGreaterThan(-1);
    expect(stubAt).toBeLessThan(appendAt);
  });

  it("never clobbers a real Plausible that loaded first", () => {
    expect(loader).toMatch(/w\.plausible\s*=\s*w\.plausible\s*\|\|/);
  });

  it("keeps honouring Do Not Track and Global Privacy Control", () => {
    expect(loader).toMatch(/if \(readerOptedOut\(\)\) return;/);
    expect(loader).toMatch(/globalPrivacyControl/);
  });

  it("fails silently when the script cannot load", () => {
    // Ad blockers and network failures must not surface an error or leave an
    // array growing forever with nothing to drain it.
    expect(loader).toMatch(/s\.onerror\s*=/);
  });
});

describe("the one free-text field that leaves the browser", () => {
  it("keeps the immigration queries people actually type", () => {
    for (const q of [
      "h-1b",
      "i-130 i-485 i-765",
      "fy2024 h-1b approvals",
      "eb-2 india",
      "does amazon sponsor h-1b",
      "visa bulletin march 2026",
    ]) {
      expect(sanitizeSearchTerm(q), q).not.toBeNull();
    }
  });

  it("drops anything shaped like a person", () => {
    for (const q of [
      "me@example.com",
      "a123456789", // A-number
      "123-45-6789", // SSN — separators slipped past the old \d{6,} rule
      "415-555-1234",
      "(415) 555 1234",
      "+1 415 555 1234",
      "call me 415.555.1234",
    ]) {
      expect(sanitizeSearchTerm(q), q).toBeNull();
    }
  });

  it("truncates and normalises what it does keep", () => {
    expect(sanitizeSearchTerm("  Does AMAZON   sponsor H-1B?  ")).toBe("does amazon sponsor h-1b?");
    expect(sanitizeSearchTerm("x".repeat(200))?.length).toBe(60);
    expect(sanitizeSearchTerm("   ")).toBeNull();
  });
});

// --- DATA-1: the numbers under the chart ------------------------------------

const COLS: DataColumn[] = [
  { key: "label", label: "Period" },
  { key: "v", label: "Approvals", numeric: true },
];
const rowsOf = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ label: `FY${20 + i}`, v: 1000 + i }));
const render = (rows: Record<string, number | string>[], caption?: string) =>
  renderToStaticMarkup(createElement(ChartData, { rows, columns: COLS, caption }));

describe("the data disclosure renders the numbers, sized to the data", () => {
  it("puts a small series in a full table", () => {
    const html = render(rowsOf(6));
    expect(html).toContain("<table");
    expect((html.match(/<tr/g) || []).length).toBe(7); // header + 6
    expect(html).toContain("1,005");
  });

  it("labels each row with a header cell so a screen reader can pair value to period", () => {
    const html = render(rowsOf(4));
    expect((html.match(/scope="row"/g) || []).length).toBe(4);
    expect(html).toContain('scope="col"');
  });

  it("caps a medium series in a scroller rather than a page-long table", () => {
    const html = render(rowsOf(50));
    expect(html).toContain("<table");
    expect(html).toContain("max-h-80");
  });

  it("summarises rather than dumping a very large series", () => {
    // The failure mode this component exists to avoid: hundreds of rows pasted
    // into every document.
    const html = render(rowsOf(500));
    expect(html).not.toContain("<table");
    expect(html).toContain("highest");
    expect(html).toContain("lowest");
    // Every figure quoted must come from the rows, not be invented.
    expect(html).toContain("1,499"); // max
    expect(html).toContain("1,000"); // min
  });

  it("states what the figures are before anything is expanded", () => {
    const html = render(rowsOf(6), "Estimated H-1B issuances to India");
    expect(html).toContain("Estimated H-1B issuances to India");
    expect(html).toContain("6 rows");
    expect(html).toContain("FY20 to FY25");
  });

  it("uses a native details element, so it opens without JavaScript", () => {
    const html = render(rowsOf(6));
    expect(html.startsWith("<details")).toBe(true);
    expect(html).toContain("<summary");
  });

  it("renders nothing rather than an empty shell when there is no data", () => {
    expect(render([])).toBe("");
  });

  it("formats currency columns as currency", () => {
    const html = renderToStaticMarkup(
      createElement(ChartData, {
        rows: [{ label: "FY24", v: 185000 }],
        columns: [
          { key: "label", label: "Period" },
          { key: "v", label: "Wage", numeric: true, currency: true },
        ],
      })
    );
    expect(html).toContain("$185,000");
  });
});

describe("every chart carries its numbers, or the page already shows them", () => {
  const sites = chartCallSites();

  it("finds the chart call sites it is meant to be checking", () => {
    expect(sites.length).toBeGreaterThanOrEqual(15);
  });

  it("routes the data through one shared component, not per-route copies", () => {
    // The table is derived inside LazyCharts from the array the chart already
    // plots, so the two can never disagree and no call site passes data twice.
    const lazy = read("components", "charts", "LazyCharts.tsx");
    expect(lazy).toContain("ChartData");
    for (const name of ["TrendLineChart", "GroupedBarChart", "HorizontalBarChart"]) {
      expect(lazy, `${name} must render through WithData`).toMatch(
        new RegExp(`export function ${name}[\\s\\S]{0,400}<WithData`)
      );
    }
  });

  it("suppresses the table only where the page already prints those values", () => {
    // Measured before the change: these two routes were already at 100% visible
    // because a list or a fuller table beside the chart carries the same figures.
    // Every other chart must keep its disclosure.
    const suppressed = sites.filter((s) => /\bhideData\b/.test(s.jsx)).map((s) => s.file).sort();
    expect(suppressed).toEqual([
      "app/h1b/salaries/[jobTitle]/page.tsx",
      "app/layoffs-vs-h1b/page.tsx",
    ]);
  });

  it("gives every disclosed chart a caption naming what the figures are", () => {
    const missing = sites
      .filter((s) => !/\bhideData\b/.test(s.jsx) && !/\bdataCaption\b/.test(s.jsx))
      .map((s) => s.file);
    expect(missing, "these charts would disclose numbers with no explanation").toEqual([]);
  });
});

// --- A11Y-1: the chart itself -----------------------------------------------

describe("the chart is decoration once its numbers are readable", () => {
  it("hides the chart SVG from assistive tech", () => {
    // Left exposed, it announced its axis ticks as one unbroken string. It is
    // only safe to hide because ChartData now provides the text equivalent.
    const charts = read("components", "charts", "Charts.tsx");
    expect((charts.match(/aria-hidden="true"/g) || []).length).toBe(3);
  });

  it("does not promise a chart that will never arrive without JavaScript", () => {
    const lazy = read("components", "charts", "LazyCharts.tsx");
    expect(lazy).toContain("<noscript>");
    expect(lazy).toContain("ic-chart-skeleton");
    expect(lazy).toMatch(/ic-chart-skeleton\{display:none\}/);
  });

  it("still reserves the chart's exact height, so the swap is not a layout shift", () => {
    const lazy = read("components", "charts", "LazyCharts.tsx");
    expect(lazy).toMatch(/style=\{\{\s*width:\s*"100%",\s*height\s*\}\}/);
    expect(lazy).toMatch(/ssr:\s*false/);
  });
});
