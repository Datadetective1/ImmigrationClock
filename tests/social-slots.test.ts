// =============================================================================
// WINDOWS AND THE DST GATE
//
// GitHub Actions cron is always UTC, and GitHub delivers scheduled firings late
// under load — measured against this workflow's own run log, hours late for a
// week. So the publishing day is three WINDOWS of local hours, not three exact
// hours, and the cron fires every UTC hour that can fall inside one in either
// US offset. These tests pin the things that make that safe: the gate opens on
// Chicago LOCAL time across the whole window, the crons cover every hour a
// window can be open, and no cron fires at an hour that maps to nothing.
//
// The two transition days are tested explicitly. They are the only days the
// naive implementation (fixed UTC offset arithmetic) gets wrong, and they are
// exactly the days a reader would notice a post arriving an hour early.
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
  it("has exactly three windows, opening at 08:00, 13:00 and 17:00 local", () => {
    expect(SLOTS.map((s) => s.id)).toEqual(["morning", "afternoon", "evening"]);
    expect(SLOTS.map((s) => s.hours)).toEqual([
      [8, 12],
      [13, 16],
      [17, 20],
    ]);
  });

  it("keeps `hour` as the window's opening hour, for the ledger's older readers", () => {
    for (const slot of SLOTS) expect(slot.hour).toBe(slot.hours[0]);
  });

  it("covers 08:00 through 20:59 local with no gap and no overlap", () => {
    // A gap is an hour where a late firing is discarded; an overlap is an hour
    // where two windows could both claim one firing. Neither is allowed.
    for (let i = 1; i < SLOTS.length; i++) {
      expect(SLOTS[i].hours[0]).toBe(SLOTS[i - 1].hours[1] + 1);
    }
    for (let hour = 8; hour <= 20; hour++) {
      expect(SLOTS.filter((s) => slotCoversHour(s, hour)), `${hour}:00`).toHaveLength(1);
    }
    expect(slotCoversHour(SLOTS[0], 7)).toBe(false);
    expect(slotCoversHour(SLOTS[2], 21)).toBe(false);
  });

  it("gives each window a different nominal pool", () => {
    expect(new Set(SLOTS.map((s) => s.pool)).size).toBe(3);
  });

  it("gives the news pool to the morning window and to no other", () => {
    // The morning is news-only by the cadence policy; its nominal pool says so
    // in the ledger's skip rows.
    const primary = SLOTS.filter((s) => s.pool === "news");
    expect(primary).toHaveLength(1);
    expect(primary[0].id).toBe("morning");
  });

  it("carries no pool-era selection fields — one queue, not three pools", () => {
    for (const slot of SLOTS) {
      expect(slot).not.toHaveProperty("angles");
      expect(slot).not.toHaveProperty("fallbackPools");
    }
  });
});

describe("chicagoParts", () => {
  it("reads CDT (UTC-5) in summer", () => {
    // 2026-07-15 14:00 UTC = 09:00 CDT
    expect(chicagoParts(new Date("2026-07-15T14:00:00Z")).hour).toBe(9);
  });

  it("reads CST (UTC-6) in winter", () => {
    // 2026-01-15 15:00 UTC = 09:00 CST
    expect(chicagoParts(new Date("2026-01-15T15:00:00Z")).hour).toBe(9);
  });

  it("reports the local date, not the UTC date", () => {
    // 03:00 UTC on the 5th is still 22:00 on the 4th in Chicago.
    expect(chicagoParts(new Date("2026-08-05T03:00:00Z")).date).toBe("2026-08-04");
  });
});

