// =============================================================================
// ALERTS, DIGESTS, REMINDERS AND THE CALENDAR AGREE WITH THE BRIEFING
//
// The Briefing decides urgency from stated dates and treats body-only matches
// as possibly incidental. The alert job and the calendar must not contradict
// it. These tests use real records from the archive.
// =============================================================================

import { describe, expect, it } from "vitest";
import { buildAlertBatch, changeAlerts, isPriorityEvent, reminderAlerts, serializeCursor } from "@/lib/billing/alerts";
import { buildAlertEmail } from "@/lib/billing/alert-email";
import { runAlerts, type SendAlert } from "@/lib/billing/alert-run";
import { MemoryStore } from "@/lib/billing/store";
import { EVENT_INDEX, type IndexedEvent } from "@/lib/event-index";
import { EVENTS } from "@/lib/event-store";
import type { ChangeInput } from "@/lib/intelligence/change";
import { buildBriefing } from "@/lib/pro/feed";
import { renderBriefHtml } from "@/lib/pro/export";
import { DEFAULT_PREFS, parsePrefs, serializePrefs } from "@/lib/pro/prefs";

const indexed = (id: string): IndexedEvent => {
  const e = EVENT_INDEX.find((x) => x.id === id);
  if (!e) throw new Error(`fixture ${id} is not in the event index`);
  return e;
};
const DATA = (events: IndexedEvent[]) => ({ events, warnEmployers: [], h1bEmployers: [], fiscalYear: "" });

const BIOMETRIC_FEE = "federal_register:2026-16231"; // H-1B/L-1, effective 2026-09-09; F-1 only in the body
const ENTRY_EXIT_2025 = "federal_register:2025-19655"; // major final rule, effective 2025-12-26

describe("old major records", () => {
  it("never alert again once the cursor has passed them, whatever the relevance setting", () => {
    const old = indexed(ENTRY_EXIT_2025);
    expect(old.severity).toBe("major");
    const follow = old.entityIds.find((x) => x.startsWith("agency:"))!;
    const cursor = { lastChangeDate: "2026-10-01", sent: [] };
    for (const relevance of ["all", "priority"] as const) {
      const batch = buildAlertBatch(DATA([old]), [follow], cursor, { today: "2026-10-16", relevance, remindWithinDays: 7 });
      expect(batch.alerts).toEqual([]);
    }
  });
});

describe("body-only matches", () => {
  it("cannot trigger a change alert, a priority alert or a reminder", () => {
    const bio = indexed(BIOMETRIC_FEE);
    // F-1 appears only in a body sentence; the record's links (title and
    // abstract) do not carry it, so the alert job cannot match it.
    expect(bio.entityIds).not.toContain("visa:f-1");
    const before = "2026-09-05";
    expect(changeAlerts([bio], ["visa:f-1"], {})).toEqual([]);
    expect(reminderAlerts([bio], ["visa:f-1"], {}, before, 7)).toEqual([]);
    expect(buildAlertBatch(DATA([bio]), ["visa:f-1"], {}, { today: before, relevance: "priority", remindWithinDays: 7 }).alerts).toEqual([]);
    // The named follow still works.
    expect(reminderAlerts([bio], ["visa:h-1b"], {}, before, 7).map((a) => a.kind)).toEqual(["effective_reminder"]);
  });

  it("every link alerts can match is one the Briefing treats as primary", () => {
    // If a followed id is in a record's links, the Briefing shows it as named
    // (or issued-by / topic) — never as a body-only mention.
    const follows = ["visa:h-1b", "visa:f-1", "visa:l-1", "agency:uscis", "agency:dhs", "topic:h1b"];
    const b = buildBriefing({ follows, savedIds: [], today: "2026-10-16", historicalLimit: 1000 });
    const byId = new Map(EVENT_INDEX.map((e) => [e.id, e] as const));
    for (const item of b.feed) {
      const links = byId.get(item.change.recordId)?.entityIds ?? [];
      for (const m of item.assessment.matches) {
        if (links.includes(m.follow)) expect(["named", "categorized"], `${item.change.recordId} ${m.follow}`).toContain(m.strength);
      }
    }
  });
});

describe("proposed rules", () => {
  it("are never a reminder and never priority on a date", () => {
    const proposal = EVENT_INDEX.find((e) => e.classification === "proposed_rule")!;
    const dated: IndexedEvent = { ...proposal, effectiveAt: "2026-10-20", severity: "notable" };
    const follow = dated.entityIds[0];
    expect(reminderAlerts([dated], [follow], {}, "2026-10-16", 7)).toEqual([]);
    expect(isPriorityEvent(dated, "2026-10-16", 30)).toBe(false);
  });
});

