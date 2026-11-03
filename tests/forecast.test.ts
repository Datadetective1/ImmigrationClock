import { describe, expect, it } from "vitest";
import {
  addMonths,
  forecast,
  forecastFromSeries,
  monthsBetween,
  paceOver,
  teaser,
  type Forecast,
} from "@/lib/visa-bulletin/forecast";
import { describePace, formatMonth } from "@/lib/visa-bulletin/forecast-format";
import { parseForecastQuery } from "@/lib/visa-bulletin/forecast-query";
import { HISTORY_MONTHS, historySeries, type HistoryPoint } from "@/lib/visa-bulletin/history";
import { BULLETINS, CHARGEABILITY, EMPLOYMENT_ROWS, FAMILY_ROWS } from "@/lib/visa-bulletin";
import { parseCell, parseMonthFile } from "../scripts/build-bulletin-history";

/** A line that moves `perMonth` days every month for `months` months, ending 2026-11. */
function steady(perMonth: number, months: number, endCutoff = "2020-01-01"): HistoryPoint[] {
  const end = Date.parse(`${endCutoff}T00:00:00Z`);
  return Array.from({ length: months + 1 }, (_, i) => {
    const back = months - i;
    const cutoff = new Date(end - back * perMonth * 864e5).toISOString().slice(0, 10);
    return { month: addMonths("2026-11", -back), cutoff: cutoff as HistoryPoint["cutoff"] };
  });
}

describe("forecast math", () => {
  it("counts months across years", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthsBetween("2023-11", "2026-11")).toBe(36);
  });

  it("measures a steady pace in every window", () => {
    const s = steady(30, 40);
    for (const w of [12, 24, 36]) {
      const p = paceOver(s, w)!;
      expect(p.window).toBe(w);
      expect(p.daysPerMonth).toBeCloseTo(30, 5);
    }
  });

  it("refuses a window the history does not reach", () => {
    expect(paceOver(steady(30, 20), 36)).toBeNull();
    expect(paceOver(steady(30, 20), 12)).not.toBeNull();
  });

  it("says reached when the date is earlier than the cut-off", () => {
    const f = forecastFromSeries(steady(30, 40), "2019-06-01");
    expect(f.kind).toBe("reached");
    expect(teaser(f)).toMatch(/already reached/);
  });

  it("treats a date on the cut-off as not yet reached", () => {
    const f = forecastFromSeries(steady(30, 40), "2020-01-01");
    expect(f.kind).toBe("estimate");
  });

  it("puts a steady line's estimate where the arithmetic says", () => {
    // One year of dates at 30 days a month is about 12 months away.
    const f = forecastFromSeries(steady(30, 40), "2021-01-01") as Extract<Forecast, { kind: "estimate" }>;
    expect(f.kind).toBe("estimate");
    expect(f.likely).toBe(addMonths("2026-11", Math.ceil(367 / 30)));
    expect(f.earliest).toBe(f.likely);
    expect(f.latest).toBe(f.likely);
    expect(teaser(f)).toBe("Around 2027.");
  });

  it("gives a range when the pace changed, and an open end when a window went backwards", () => {
    // Slow for two years, then fast for one.
    const slow = steady(5, 24, "2018-01-01").slice(0, -1);
    const fast = steady(60, 12, "2020-01-01").map((p) => p);
    const ranged = forecastFromSeries([...slow.map((p) => ({ ...p, month: addMonths(p.month, -12) })), ...fast], "2022-01-01");
    expect(ranged.kind).toBe("estimate");
    if (ranged.kind === "estimate") expect(ranged.earliest < ranged.likely || ranged.likely < (ranged.latest ?? "9999")).toBe(true);

    const back: HistoryPoint[] = [
      { month: "2023-11", cutoff: "2020-01-01" },
      { month: "2024-11", cutoff: "2021-06-01" },
      { month: "2025-11", cutoff: "2019-01-01" },
      { month: "2026-11", cutoff: "2019-06-01" },
    ];
    const f = forecastFromSeries(back, "2020-06-01");
    expect(f.kind).toBe("estimate");
    if (f.kind === "estimate") expect(f.latest).toBeNull();
    expect(teaser(f)).toMatch(/at the earliest/);
  });

  it("says stalled when the line has not moved forward", () => {
    const flat = steady(0, 40);
    expect(forecastFromSeries(flat, "2021-01-01").kind).toBe("stalled");
  });

  it("handles current and unavailable lines", () => {
    expect(forecastFromSeries([{ month: "2026-11", cutoff: "C" }], "2026-01-01").kind).toBe("reached");
    expect(forecastFromSeries([{ month: "2026-11", cutoff: "U" }], "2026-01-01").kind).toBe("unavailable");
    expect(forecastFromSeries([], "2026-01-01").kind).toBe("no-data");
  });

  it("caps very long estimates", () => {
    const f = forecastFromSeries(steady(1, 40), "2060-01-01");
    expect(teaser(f)).toBe("More than 20 years at the recent pace.");
  });

  it("formats for people", () => {
    expect(formatMonth("2029-03")).toBe("March 2029");
    expect(describePace({ window: 12, spanMonths: 12, daysPerMonth: 30, from: { month: "a", cutoff: "b" }, to: { month: "c", cutoff: "d" } })).toMatch(/month/);
  });
});