describe("currentSlot", () => {
  it("opens the morning window at 09:00 local in summer", () => {
    expect(currentSlot(new Date("2026-07-15T14:00:00Z"))?.id).toBe("morning");
  });

  it("opens the morning window at 09:00 local in winter", () => {
    expect(currentSlot(new Date("2026-01-15T15:00:00Z"))?.id).toBe("morning");
  });

  it("stays open across the WHOLE morning window, so a late firing still counts", () => {
    // The failure the second design answers: 12:41 local was a discarded run.
    // 13:00 UTC is 08:00 CDT and 17:41 UTC is 12:41 CDT — both are the morning.
    for (const iso of ["2026-07-15T13:00:00Z", "2026-07-15T15:00:00Z", "2026-07-15T17:41:00Z"]) {
      expect(currentSlot(new Date(iso))?.id, iso).toBe("morning");
    }
    // Winter: 14:00 UTC is 08:00 CST, 18:59 UTC is 12:59 CST.
    for (const iso of ["2026-01-15T14:00:00Z", "2026-01-15T16:22:00Z", "2026-01-15T18:59:00Z"]) {
      expect(currentSlot(new Date(iso))?.id, iso).toBe("morning");
    }
  });

  it("absorbs the wrong-offset firing instead of discarding it", () => {
    // 15:00 UTC in July is 10:00 CDT — an exact-hour gate dropped it; a window
    // keeps it. 14:00 UTC in January is 08:00 CST, likewise.
    expect(currentSlot(new Date("2026-07-15T15:00:00Z"))?.id).toBe("morning");
    expect(currentSlot(new Date("2026-01-15T14:00:00Z"))?.id).toBe("morning");
  });

  it("stays shut outside every window", () => {
    // 12:00 UTC is 07:00 CDT; 03:00 UTC is 22:00 CDT the previous evening.
    expect(currentSlot(new Date("2026-07-15T12:00:00Z"))).toBeNull();
    expect(currentSlot(new Date("2026-07-16T03:00:00Z"))).toBeNull();
    // 13:00 UTC is 07:00 CST; 04:00 UTC is 22:00 CST.
    expect(currentSlot(new Date("2026-01-15T13:00:00Z"))).toBeNull();
    expect(currentSlot(new Date("2026-01-16T04:00:00Z"))).toBeNull();
  });

  it("tolerates a late cron start within the hour", () => {
    expect(currentSlot(new Date("2026-07-15T14:47:00Z"))?.id).toBe("morning");
  });

  it("opens afternoon and evening across their local hours", () => {
    // CDT: 18:00Z–21:59Z is 13:00–16:59 local; 22:00Z–01:59Z is 17:00–20:59.
    expect(currentSlot(new Date("2026-07-15T18:00:00Z"))?.id).toBe("afternoon");
    expect(currentSlot(new Date("2026-07-15T21:59:00Z"))?.id).toBe("afternoon");
    expect(currentSlot(new Date("2026-07-15T22:00:00Z"))?.id).toBe("evening");
    expect(currentSlot(new Date("2026-07-16T01:59:00Z"))?.id).toBe("evening");
    expect(currentSlot(new Date("2026-07-16T02:00:00Z"))).toBeNull();
    // CST, one hour later in UTC.
    expect(currentSlot(new Date("2026-01-15T19:00:00Z"))?.id).toBe("afternoon");
    expect(currentSlot(new Date("2026-01-15T22:59:00Z"))?.id).toBe("afternoon");
    expect(currentSlot(new Date("2026-01-15T23:00:00Z"))?.id).toBe("evening");
    expect(currentSlot(new Date("2026-01-16T02:59:00Z"))?.id).toBe("evening");
    expect(currentSlot(new Date("2026-01-16T03:00:00Z"))).toBeNull();
  });

  it("handles the spring-forward transition day", () => {
    // 2026-03-08: DST begins at 02:00 local. 14:00 UTC is 09:00 CDT and
    // 15:00 UTC is 10:00 CDT — both inside the morning window. 12:00 UTC is
    // 07:00 CDT, before it opens.
    expect(currentSlot(new Date("2026-03-08T14:00:00Z"))?.id).toBe("morning");
    expect(currentSlot(new Date("2026-03-08T15:00:00Z"))?.id).toBe("morning");
    expect(currentSlot(new Date("2026-03-08T12:00:00Z"))).toBeNull();
    // The evening on the transition day: 22:00 UTC is 17:00 CDT.
    expect(currentSlot(new Date("2026-03-08T22:00:00Z"))?.id).toBe("evening");
  });

  it("handles the fall-back transition day", () => {
    // 2026-11-01: DST ends at 02:00 local. 15:00 UTC is 09:00 CST and 14:00
    // UTC is 08:00 CST — both inside the morning window. 13:00 UTC is 07:00.
    expect(currentSlot(new Date("2026-11-01T15:00:00Z"))?.id).toBe("morning");
    expect(currentSlot(new Date("2026-11-01T14:00:00Z"))?.id).toBe("morning");
    expect(currentSlot(new Date("2026-11-01T13:00:00Z"))).toBeNull();
    // The evening on the transition day: 23:00 UTC is 17:00 CST.
    expect(currentSlot(new Date("2026-11-01T23:00:00Z"))?.id).toBe("evening");
  });

  it("covers exactly thirteen of the twenty-four hours on any given day", () => {
    // 08:00 through 20:59 local, in either offset.
    for (const day of ["2026-01-15", "2026-07-15"]) {
      const open = Array.from({ length: 24 }, (_, h) =>
        currentSlot(new Date(`${day}T${String(h).padStart(2, "0")}:00:00Z`))
      ).filter(Boolean);
      expect(open, day).toHaveLength(13);
    }
  });
});

