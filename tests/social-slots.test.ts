// =============================================================================
// SLOTS AND THE DST GATE
//
// GitHub Actions cron is always UTC. The workflow therefore fires six times a
// day — three for CST, three for CDT — and three of those six are an hour wrong
// on any given date. These tests pin the thing that makes that safe: the gate
// opens on Chicago LOCAL time, so the wrong-offset firings do nothing.
//
// The two transition days are tested explicitly. They are the only days the
// naive implementation (fixed UTC offset arithmetic) gets wrong, and they are
// exactly the days a reader would notice a post arriving an hour early.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SLOTS, currentSlot, chicagoParts, utcHoursFor, inPublishingWindow } from "@/lib/social/slots";

describe("slot definitions", () => {
  it("has exactly three slots, at 9am, 3pm and 6pm", () => {
    expect(SLOTS.map((s) => s.hour)).toEqual([9, 15, 18]);
  });

  it("gives each slot a different pool", () => {
    expect(new Set(SLOTS.map((s) => s.pool)).size).toBe(3);
  });

  it("only the morning slot may break news", () => {
    const breaking = SLOTS.filter((s) => s.angles.includes("breaking_change"));
    expect(breaking).toHaveLength(1);
    expect(breaking[0].id).toBe("morning");
  });

  it("never lets two slots share an angle", () => {
    // Overlapping angles would let the same treatment appear twice in a day.
    const seen = new Set<string>();
    for (const slot of SLOTS) {
      for (const angle of slot.angles) {
        expect(seen.has(angle), `${angle} appears in more than one slot`).toBe(false);
        seen.add(angle);
      }
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
  it("opens the morning slot at 09:00 local in summer", () => {
    expect(currentSlot(new Date("2026-07-15T14:00:00Z"))?.id).toBe("morning");
  });

  it("opens the morning slot at 09:00 local in winter", () => {
    expect(currentSlot(new Date("2026-01-15T15:00:00Z"))?.id).toBe("morning");
  });

  it("stays shut for the wrong-offset firing in summer", () => {
    // 15:00 UTC is the CST firing. In July that is 10:00 local — not a slot.
    expect(currentSlot(new Date("2026-07-15T15:00:00Z"))).toBeNull();
  });

  it("stays shut for the wrong-offset firing in winter", () => {
    // 14:00 UTC is the CDT firing. In January that is 08:00 local — not a slot.
    expect(currentSlot(new Date("2026-01-15T14:00:00Z"))).toBeNull();
  });

  it("tolerates a late cron start within the hour", () => {
    // Actions routinely starts several minutes late; a minute-exact gate would
    // silently drop real runs.
    expect(currentSlot(new Date("2026-07-15T14:47:00Z"))?.id).toBe("morning");
  });

  it("opens afternoon and evening at the right local hours", () => {
    expect(currentSlot(new Date("2026-07-15T20:00:00Z"))?.id).toBe("afternoon");
    expect(currentSlot(new Date("2026-07-15T23:00:00Z"))?.id).toBe("evening");
  });

  it("handles the spring-forward transition day", () => {
    // 2026-03-08: DST begins. 14:00 UTC is 09:00 CDT.
    expect(currentSlot(new Date("2026-03-08T14:00:00Z"))?.id).toBe("morning");
    expect(currentSlot(new Date("2026-03-08T15:00:00Z"))).toBeNull();
  });

  it("handles the fall-back transition day", () => {
    // 2026-11-01: DST ends. 15:00 UTC is 09:00 CST.
    expect(currentSlot(new Date("2026-11-01T15:00:00Z"))?.id).toBe("morning");
    expect(currentSlot(new Date("2026-11-01T14:00:00Z"))).toBeNull();
  });

  it("covers exactly three of the twenty-four hours on any given day", () => {
    for (const day of ["2026-01-15", "2026-07-15"]) {
      const open = Array.from({ length: 24 }, (_, h) =>
        currentSlot(new Date(`${day}T${String(h).padStart(2, "0")}:00:00Z`))
      ).filter(Boolean);
      expect(open).toHaveLength(3);
    }
  });
});

describe("utcHoursFor", () => {
  it("gives both offsets for each slot", () => {
    expect(utcHoursFor(SLOTS[0])).toEqual([14, 15]);
    expect(utcHoursFor(SLOTS[1])).toEqual([20, 21]);
    expect(utcHoursFor(SLOTS[2])).toEqual([0, 23]);
  });
});

// -----------------------------------------------------------------------------
// THE WORKFLOW'S CRONS MUST MATCH THE SLOTS
//
// A cron that maps to no slot is the most expensive kind of silent failure here:
// the workflow runs, the gate exits cleanly, the logs look healthy, and the
// account simply never posts. That is precisely what an earlier draft did — it
// scheduled "0 13,19,22", which is 08:00/14:00/17:00 CDT and 07:00/13:00/16:00
// CST, so the entire winter half of the year had no valid firing.
//
// Comparing the real file against utcHoursFor() is the only check that catches
// it, because every other test in this suite passes either way.
// -----------------------------------------------------------------------------

describe("the workflow crons cover every slot in both offsets", () => {
  const workflow = readFileSync(resolve(".github/workflows/social.yml"), "utf8");

  /**
   * Every UTC hour the schedule block declares — commented out or not.
   *
   * The leading `#` is optional on purpose. The schedule ships disarmed, and
   * these checks are about whether the HOURS are right, which has to stay true
   * while it is commented so that uncommenting is a one-line change nobody has
   * to re-derive. A wrong hour hidden behind a comment is still a wrong hour.
   */
  const scheduledHours = new Set(
    [...workflow.matchAll(/^\s*#?\s*- cron:\s*"0\s+([0-9,]+)\s+\*\s+\*\s+\*"/gm)]
      .flatMap((m) => m[1].split(",").map(Number))
  );

  it("declares a schedule at all", () => {
    expect(scheduledHours.size).toBeGreaterThan(0);
  });

  it("fires at both the CDT and the CST hour for every slot", () => {
    for (const slot of SLOTS) {
      for (const hour of utcHoursFor(slot)) {
        expect(scheduledHours.has(hour), `${slot.id} needs ${hour}:00 UTC`).toBe(true);
      }
    }
  });

  it("schedules no hour that maps to no slot — every firing has a purpose", () => {
    const valid = new Set(SLOTS.flatMap((s) => utcHoursFor(s)));
    for (const hour of scheduledHours) {
      expect(valid.has(hour), `${hour}:00 UTC matches no slot in either offset`).toBe(true);
    }
  });

  it("would fire exactly six times a day — three per offset", () => {
    const total = [
      ...workflow.matchAll(/^\s*#?\s*- cron:\s*"0\s+([0-9,]+)\s+\*\s+\*\s+\*"/gm),
    ].reduce((n, m) => n + m[1].split(",").length, 0);
    expect(total).toBe(6);
  });

  it("carries the instruction for arming it, since it ships disarmed", () => {
    // The schedule is commented out until the workflow has been exercised from
    // the Actions tab. Whoever arms it should not have to reconstruct how.
    expect(workflow).toMatch(/TO GO LIVE: uncomment/);
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
    // Tolerates a block scalar `if: |` — the condition grew a dry-run-day
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
    expect(inPublishingWindow(new Date("2026-07-15T14:00:00Z"))).toBe(true);
    expect(inPublishingWindow(new Date("2026-07-15T16:00:00Z"))).toBe(false);
  });
});
