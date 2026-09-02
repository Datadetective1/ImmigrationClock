// =============================================================================
// WINDOWS AND THE CLOCK
//
// The first design gated on an exact local hour and lost most of a fortnight
// to late crons. These tests pin the second design: three windows that cover
// the whole publishing day, a cron that fires every hour that can fall inside
// one in either US offset, and a gate that reads the real Chicago clock.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SLOTS,
  SLOT_BY_ID,
  currentSlot,
  chicagoParts,
  utcHoursFor,
  allPublishingUtcHours,
  inPublishingWindow,
  instantInWindow,
  slotCoversHour,
} from "@/lib/social/slots";

describe("window definitions", () => {
  it("has three windows that cover 08:00–20:59 local without overlap", () => {
    expect(SLOTS.map((s) => s.id)).toEqual(["morning", "afternoon", "evening"]);
    expect(SLOTS.map((s) => s.hours)).toEqual([
      [8, 12],
      [13, 16],
      [17, 20],
    ]);
    for (let h = 8; h <= 20; h++) {
      expect(SLOTS.filter((s) => slotCoversHour(s, h))).toHaveLength(1);
    }
    for (const h of [0, 7, 21, 23]) {
      expect(SLOTS.some((s) => slotCoversHour(s, h))).toBe(false);
    }
  });

  it("keeps `hour` equal to the window's opening hour, for the older callers", () => {
    for (const s of SLOTS) expect(s.hour).toBe(s.hours[0]);
  });
});

describe("currentSlot", () => {
  it("is open anywhere inside a window, not only at its first hour", () => {
    // 12:41 CDT — the hour a delayed morning cron actually arrived on 08-29.
    expect(currentSlot(new Date("2026-08-29T17:41:00Z"))?.id).toBe("morning");
    // 13:22 CDT — another late arrival that the old gate discarded.
    expect(currentSlot(new Date("2026-08-29T18:22:00Z"))?.id).toBe("afternoon");
    // 20:12 CDT — evening.
    expect(currentSlot(new Date("2026-08-30T01:12:00Z"))?.id).toBe("evening");
  });

  it("is shut before eight and after nine in the evening", () => {
    expect(currentSlot(new Date("2026-07-15T12:30:00Z"))).toBeNull(); // 07:30 CDT
    expect(currentSlot(new Date("2026-07-16T02:10:00Z"))).toBeNull(); // 21:10 CDT
  });

  it("reads the real Chicago clock in both offsets and on both transition days", () => {
    expect(currentSlot(new Date("2026-01-15T15:00:00Z"))?.id).toBe("morning"); // 09:00 CST
    expect(currentSlot(new Date("2026-07-15T14:00:00Z"))?.id).toBe("morning"); // 09:00 CDT
    expect(currentSlot(new Date("2026-03-08T14:00:00Z"))?.id).toBe("morning"); // DST begins
    expect(currentSlot(new Date("2026-11-01T15:00:00Z"))?.id).toBe("morning"); // DST ends
    expect(currentSlot(new Date("2026-11-01T14:00:00Z"))?.id).toBe("morning"); // 08:00 CST — still morning
  });

  it("covers exactly thirteen of the twenty-four hours on any given day", () => {
    for (const day of ["2026-01-15", "2026-07-15"]) {
      const open = Array.from({ length: 24 }, (_, h) =>
        currentSlot(new Date(`${day}T${String(h).padStart(2, "0")}:30:00Z`))
      ).filter(Boolean);
      expect(open).toHaveLength(13);
    }
  });

  it("agrees with inPublishingWindow", () => {
    expect(inPublishingWindow(new Date("2026-07-15T14:00:00Z"))).toBe(true);
    expect(inPublishingWindow(new Date("2026-07-15T12:00:00Z"))).toBe(false);
  });
});

describe("chicagoParts", () => {
  it("reports the local date, not the UTC date", () => {
    expect(chicagoParts(new Date("2026-08-05T03:00:00Z")).date).toBe("2026-08-04");
  });
});