describe("utcHoursFor", () => {
  it("gives every UTC hour a window can be open in either offset", () => {
    // Morning 08–12: CDT +5 is 13–17, CST +6 is 14–18.
    expect(utcHoursFor(SLOT_BY_ID.get("morning")!)).toEqual([13, 14, 15, 16, 17, 18]);
    // Afternoon 13–16: 18–21 and 19–22.
    expect(utcHoursFor(SLOT_BY_ID.get("afternoon")!)).toEqual([18, 19, 20, 21, 22]);
    // Evening 17–20: 22–01 and 23–02, which wraps past midnight UTC.
    expect(utcHoursFor(SLOT_BY_ID.get("evening")!)).toEqual([0, 1, 2, 22, 23]);
  });

  it("unions to the fourteen UTC hours the workflow must cover", () => {
    expect(allPublishingUtcHours()).toEqual([0, 1, 2, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
  });

  it("never names a UTC hour that maps to no window on a real day", () => {
    // Every listed hour must actually open a window on at least one of a summer
    // and a winter day, or the workflow would be firing for nothing.
    for (const hour of allPublishingUtcHours()) {
      const opens = ["2026-01-15", "2026-07-15"].some((day) =>
        Boolean(currentSlot(new Date(`${day}T${String(hour).padStart(2, "0")}:07:00Z`)))
      );
      expect(opens, `${hour}:07 UTC`).toBe(true);
    }
  });
});

describe("instantInWindow", () => {
  it("lands inside the requested window on the requested Chicago date, in both offsets", () => {
    for (const date of ["2026-01-15", "2026-07-15", "2026-03-08", "2026-11-01"]) {
      for (const slot of SLOTS) {
        const at = instantInWindow(date, slot);
        const p = chicagoParts(at);
        expect(p.date, `${date} ${slot.id}`).toBe(date);
        expect(currentSlot(at)?.id, `${date} ${slot.id}`).toBe(slot.id);
      }
    }
  });

  it("lands an hour past the window's opening, the way a first run of the day would", () => {
    expect(chicagoParts(instantInWindow("2026-07-15", SLOT_BY_ID.get("morning")!)).hour).toBe(9);
    expect(chicagoParts(instantInWindow("2026-07-15", SLOT_BY_ID.get("morning")!)).minute).toBe(5);
  });
});

// -----------------------------------------------------------------------------
// THE WORKFLOW'S CRONS MUST MATCH THE WINDOWS
//
// A cron that maps to no window is the most expensive kind of silent failure
// here: the workflow runs, the gate exits cleanly, the logs look healthy, and
// the account simply never posts. An earlier draft scheduled "0 13,19,22",
// which mapped to no slot in either offset, so the entire winter half of the
// year had no valid firing. Comparing the real file against
// allPublishingUtcHours() is the only check that catches it.
// -----------------------------------------------------------------------------

/** Expand one cron hour field — "13-23", "0-2", "7,9" — into hours. */
function expandHours(field: string): number[] {
  return field.split(",").flatMap((part) => {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    }
    return [Number(part)];
  });
}

describe("the workflow crons cover every window in both offsets", () => {
  const workflow = readFileSync(resolve(".github/workflows/social.yml"), "utf8");

  /**
   * Every cron line the schedule block declares — commented out or not.
   *
   * The leading `#` is optional on purpose: these checks are about whether the
   * HOURS are right, which has to stay true while a line is commented so that
   * uncommenting is a one-line change nobody has to re-derive.
   */
  const cronLines = [
    ...workflow.matchAll(/^\s*#?\s*- cron:\s*"(\d+)\s+([0-9,\-]+)\s+\*\s+\*\s+\*"/gm),
  ].map((m) => ({ minute: Number(m[1]), hours: expandHours(m[2]) }));

  const scheduledHours = new Set(cronLines.flatMap((c) => c.hours));

  it("declares a schedule at all", () => {
    expect(cronLines.length).toBeGreaterThan(0);
    expect(scheduledHours.size).toBeGreaterThan(0);
  });

  it("fires at every UTC hour any window can be open, in either offset", () => {
    for (const hour of allPublishingUtcHours()) {
      expect(scheduledHours.has(hour), `needs ${hour}:00 UTC`).toBe(true);
    }
    for (const slot of SLOTS) {
      for (const hour of utcHoursFor(slot)) {
        expect(scheduledHours.has(hour), `${slot.id} needs ${hour}:00 UTC`).toBe(true);
      }
    }
  });

  it("schedules no hour that maps to no window — every firing has a purpose", () => {
    const valid = new Set(allPublishingUtcHours());
    for (const hour of scheduledHours) {
      expect(valid.has(hour), `${hour}:00 UTC matches no window in either offset`).toBe(true);
    }
  });

  it("covers exactly the publishing hours and nothing more", () => {
    expect([...scheduledHours].sort((a, b) => a - b)).toEqual(allPublishingUtcHours());
  });

  it("fires OFF the top of the hour, where Actions is less contended", () => {
    // :00 is the most contended minute on the platform; runs there are
    // routinely delayed and sometimes dropped. Safe because currentSlot()
    // gates on the local window, not the minute.
    const minutes = cronLines.map((c) => c.minute);
    expect(minutes.length).toBeGreaterThan(0);
    for (const m of minutes) expect(m, "cron minute must not be 0").toBeGreaterThan(0);
    // One minute for every line, so the firings stay in step with each other.
    expect(new Set(minutes).size).toBe(1);
    expect(minutes[0]).toBe(7);
  });

  it("still opens the gate for a firing that is minutes past the hour", () => {
    // The property that makes :07 safe. Asserted here rather than assumed.
    expect(currentSlot(new Date("2026-07-15T14:07:00Z"))?.id).toBe("morning");
    expect(currentSlot(new Date("2026-01-15T15:07:00Z"))?.id).toBe("morning");
    expect(currentSlot(new Date("2026-07-15T23:07:00Z"))?.id).toBe("evening");
    expect(currentSlot(new Date("2026-01-16T00:07:00Z"))?.id).toBe("evening");
  });

  it("is ARMED — exactly two live cron lines, not commented out", () => {
    // Flipped on activation. If this ever fails, someone disarmed the schedule
    // and the account has gone silent; that should be a deliberate act with a
    // test change attached, not a quiet edit.
    const active = workflow.match(/^\s{4}- cron:/gm) ?? [];
    expect(active).toHaveLength(2);
    expect(workflow).toMatch(/^  schedule:$/m);
    expect(workflow).toContain('- cron: "7 13-23 * * *"');
    expect(workflow).toContain('- cron: "7 0-2 * * *"');
  });

  it("gates a scheduled firing on the window BEFORE installing dependencies", () => {
    // Eleven or so no-op firings a day must cost seconds, not an `npm ci` each.
    const gate = workflow.indexOf("name: Is a window open, and unfilled?");
    const install = workflow.indexOf("name: Install dependencies");
    expect(gate).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(gate);
    expect(workflow).toContain("scripts/social-gate.ts");
  });

  it("does not let a failed publish report success", () => {
    // The publish step pipes through `tee`, and a bash pipeline exits with its
    // LAST command's status. Without pipefail a rejected post shows green.
    const step = workflow.slice(workflow.indexOf("name: Publish this window"));
    const body = step.slice(0, step.indexOf("- name:", 10));
    expect(body).toContain("set -o pipefail");
    expect(body.indexOf("set -o pipefail")).toBeLessThan(body.indexOf("npm run social:post"));
  });

  it("still commits the ledger and the queue when the publish step fails", () => {
    // A post that went out and then failed the job MUST still record its row,
    // or the next run reposts it; validated copy in the queue must survive too.
    expect(workflow).toMatch(/Persist the post ledger and the editorial queue[\s\S]{0,200}always\(\)/);
    expect(workflow).toContain("src/lib/generated/social-posted.json");
    expect(workflow).toContain("src/lib/generated/social-queue.json");
  });

  it("tells an operator how to stop it, fastest route first", () => {
    // An armed unattended publisher needs its off switch documented where the
    // schedule is, not in a doc someone has to find at the wrong moment.
    expect(workflow).toMatch(/TO STOP EVERYTHING/);
    expect(workflow).toMatch(/SOCIAL_POST_ENABLED to anything other/);
  });
});

describe("the workflow's platform wiring", () => {
  const workflow = readFileSync(resolve(".github/workflows/social.yml"), "utf8");

  it("passes all four X credentials into the job", () => {
    for (const name of ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]) {
      expect(workflow).toContain(`${name}: \${{ secrets.${name} }}`);
    }
  });

  it("wires LinkedIn from secrets, never from a literal", () => {
    // Safe whether or not the secrets exist: readLinkedInCredentials() requires
    // BOTH values, so an unset secret resolves to the empty string, no LinkedIn
    // publisher is constructed, and the platform records
    // SKIPPED_CREDENTIAL_EXPIRED while X is entirely unaffected.
    expect(workflow).toMatch(/^\s+LINKEDIN_ACCESS_TOKEN: \$\{\{ secrets\.LINKEDIN_ACCESS_TOKEN \}\}$/m);
    expect(workflow).toMatch(/^\s+LINKEDIN_AUTHOR_URN: \$\{\{ vars\.LINKEDIN_AUTHOR_URN \}\}$/m);
  });

  it("hard-codes no credential value anywhere", () => {
    for (const name of ["LINKEDIN_ACCESS_TOKEN", "OPENAI_API_KEY"]) {
      for (const m of workflow.matchAll(new RegExp(`${name}:\s*(.+)`, "g"))) {
        expect(m[1].trim().startsWith("${{ secrets."), `${name} = ${m[1]}`).toBe(true);
      }
    }
  });

  it("maps the kill switch from the repository variable, never a literal", () => {
    expect(workflow).toMatch(
      /^\s+SOCIAL_POST_ENABLED:\s+\$\{\{\s*vars\.SOCIAL_POST_ENABLED\s*\}\}\s*$/m
    );
    expect(workflow).not.toMatch(/SOCIAL_POST_ENABLED:\s*["']?true["']?\s*$/m);
  });

  it("commits the ledger even when an earlier step failed", () => {
    // A post that went out and then lost its ledger row would be re-posted.
    expect(workflow).toContain("src/lib/generated/social-posted.json");
    // Tolerates a block scalar `if: |` — the condition carries a dry-run-day
    // exclusion. What must hold is that always() still guards the step.
    expect(workflow).toMatch(/Persist the post ledger[\s\S]{0,200}always\(\)/);
  });

  it("never hard-codes a credential value", () => {
    for (const secret of ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "ANTHROPIC_API_KEY"]) {
      const assignments = [...workflow.matchAll(new RegExp(`${secret}:\\s*(.+)`, "g"))].map((m) =>
        m[1].trim()
      );
      for (const value of assignments) {
        expect(value.startsWith("${{ secrets."), `${secret} = ${value}`).toBe(true);
      }
    }
  });
});

describe("inPublishingWindow", () => {
  it("agrees with currentSlot", () => {
    // 09:00 CDT is inside the morning window; 07:00 CDT is before it.
    expect(inPublishingWindow(new Date("2026-07-15T14:00:00Z"))).toBe(true);
    expect(inPublishingWindow(new Date("2026-07-15T12:00:00Z"))).toBe(false);
    // 11:00 CDT — an hour the exact-hour gate rejected — is now inside.
    expect(inPublishingWindow(new Date("2026-07-15T16:00:00Z"))).toBe(true);
    // 22:00 CDT is after the evening closes.
    expect(inPublishingWindow(new Date("2026-07-16T03:00:00Z"))).toBe(false);
  });
});
