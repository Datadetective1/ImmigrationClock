// =============================================================================
// CBP CSV DISCOVERY — the newest file on the landing page, re-upload suffix included
//
// On 2026-09-16 CBP posted the August 2026 release as "...-aug-aor_0.csv". The
// old pattern required "-aor.csv", skipped it, and kept reporting July. The
// fixture below is the order the landing page listed its files that day.
// =============================================================================

import { describe, expect, it } from "vitest";
import { cbpAorCsvPaths, cbpMonthFromPath, latestCbpAorCsv } from "../scripts/cbp-links.mjs";

const files = [
  "2026-09/nationwide-encounters-fy23-fy26-aug-aor_0.csv",
  "2026-09/nationwide-encounters-fy23-fy26-aug-state.csv",
  "2026-08/nationwide-encounters-fy23-fy26-jul-aor.csv",
  "2026-08/nationwide-encounters-fy23-fy26-jul-state.csv",
  "2026-07/nationwide-encounters-fy23-fy26-jun-aor.csv",
  "2022-11/nationwide-encounters-fy20-fy23-aor.csv",
];
const LANDING_2026_09_16 = files
  .map((f) => `<a href="/sites/default/files/${f}" type="text/csv">${f}</a>`)
  .join("\n");

describe("CBP landing-page CSV discovery", () => {
  it("picks the August 2026 release despite CBP's _0 re-upload suffix", () => {
    expect(latestCbpAorCsv(LANDING_2026_09_16)).toEqual({
      path: "/sites/default/files/2026-09/nationwide-encounters-fy23-fy26-aug-aor_0.csv",
      monthAbbr: "AUG",
    });
  });

  it("reads the month from suffixed and plain file names alike", () => {
    expect(cbpMonthFromPath("/x/nationwide-encounters-fy23-fy26-aug-aor_0.csv")).toBe("AUG");
    expect(cbpMonthFromPath("/x/nationwide-encounters-fy23-fy26-sep-aor_12.csv")).toBe("SEP");
    expect(cbpMonthFromPath("/x/nationwide-encounters-fy23-fy26-jul-aor.csv")).toBe("JUL");
    // Full-year archives carry no month.
    expect(cbpMonthFromPath("/x/nationwide-encounters-fy20-fy23-aor.csv")).toBeNull();
  });

  it("keeps page order, skips state files, and lists each file once", () => {
    const paths = cbpAorCsvPaths(LANDING_2026_09_16 + "\n" + LANDING_2026_09_16);
    expect(paths.map((p: string) => cbpMonthFromPath(p))).toEqual(["AUG", "JUL", "JUN", null]);
  });

  it("returns null when the page links no encounter CSV", () => {
    expect(latestCbpAorCsv("<html>maintenance</html>")).toBeNull();
  });

  it("is what both refresh scripts use", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["scripts/refresh-data.mjs", "scripts/backfill-history.mjs"]) {
      const s = readFileSync(f, "utf8");
      expect(s, f).toContain('from "./cbp-links.mjs"');
      expect(s, f).not.toMatch(/-aor\\\.csv/);
    }
  });
});