describe("instantInWindow", () => {
  it("lands inside the requested window on the requested local date, in either offset", () => {
    for (const date of ["2026-01-15", "2026-07-15", "2026-03-08", "2026-11-01"]) {
      for (const slot of SLOTS) {
        const at = instantInWindow(date, slot);
        const p = chicagoParts(at);
        expect(p.date).toBe(date);
        expect(slotCoversHour(slot, p.hour)).toBe(true);
      }
    }
  });
});

// -----------------------------------------------------------------------------
// THE WORKFLOW'S CRONS MUST COVER EVERY WINDOW HOUR IN BOTH OFFSETS
// -----------------------------------------------------------------------------

describe("the workflow crons cover every window hour", () => {
  const workflow = readFileSync(resolve(".github/workflows/social.yml"), "utf8");

  /** Expand "7 13-23 * * *" and "7 0-2 * * *" into the hours they name. */
  function cronHours(): { hours: Set<number>; minutes: number[]; lines: number } {
    const hours = new Set<number>();
    const minutes: number[] = [];
    let lines = 0;
    for (const m of workflow.matchAll(/^\s*- cron:\s*"(\d+)\s+([0-9,\-]+)\s+\*\s+\*\s+\*"/gm)) {
      lines++;
      minutes.push(Number(m[1]));
      for (const part of m[2].split(",")) {
        const range = part.split("-").map(Number);
        if (range.length === 2) for (let h = range[0]; h <= range[1]; h++) hours.add(h);
        else hours.add(range[0]);
      }
    }
    return { hours, minutes, lines };
  }

  it("is armed with exactly two cron lines", () => {
    expect(cronHours().lines).toBe(2);
    expect(workflow).toMatch(/^  schedule:$/m);
  });

  it("fires at every UTC hour a window can be open, in CST or CDT", () => {
    const { hours } = cronHours();
    for (const h of allPublishingUtcHours()) {
      expect(hours.has(h), `no cron at ${h}:07 UTC`).toBe(true);
    }
  });

  it("fires at no hour that maps to no window in either offset", () => {
    const valid = new Set(allPublishingUtcHours());
    for (const h of cronHours().hours) {
      expect(valid.has(h), `${h}:07 UTC matches no window`).toBe(true);
    }
  });

  it("fires off the top of the hour", () => {
    const { minutes } = cronHours();
    expect(minutes.length).toBeGreaterThan(0);
    for (const m of minutes) expect(m).toBeGreaterThan(0);
    expect(new Set(minutes).size).toBe(1);
  });

  it("gates before installing dependencies, so no-op firings stay cheap", () => {
    const gate = workflow.indexOf("Is a window open, and unfilled?");
    const install = workflow.indexOf("name: Install dependencies");
    expect(gate).toBeGreaterThan(0);
    expect(install).toBeGreaterThan(gate);
    expect(workflow).toContain("scripts/social-gate.ts");
  });

  it("persists both the ledger and the queue, even after a failed step", () => {
    expect(workflow).toMatch(/Persist the post ledger and the editorial queue[\s\S]{0,300}always\(\)/);
    expect(workflow).toContain("src/lib/generated/social-posted.json");
    expect(workflow).toContain("src/lib/generated/social-queue.json");
  });

  it("does not let a failed publish report success", () => {
    const step = workflow.slice(workflow.indexOf("name: Publish this window"));
    const body = step.slice(0, step.indexOf("- name:", 10));
    expect(body).toContain("set -o pipefail");
  });

  it("tells an operator how to stop it", () => {
    expect(workflow).toMatch(/TO STOP EVERYTHING/);
    expect(workflow).toMatch(/SOCIAL_POST_ENABLED to anything other/);
  });
});

describe("utcHoursFor", () => {
  it("returns both offsets for every hour of the window", () => {
    // morning 08–12 local: CDT 13–17Z, CST 14–18Z → 13..18
    expect(utcHoursFor(SLOT_BY_ID.get("morning")!)).toEqual([13, 14, 15, 16, 17, 18]);
    // evening 17–20 local: CDT 22,23,0,1 ; CST 23,0,1,2
    expect(utcHoursFor(SLOT_BY_ID.get("evening")!)).toEqual([0, 1, 2, 22, 23]);
  });
});