describe("forecast query", () => {
  const q = (o: Record<string, string>) => parseForecastQuery(new URLSearchParams(o));
  it("accepts a complete, known choice", () => {
    expect(q({ section: "employment", row: "EB2", country: "india", date: "2015-03-01" }).ok).toBe(true);
  });
  it("refuses anything else", () => {
    expect(q({ section: "employment", row: "F2A", country: "india", date: "2015-03-01" }).ok).toBe(false);
    expect(q({ section: "family", row: "F2A", country: "france", date: "2015-03-01" }).ok).toBe(false);
    expect(q({ section: "family", row: "F2A", country: "all", date: "15-03-01" }).ok).toBe(false);
    expect(q({ section: "family", row: "F2A", country: "all", date: "1900-01-01" }).ok).toBe(false);
  });
});

describe("bulletin history", () => {
  it("reads bulletin cells", () => {
    expect(parseCell("08NOV16")).toBe("2016-11-08");
    expect(parseCell("01JAN99")).toBe("1999-01-01");
    expect(parseCell("C")).toBe("C");
    expect(parseCell("??")).toBeNull();
    expect(parseCell("NA")).toBeNull();
    expect(parseCell("8 NOV 16")).toBeUndefined();
  });

  it("refuses a file from anywhere but travel.state.gov", () => {
    const rows = [...FAMILY_ROWS.map((r) => `${r},C,C,C,C,C`)];
    const body = (src: string) =>
      [`source,${src}`, "section,family", ...rows, "section,employment", ...EMPLOYMENT_ROWS.map((r) => `${r},C,C,C,C,C`)].join("\n");
    expect(() => parseMonthFile("2026-01", body("https://example.com/x"))).toThrow(/travel.state.gov/);
    expect(parseMonthFile("2026-01", body("https://travel.state.gov/x")).family.F1.all).toBe("C");
  });

  it("is sorted, unique and ends with the newest hand-checked bulletin", () => {
    const ids = HISTORY_MONTHS.map((m) => m.id);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[ids.length - 1]).toBe(BULLETINS[0].id);
  });

  it("uses the hand-checked bulletin for the newest month", () => {
    const s = historySeries("employment", "EB2", "india");
    expect(s[s.length - 1].cutoff).toBe(BULLETINS[0].employment.finalAction.EB2.india);
  });

  it("gives every category and country an answer of some kind", () => {
    for (const row of EMPLOYMENT_ROWS) for (const c of CHARGEABILITY) expect(forecast("employment", row, c, "2030-01-01").kind).toBeTruthy();
    for (const row of FAMILY_ROWS) for (const c of CHARGEABILITY) expect(forecast("family", row, c, "2030-01-01").kind).toBeTruthy();
  });
});