describe("no duplicate or misleading notifications", () => {
  const fresh = (): IndexedEvent => ({
    ...indexed(BIOMETRIC_FEE),
    id: "federal_register:2099-1",
    publishedAt: "2026-10-15",
    effectiveAt: "2026-10-18",
  });

  it("a new change taking effect within the window arrives once, as the reminder", () => {
    const batch = buildAlertBatch(DATA([fresh()]), ["visa:h-1b"], { lastChangeDate: "2026-10-01" }, { today: "2026-10-16", remindWithinDays: 7 });
    expect(batch.alerts.map((a) => a.kind)).toEqual(["effective_reminder"]);
    // And never again as "new" on the next run.
    const next = buildAlertBatch(DATA([fresh()]), ["visa:h-1b"], batch.cursor, { today: "2026-10-17", remindWithinDays: 7 });
    expect(next.alerts).toEqual([]);
    // Without reminders it is sent once as news, as before.
    expect(buildAlertBatch(DATA([fresh()]), ["visa:h-1b"], { lastChangeDate: "2026-10-01" }, { today: "2026-10-16" }).alerts.map((a) => a.kind)).toEqual(["change"]);
  });

  it("a reminder email does not call the reminder new", () => {
    const [reminder] = reminderAlerts([fresh()], ["visa:h-1b"], {}, "2026-10-16", 7);
    const mail = buildAlertEmail({ alerts: [reminder], origin: "https://immigrationclock.com", unsubscribeUrl: "https://immigrationclock.com/u", testMode: false });
    expect(mail.text).toContain("1 effective-date reminder on what you follow:");
    expect(mail.text).not.toMatch(/\bnew update/);
    expect(mail.html).toContain("1 reminder");
    expect(mail.html).toContain("Coming up on what you follow");
    expect(mail.html).not.toMatch(/\bnew\b/i);
  });

  it("a mixed email names both", () => {
    const [reminder] = reminderAlerts([fresh()], ["visa:h-1b"], {}, "2026-10-16", 7);
    const news = { ...reminder, kind: "change" as const, id: "change:x", title: "Another change" };
    const mail = buildAlertEmail({ alerts: [reminder, news], origin: "https://immigrationclock.com", unsubscribeUrl: "u", testMode: false });
    expect(mail.text).toContain("1 new update and 1 effective-date reminder on what you follow:");
  });
});

describe("digests keep subscriber settings", () => {
  it("a weekly priority digest with reminders sends once and leaves the settings as they were", async () => {
    const MONDAY = Date.UTC(2026, 9, 12, 13, 30) / 1000;
    const store = new MemoryStore();
    await store.putSubscriber("k1", { email: "p@example.com", customerId: "c", status: "active", currentPeriodEnd: MONDAY + 86400 * 30, updatedAt: MONDAY });
    await store.putWatchlist("k1", { entityIds: ["visa:h-1b"], updatedAt: MONDAY });
    await store.putAlertCursor("k1", serializeCursor({ lastChangeDate: "2026-10-01", sent: [] }));
    const prefs = serializePrefs({ ...DEFAULT_PREFS, frequency: "weekly", relevance: "priority", reminders: true, calendarVersion: 3 });
    await store.putProDoc("prefs", "k1", prefs);
    const sends: string[] = [];
    const sender: SendAlert = async (_to, mail) => {
      sends.push(mail.text);
      return { ok: true };
    };
    const event: IndexedEvent = { ...indexed(BIOMETRIC_FEE), id: "federal_register:2099-2", publishedAt: "2026-10-10", effectiveAt: "2026-10-14" };
    const run = () =>
      runAlerts({ store, nowSeconds: MONDAY, data: DATA([event]), secret: "s".repeat(64), origin: "https://immigrationclock.com", testMode: false, send: true, sender, briefing: true });
    expect((await run()).sent).toBe(1);
    expect((await run()).sent).toBe(0); // nothing twice
    expect(sends).toHaveLength(1);
    expect(sends[0]).toContain("effective-date reminder");
    expect(await store.getProDoc("prefs", "k1")).toBe(prefs);
    expect(parsePrefs(await store.getProDoc("prefs", "k1")).calendarVersion).toBe(3);
  });
});

describe("the calendar", () => {
  it("keeps a stated date however distant, and never a proposal's", () => {
    const base = (EVENTS as unknown as ChangeInput[]).find((e) => e.id === BIOMETRIC_FEE)!;
    const far = { ...base, id: "federal_register:2099-3", effectiveAt: "2027-12-01" } as ChangeInput;
    const proposal = { ...base, id: "federal_register:2099-4", classification: "proposed_rule", effectiveAt: "2026-12-01" } as ChangeInput;
    const b = buildBriefing({ follows: ["visa:h-1b"], savedIds: [], today: "2026-10-16" }, [far, proposal]);
    expect(b.timeline.map((t) => t.recordId)).toEqual(["federal_register:2099-3"]);
    expect(b.sections.upcoming.map((i) => i.change.recordId)).toContain("federal_register:2099-3");
  });
});

describe("the printable feed brief", () => {
  it("carries status, dates, source and why each record is there", () => {
    const b = buildBriefing({ follows: ["visa:h-1b", "visa:f-1"], savedIds: [], today: "2026-10-16" });
    const entries = b.feed.slice(0, 5).map((i) => ({
      change: i.change,
      brief: i.brief,
      path: i.path,
      why: i.assessment.matches.map((m) => m.reason),
      statusText: i.assessment.status,
    }));
    expect(entries.length).toBeGreaterThan(0);
    const html = renderBriefHtml({ title: "Brief", generatedAt: "2026-10-16", origin: "https://immigrationclock.com", entries });
    expect(html).toContain("Why it is in your Briefing");
    expect(html).toContain("window.print()");
    for (const e of entries) {
      expect(html).toContain(e.change.publishedDate);
      expect(html).toContain(e.change.source.url.replace(/&/g, "&amp;"));
      expect(html).toContain(e.statusText.replace(/&/g, "&amp;").replace(/"/g, "&quot;"));
    }
  });
});
