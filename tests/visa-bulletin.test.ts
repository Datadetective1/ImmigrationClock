// =============================================================================
// VISA BULLETIN DATA AND HELPERS
//
// Shape and date checks on every hand-entered month, the bulletin's own
// "earlier than the listed date" rule, and a few pinned cells read straight
// off the official PDFs so a slipped row or column fails loudly.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  BULLETINS,
  CHARGEABILITY,
  EMPLOYMENT_ROWS,
  FAMILY_ROWS,
  checkDate,
  cutoffFor,
  formatCutoff,
  formatGap,
  getBulletin,
  latestBulletin,
  movement,
  previousBulletin,
  changedCells,
} from "@/lib/visa-bulletin";
import { moveGroups, moveTally } from "@/components/VisaBulletinView";
import sitemap from "@/app/sitemap";
import { SITE } from "@/lib/site";

function realDate(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

describe("every bulletin month", () => {
  it("has a unique YYYY-MM id, newest first", () => {
    const ids = BULLETINS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect([...ids].sort().reverse()).toEqual(ids);
  });

  it("cites the official State Department bulletin over https", () => {
    for (const b of BULLETINS) {
      expect(b.sourceUrl.startsWith("https://travel.state.gov/"), b.id).toBe(true);
      expect(realDate(b.verifiedAt), b.id).toBe(true);
    }
  });

  it("fills every row and country in all four charts with C, U or a real date", () => {
    for (const b of BULLETINS) {
      for (const [section, rows] of [
        ["family", FAMILY_ROWS],
        ["employment", EMPLOYMENT_ROWS],
      ] as const) {
        for (const chart of ["finalAction", "filing"] as const) {
          for (const row of rows) {
            for (const c of CHARGEABILITY) {
              const v = cutoffFor(b, section, chart, row, c);
              const where = `${b.id} ${section} ${chart} ${row} ${c}`;
              expect(v, where).toBeDefined();
              expect(v === "C" || v === "U" || (/^\d{4}-\d{2}-\d{2}$/.test(v!) && realDate(v!)), where).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe("pinned cells from the official PDFs", () => {
  const nov = getBulletin("2026-11")!;
  const oct = getBulletin("2026-10")!;

  it("November 2026 matches the printed tables", () => {
    expect(cutoffFor(nov, "family", "finalAction", "F1", "all")).toBe("2021-01-22");
    expect(cutoffFor(nov, "family", "finalAction", "F2A", "mexico")).toBe("2026-04-22");
    expect(cutoffFor(nov, "family", "finalAction", "F4", "india")).toBe("2006-12-15");
    expect(cutoffFor(nov, "family", "filing", "F2A", "philippines")).toBe("C");
    expect(cutoffFor(nov, "family", "filing", "F4", "mexico")).toBe("2001-04-30");
    expect(cutoffFor(nov, "employment", "finalAction", "EB1", "china")).toBe("2023-08-01");
    expect(cutoffFor(nov, "employment", "finalAction", "EB2", "all")).toBe("2025-04-01");
    expect(cutoffFor(nov, "employment", "finalAction", "EB2", "india")).toBe("2013-11-01");
    expect(cutoffFor(nov, "employment", "finalAction", "EB3", "philippines")).toBe("2023-08-15");
    expect(cutoffFor(nov, "employment", "finalAction", "EW", "philippines")).toBe("2022-01-01");
    expect(cutoffFor(nov, "employment", "finalAction", "EB5U", "china")).toBe("2016-12-01");
    expect(cutoffFor(nov, "employment", "filing", "EB2", "all")).toBe("2026-03-15");
    expect(cutoffFor(nov, "employment", "filing", "EB5U", "india")).toBe("2024-05-01");
  });

  it("October 2026 matches the printed tables", () => {
    expect(cutoffFor(oct, "family", "finalAction", "F1", "mexico")).toBe("2008-09-08");
    expect(cutoffFor(oct, "family", "finalAction", "F3", "mexico")).toBe("2001-07-01");
    expect(cutoffFor(oct, "employment", "finalAction", "EB2", "all")).toBe("2025-01-01");
    expect(cutoffFor(oct, "employment", "finalAction", "EB3", "china")).toBe("2022-01-08");
    expect(cutoffFor(oct, "employment", "filing", "EW", "all")).toBe("2022-06-01");
  });
});

describe("helpers", () => {
  it("orders months and finds the one before", () => {
    expect(latestBulletin()?.id).toBe(BULLETINS[0].id);
    expect(previousBulletin(getBulletin("2026-11")!)?.id).toBe("2026-10");
    expect(previousBulletin(getBulletin("2026-10")!)).toBeNull();
  });

  it("formats dates and statuses for a reader", () => {
    expect(formatCutoff("2025-04-01")).toBe("Apr 1, 2025");
    expect(formatCutoff("C")).toBe("Current");
    expect(formatCutoff("U")).toBe("Unavailable");
    expect(formatGap({ months: 15, days: 0 })).toBe("1 yr 3 mo");
    expect(formatGap({ months: 0, days: 14 })).toBe("14 d");
  });

  it("measures movement in calendar months and days", () => {
    expect(movement("2025-01-01", "2025-04-01")).toEqual({ kind: "ahead", gap: "3 mo" });
    expect(movement("2020-01-22", "2021-01-22")).toEqual({ kind: "ahead", gap: "1 yr" });
    expect(movement("2008-09-08", "2008-09-22")).toEqual({ kind: "ahead", gap: "14 d" });
    expect(movement("2025-04-01", "2025-01-01")).toEqual({ kind: "back", gap: "3 mo" });
    expect(movement("C", "C")).toEqual({ kind: "same" });
    expect(movement("2025-01-01", "C")).toEqual({ kind: "now-current" });
    expect(movement("C", "2025-01-01")).toEqual({ kind: "now-dated" });
    expect(movement(undefined, "C")).toEqual({ kind: "unknown" });
  });

  it("applies the bulletin's rule: reached only when EARLIER than the listed date", () => {
    expect(checkDate("2025-03-31", "2025-04-01").kind).toBe("before-cutoff");
    expect(checkDate("2025-04-01", "2025-04-01").kind).toBe("after-cutoff");
    const later = checkDate("2025-06-15", "2025-04-01");
    expect(later).toEqual({ kind: "after-cutoff", cutoff: "Apr 1, 2025", gap: "2 mo 14 d" });
    expect(checkDate("1999-01-01", "C").kind).toBe("current");
    expect(checkDate("1999-01-01", "U").kind).toBe("unavailable");
  });

  it("finds what moved in November and nothing that went backward", () => {
    const nov = getBulletin("2026-11")!;
    const emp = changedCells(nov, "employment");
    expect(emp.some((c) => c.row === "EB2" && c.country === "all")).toBe(true);
    const tally = moveTally(nov)!;
    expect(tally.back).toBe(0);
    expect(tally.ahead + tally.same).toBe(5 * (FAMILY_ROWS.length + EMPLOYMENT_ROWS.length));
    // EB-2 moved by the same amount to the same date for three countries: one card.
    const eb2 = moveGroups(nov).filter((g) => g.row === "EB2");
    expect(eb2).toHaveLength(1);
    expect(eb2[0].countries).toEqual(["all", "mexico", "philippines"]);
  });
});

describe("the sitemap", () => {
  const paths = new Set(sitemap().map((e) => e.url.replace(SITE.url, "")));
  it("lists the evergreen page and every older month, not the newest month twice", () => {
    expect(paths.has("/visa-bulletin")).toBe(true);
    expect(paths.has(`/visa-bulletin/${BULLETINS[0].id}`)).toBe(false);
    for (const b of BULLETINS.slice(1)) expect(paths.has(`/visa-bulletin/${b.id}`)).toBe(true);
  });
});
