// =============================================================================
// WINDOWS AND THE DST GATE
//
// One post a day, opening at 09:00 America/Chicago, and a narrow breaking
// window in the afternoon and evening. GitHub Actions cron is always UTC and
// GitHub delivers scheduled firings late under load, so the daily window is a
// SPAN of local hours and the cron fires every UTC hour that can fall inside
// it in either US offset. These tests pin the things that make that safe: the
// gate reads Chicago LOCAL time, the first firing of the day lands at 09:03 in
// both CDT and CST, the crons cover every hour the daily window can be open,
// and the breaking checks land inside the breaking window in both offsets.
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
  BREAKING_CHECK_UTC_HOURS,
  CRON_MINUTE,
  currentSlot,
  chicagoParts,
  utcHoursFor,
  scheduledUtcHours,
  inPublishingWindow,
  instantInWindow,
  slotCoversHour,
} from "@/lib/social/slots";

const daily = SLOT_BY_ID.get("daily")!;
const breaking = SLOT_BY_ID.get("breaking")!;

describe("window definitions", () => {
  it("has one daily window opening at 09:00 and one breaking window after it", () => {
    expect(SLOTS.map((s) => s.id)).toEqual(["daily", "breaking"]);
    expect(daily.hours).toEqual([9, 13]);
    expect(breaking.hours).toEqual([14, 20]);
    for (const slot of SLOTS) expect(slot.hour).toBe(slot.hours[0]);
  });

  it("has windows that do not overlap, and nothing before 09:00 or after 20:59", () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(SLOTS.filter((s) => slotCoversHour(s, hour)).length, `${hour}:00`).toBeLessThanOrEqual(1);
    }
    expect(slotCoversHour(daily, 8)).toBe(false);
    expect(slotCoversHour(breaking, 21)).toBe(false);
  });

  it("says in its purpose that the breaking window is for major developments only", () => {
    expect(breaking.purpose).toMatch(/major development/i);
    expect(breaking.purpose).toMatch(/never routine/i);
  });
});

describe("currentSlot", () => {
  it("opens the daily window at 09:00 Chicago in summer (CDT, UTC-5)", () => {
    expect(currentSlot(new Date("2026-07-15T14:00:00Z"))?.id).toBe("daily");
    expect(currentSlot(new Date("2026-07-15T13:59:00Z"))).toBeNull(); // 08:59 CDT
  });

  it("opens the daily window at 09:00 Chicago in winter (CST, UTC-6)", () => {
    expect(currentSlot(new Date("2026-01-15T15:00:00Z"))?.id).toBe("daily");
    expect(currentSlot(new Date("2026-01-15T14:59:00Z"))).toBeNull(); // 08:59 CST
  });

  it("keeps the daily window open through 13:59, so a late firing still counts", () => {
    expect(currentSlot(new Date("2026-07-15T18:59:00Z"))?.id).toBe("daily"); // 13:59 CDT
    expect(currentSlot(new Date("2026-01-15T19:59:00Z"))?.id).toBe("daily"); // 13:59 CST
  });

  it("is the breaking window from 14:00 to 20:59 and nothing after", () => {
    expect(currentSlot(new Date("2026-07-15T19:00:00Z"))?.id).toBe("breaking"); // 14:00 CDT
    expect(currentSlot(new Date("2026-07-16T01:59:00Z"))?.id).toBe("breaking"); // 20:59 CDT
    expect(currentSlot(new Date("2026-07-16T02:00:00Z"))).toBeNull(); // 21:00 CDT
    expect(currentSlot(new Date("2026-01-16T02:59:00Z"))?.id).toBe("breaking"); // 20:59 CST
    expect(currentSlot(new Date("2026-01-16T03:00:00Z"))).toBeNull(); // 21:00 CST
  });

  it("gets the day DST begins right (2026-03-08: CST until 02:00, then CDT)", () => {
    expect(currentSlot(new Date("2026-03-08T14:00:00Z"))?.id).toBe("daily"); // 09:00 CDT
    expect(currentSlot(new Date("2026-03-08T13:00:00Z"))).toBeNull(); // 08:00 CDT
    expect(chicagoParts(new Date("2026-03-08T14:03:00Z")).time).toBe("09:03");
  });

  it("gets the day DST ends right (2026-11-01: CDT until 02:00, then CST)", () => {
    expect(currentSlot(new Date("2026-11-01T15:00:00Z"))?.id).toBe("daily"); // 09:00 CST
    expect(currentSlot(new Date("2026-11-01T14:00:00Z"))).toBeNull(); // 08:00 CST
    expect(chicagoParts(new Date("2026-11-01T15:03:00Z")).time).toBe("09:03");
  });
});

describe("utcHoursFor", () => {
  it("returns both offsets for every hour of the window", () => {
    // daily 09–13 local: CDT 14–18Z, CST 15–19Z
    expect(utcHoursFor(daily)).toEqual([14, 15, 16, 17, 18, 19]);
  });
});

describe("the breaking checks", () => {
  it("land inside the breaking window in both offsets", () => {
    for (const hour of BREAKING_CHECK_UTC_HOURS) {
      for (const day of ["2026-07-15", "2026-01-15"]) {
        const at = new Date(`${day}T${String(hour).padStart(2, "0")}:${String(CRON_MINUTE).padStart(2, "0")}:00Z`);
        expect(currentSlot(at)?.id, `${day} ${hour}:03Z`).toBe("breaking");
      }
    }
  });

  it("are three a day, not one an hour — a major development is rare", () => {
    expect(BREAKING_CHECK_UTC_HOURS).toHaveLength(3);
  });
});

describe("instantInWindow", () => {
  it("lands inside its window on every kind of day", () => {
    for (const date of ["2026-01-15", "2026-03-08", "2026-07-15", "2026-11-01"]) {
      for (const slot of SLOTS) {
        const at = instantInWindow(date, slot);
        expect(chicagoParts(at).date, `${date} ${slot.id}`).toBe(date);
        expect(currentSlot(at)?.id, `${date} ${slot.id}`).toBe(slot.id);
      }
    }
  });

  it("puts the daily post at 09:05, when the first firing of the day lands", () => {
    expect(chicagoParts(instantInWindow("2026-07-15", daily)).time).toBe("09:05");
    expect(chicagoParts(instantInWindow("2026-01-15", daily)).time).toBe("09:05");
  });

  it("moves later firings later, never past the window", () => {
    expect(chicagoParts(instantInWindow("2026-07-15", daily, 5, 2)).hour).toBe(11);
    expect(chicagoParts(instantInWindow("2026-07-15", daily, 5, 99)).hour).toBe(13);
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
// scheduledUtcHours() is the only check that catches it.
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

describe("the workflow crons", () => {
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

  it("fires at every UTC hour the daily window can be open, in either offset", () => {
    for (const hour of utcHoursFor(daily)) {
      expect(scheduledHours.has(hour), `daily needs ${hour}:00 UTC`).toBe(true);
    }
  });

  it("covers exactly the scheduled hours and nothing more", () => {
    expect([...scheduledHours].sort((a, b) => a - b)).toEqual(scheduledUtcHours());
  });

  it("schedules no hour that maps to no window in BOTH offsets", () => {
    // 14:03Z is 08:03 CST — outside, by design: it is the CDT 09:03 firing,
    // and the gate stops it in winter for free. Every hour must open a window
    // in at least one offset, and none may be dead all year.
    for (const hour of scheduledHours) {
      const summer = currentSlot(new Date(`2026-07-15T${String(hour).padStart(2, "0")}:03:00Z`));
      const winter = currentSlot(new Date(`2026-01-15T${String(hour).padStart(2, "0")}:03:00Z`));
      expect(Boolean(summer || winter), `${hour}:03 UTC matches no window`).toBe(true);
    }
  });

  it("fires within minutes of 09:00 Chicago all year", () => {
    const first = (day: string) =>
      [...scheduledHours]
        .map((h) => new Date(`${day}T${String(h).padStart(2, "0")}:${String(CRON_MINUTE).padStart(2, "0")}:00Z`))
        .filter((d) => currentSlot(d)?.id === "daily")
        .map((d) => chicagoParts(d).time)
        .sort()[0];
    for (const day of ["2026-01-15", "2026-03-08", "2026-07-15", "2026-11-01", "2026-12-31"]) {
      expect(first(day), day).toBe("09:03");
    }
  });

  it("fires OFF the top of the hour, where Actions is less contended", () => {
    // :00 is the most contended minute on the platform; runs there are
    // routinely delayed and sometimes dropped. Safe because currentSlot()
    // gates on the local window, not the minute.
    const minutes = cronLines.map((c) => c.minute);
    expect(minutes.length).toBeGreaterThan(0);
    for (const m of minutes) expect(m, "cron minute must not be 0").toBe(CRON_MINUTE);
    expect(CRON_MINUTE).toBeGreaterThan(0);
  });

  it("is ARMED — exactly two live cron lines, not commented out", () => {
    // Flipped on activation. If this ever fails, someone disarmed the schedule
    // and the account has gone silent; that should be a deliberate act with a
    // test change attached, not a quiet edit.
    const active = workflow.match(/^\s{4}- cron:/gm) ?? [];
    expect(active).toHaveLength(2);
    expect(workflow).toMatch(/^  schedule:$/m);
    expect(workflow).toContain('- cron: "3 14-19 * * *"');
    expect(workflow).toContain('- cron: "3 21,23,1 * * *"');
  });

  it("gates a scheduled firing on the window BEFORE installing dependencies", () => {
    // No-op firings must cost seconds, not an `npm ci` each.
    const gate = workflow.indexOf("name: Is a window open, and unfilled?");
    const install = workflow.indexOf("name: Install dependencies");
    expect(gate).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(gate);
    expect(workflow).toContain("scripts/social-gate.ts");
  });

  it("spends no X request on a credential check during scheduled runs", () => {
    // The X API is prepaid per request. The publish call reports a bad
    // credential (401) or an empty balance (402) by name anyway.
    const step = workflow.slice(workflow.indexOf("name: Verify the X credential (read-only)"));
    const body = step.slice(0, step.indexOf("- name:", 10));
    expect(body).toMatch(/if: github\.event_name == 'workflow_dispatch' && github\.event\.inputs\.dry_run_day != 'true'\s*$/m);
  });

  it("does not let a failed publish report success", () => {
    // The publish step pipes through `tee`, and a bash pipeline exits with its
    // LAST command's status. Without pipefail a rejected post shows green.
    const step = workflow.slice(workflow.indexOf("name: Publish this window"));
    const body = step.slice(0, step.indexOf("- name:", 10));
    expect(body).toContain("set -o pipefail");
    expect(body.indexOf("set -o pipefail")).toBeLessThan(body.indexOf("npm run social:post"));
  });

  it("only accepts a known window name when dispatched by hand", () => {
    // A free-text input reached the shell verbatim; a choice cannot.
    expect(workflow).toMatch(/slot:\s*\n\s+description:[^\n]*\n\s+type: choice\s*\n\s+options: \["", "daily", "breaking"\]/);
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
    // 09:00 CDT is inside the daily window; 07:00 CDT is before it.
    expect(inPublishingWindow(new Date("2026-07-15T14:00:00Z"))).toBe(true);
    expect(inPublishingWindow(new Date("2026-07-15T12:00:00Z"))).toBe(false);
    // 11:00 CDT — a late firing — is still inside.
    expect(inPublishingWindow(new Date("2026-07-15T16:00:00Z"))).toBe(true);
    // 22:00 CDT is after the breaking window closes.
    expect(inPublishingWindow(new Date("2026-07-16T03:00:00Z"))).toBe(false);
  });
});
