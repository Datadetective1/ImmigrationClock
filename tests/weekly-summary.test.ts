// =============================================================================
// THE WEEKLY INTELLIGENCE SUMMARY
// =============================================================================

import { describe, expect, it } from "vitest";
import { runAlerts, runWeeklySummaries, type SendAlert } from "@/lib/billing/alert-run";
import { EVENT_INDEX } from "@/lib/event-index";
import { serializeCursor } from "@/lib/billing/alerts";
import { MemoryStore } from "@/lib/billing/store";
import { EVENTS } from "@/lib/event-store";
import type { ChangeInput } from "@/lib/intelligence/change";
import { parseHistory } from "@/lib/pro/history";
import { DEFAULT_PREFS, serializePrefs } from "@/lib/pro/prefs";
import { QUIET_NOTE, buildWeeklySummary, renderWeeklyEmail } from "@/lib/pro/weekly";

const ALL = EVENTS as unknown as ChangeInput[];
const BIOMETRIC_FEE = ALL.find((e) => e.id === "federal_register:2026-16231")!;
const ORIGIN = "https://immigrationclock.com";
const render = (s: ReturnType<typeof buildWeeklySummary>) => renderWeeklyEmail(s, { origin: ORIGIN, unsubscribeUrl: `${ORIGIN}/u`, testMode: false });

describe("summary content", () => {
  it("a quiet week says so, keeps useful standing information, and names what was not covered", () => {
    // Two weeks after the newest F-1 record: nothing new, but an open proposal remains.
    const s = buildWeeklySummary({ follows: ["visa:f-1"], today: "2026-10-26" });
    expect(s.quiet).toBe(true);
    const mail = render(s);
    expect(mail.subject).toContain("no new records");
    expect(mail.text).toContain(QUIET_NOTE);
    expect(mail.text).toMatch(/F-1[^\n]*No new records this week · newest/);
    expect(mail.text).toMatch(/open proposal/);
    expect(mail.text).toMatch(/Not covered: .*Visa Bulletin/);
    // "nothing changed" appears only inside "not proof that nothing changed".
    expect(mail.text.match(/nothing changed/gi)?.length).toBe(mail.text.match(/not proof that nothing changed/gi)?.length);
    expect(mail.text).not.toMatch(/in force/i);
  });

  it("a busy week lists the new records for the follow they match", () => {
    const s = buildWeeklySummary({ follows: ["agency:uscis"], today: "2026-10-16" });
    expect(s.quiet).toBe(false);
    const uscis = s.follows[0];
    expect(uscis.newThisWeek.length).toBeGreaterThan(0);
    for (const n of uscis.newThisWeek) expect(n.date >= "2026-10-10").toBe(true);
    expect(render(s).subject).toMatch(/\d+ new records?/);
  });

  it("a body-only mention is not new for that follow", () => {
    const fresh = { ...BIOMETRIC_FEE, id: "federal_register:2099-20", publishedAt: "2026-10-15" } as ChangeInput;
    const s = buildWeeklySummary({ follows: ["visa:f-1", "visa:h-1b"], today: "2026-10-16" }, [fresh]);
    expect(s.follows.find((f) => f.label.startsWith("F-1"))!.newThisWeek).toEqual([]);
    expect(s.follows.find((f) => f.label.startsWith("H-1B"))!.newThisWeek).toHaveLength(1);
  });

  it("dates ahead are stated, within 90 days, primary, and never a proposal's", () => {
    const soon = { ...BIOMETRIC_FEE, id: "federal_register:2099-21", effectiveAt: "2026-11-20" } as ChangeInput;
    const far = { ...BIOMETRIC_FEE, id: "federal_register:2099-22", effectiveAt: "2027-06-01" } as ChangeInput;
    const proposal = { ...BIOMETRIC_FEE, id: "federal_register:2099-23", classification: "proposed_rule", effectiveAt: "2026-11-01" } as ChangeInput;
    const s = buildWeeklySummary({ follows: ["visa:h-1b"], today: "2026-10-16" }, [soon, far, proposal]);
    expect(s.comingUp.map((c) => c.date)).toEqual(["2026-11-20"]);
    expect(buildWeeklySummary({ follows: ["visa:f-1"], today: "2026-10-16" }, [soon]).comingUp).toEqual([]);
  });

  it("escapes record titles in HTML", () => {
    const hostile = { ...BIOMETRIC_FEE, id: "federal_register:2099-24", publishedAt: "2026-10-15", title: "<img src=x onerror=alert(1)> H-1B" } as ChangeInput;
    const html = render(buildWeeklySummary({ follows: ["visa:h-1b"], today: "2026-10-16" }, [hostile])).html;
    expect(html).not.toContain("<img src=x");
  });
});

describe("sending the summary", () => {
  const MONDAY = Date.UTC(2026, 9, 19, 13, 30) / 1000;
  const TUESDAY = Date.UTC(2026, 9, 20, 13, 30) / 1000;

  async function setup(over: { follows?: string[]; prefs?: object; paused?: boolean } = {}) {
    const store = new MemoryStore();
    await store.putSubscriber("k1", { email: "p@example.com", customerId: "c", status: "active", currentPeriodEnd: MONDAY + 86400 * 30, updatedAt: MONDAY });
    await store.putWatchlist("k1", { entityIds: over.follows ?? ["visa:h-1b"], updatedAt: MONDAY });
    await store.putAlertCursor("k1", serializeCursor({ lastChangeDate: "2026-10-01", sent: [], ...(over.paused ? { pausedAt: 1 } : {}) }));
    // The summary is opt-in; these tests start from a subscriber who turned it on.
    await store.putProDoc("prefs", "k1", serializePrefs({ ...DEFAULT_PREFS, summary: true, ...over.prefs }));
    const sent: string[] = [];
    let fail = false;
    const sender: SendAlert = async (_to, mail, key) => {
      if (fail) return { ok: false, detail: "down" };
      sent.push(`${key}|${mail.subject}`);
      return { ok: true };
    };
    const run = (now: number, send = true) =>
      runWeeklySummaries({
        store,
        nowSeconds: now,
        secret: "s".repeat(64),
        origin: ORIGIN,
        testMode: false,
        send,
        sender,
        build: (follows, savedIds, today) => buildWeeklySummary({ follows, savedIds, today }),
        render: renderWeeklyEmail,
      });
    return { store, sent, run, setFail: (v: boolean) => (fail = v) };
  }

  it("sends on Mondays only, once per week, and records it in history", async () => {
    const { store, sent, run } = await setup();
    expect((await run(TUESDAY)).notDue).toBe(true);
    expect(sent).toHaveLength(0);
    expect((await run(MONDAY)).sent).toBe(1);
    expect((await run(MONDAY)).alreadySent).toBe(1);
    expect(sent).toHaveLength(1);
    const h = parseHistory(await store.getProDoc("history", "k1"));
    expect(h[0].items[0]).toMatchObject({ kind: "weekly_summary", href: "/briefing" });
  });

  it("respects the summary switch, paused alerts and an empty watchlist", async () => {
    expect((await (await setup({ prefs: { summary: false } })).run(MONDAY)).off).toBe(1);
    expect((await (await setup({ paused: true })).run(MONDAY)).off).toBe(1);
    expect((await (await setup({ follows: [] })).run(MONDAY)).noFollows).toBe(1);
  });

  it("is opt-in: nobody gets it without turning it on, including prefs saved before the setting existed", async () => {
    expect(DEFAULT_PREFS.summary).toBe(false);
    const fresh = new MemoryStore();
    await fresh.putSubscriber("k1", { email: "p@example.com", customerId: "c", status: "active", currentPeriodEnd: MONDAY + 86400 * 30, updatedAt: MONDAY });
    await fresh.putWatchlist("k1", { entityIds: ["visa:h-1b"], updatedAt: MONDAY });
    await fresh.putAlertCursor("k1", serializeCursor({ lastChangeDate: "2026-10-01", sent: [] }));
    const legacy = new MemoryStore();
    await legacy.putSubscriber("k1", { email: "p@example.com", customerId: "c", status: "active", currentPeriodEnd: MONDAY + 86400 * 30, updatedAt: MONDAY });
    await legacy.putWatchlist("k1", { entityIds: ["visa:h-1b"], updatedAt: MONDAY });
    await legacy.putAlertCursor("k1", serializeCursor({ lastChangeDate: "2026-10-01", sent: [] }));
    await legacy.putProDoc("prefs", "k1", JSON.stringify({ frequency: "weekly", relevance: "all", reminders: true, calendarVersion: 1 }));
    for (const store of [fresh, legacy]) {
      const sent: string[] = [];
      const report = await runWeeklySummaries({
        store,
        nowSeconds: MONDAY,
        secret: "s".repeat(64),
        origin: ORIGIN,
        testMode: false,
        send: true,
        sender: async (_to, mail, key) => (sent.push(`${key}|${mail.subject}`), { ok: true }),
        build: (follows, savedIds, today) => buildWeeklySummary({ follows, savedIds, today }),
        render: renderWeeklyEmail,
      });
      expect(report.off).toBe(1);
      expect(sent).toEqual([]);
    }
  });

  it("retries a failed send on the next run, and a dry run sends nothing", async () => {
    const s = await setup();
    expect((await s.run(MONDAY, false)).ready).toBe(1);
    expect(s.sent).toHaveLength(0);
    s.setFail(true);
    expect((await s.run(MONDAY)).failed).toBe(1);
    s.setFail(false);
    expect((await s.run(MONDAY)).sent).toBe(1);
  });
});

describe("one Monday email: the weekly digest and the summary", () => {
  const MONDAY = Date.UTC(2026, 9, 19, 13, 30) / 1000;
  const DATA = { events: EVENT_INDEX, warnEmployers: [], h1bEmployers: [], fiscalYear: "" };

  async function subscriber(prefs: object) {
    const store = new MemoryStore();
    await store.putSubscriber("k1", { email: "p@example.com", customerId: "c", status: "active", currentPeriodEnd: MONDAY + 86400 * 30, updatedAt: MONDAY });
    await store.putWatchlist("k1", { entityIds: ["agency:uscis"], updatedAt: MONDAY });
    await store.putAlertCursor("k1", serializeCursor({ lastChangeDate: "2026-10-01", sent: [] }));
    await store.putProDoc("prefs", "k1", serializePrefs({ ...DEFAULT_PREFS, ...prefs }));
    const mails: { key: string; subject: string; text: string }[] = [];
    const sender: SendAlert = async (_to, mail, key) => (mails.push({ key, subject: mail.subject, text: mail.text }), { ok: true });
    const common = { store, nowSeconds: MONDAY, secret: "s".repeat(64), origin: ORIGIN, testMode: false, send: true, sender };
    // The order the cron runs them in.
    const monday = async (intelligence = true) => {
      const alerts = await runAlerts({ ...common, data: DATA, briefing: true, summary: intelligence });
      const summary = intelligence
        ? await runWeeklySummaries({
            ...common,
            build: (follows, savedIds, today) => buildWeeklySummary({ follows, savedIds, today }),
            render: renderWeeklyEmail,
            alertData: DATA,
          })
        : null;
      return { alerts, summary };
    };
    return { store, mails, monday };
  }

  it("weekly digest + summary: one email that carries the digest, cursor and history advanced", async () => {
    const s = await subscriber({ frequency: "weekly", summary: true });
    const { alerts, summary } = await s.monday();
    expect(alerts.inSummary).toBe(1);
    expect(alerts.sent).toBe(0);
    expect(summary!.sent).toBe(1);
    expect(summary!.withDigest).toBe(1);
    expect(s.mails).toHaveLength(1);
    expect(s.mails[0].subject).toMatch(/\d+ alerts?/);
    expect(s.mails[0].text).toContain("YOUR ALERTS THIS WEEK");

    const h = parseHistory(await s.store.getProDoc("history", "k1"));
    expect(h).toHaveLength(1);
    expect(h[0].items[0].kind).toBe("weekly_summary");
    expect(h[0].items.length).toBeGreaterThan(1);

    // A second run the same day sends nothing more, and the alerts are not owed again.
    await s.monday();
    expect(s.mails).toHaveLength(1);
    const cursor = JSON.parse((await s.store.getAlertCursor("k1"))!);
    expect(cursor.lastChangeDate > "2026-10-01").toBe(true);
  });

  it("weekly digest without the summary: the digest goes as before, and no summary", async () => {
    const s = await subscriber({ frequency: "weekly", summary: false });
    const { alerts, summary } = await s.monday();
    expect(alerts.sent).toBe(1);
    expect(summary!.off).toBe(1);
    expect(s.mails).toHaveLength(1);
    expect(s.mails[0].text).not.toContain("YOUR ALERTS THIS WEEK");
  });

  it("daily alerts + summary: daily alerts unchanged, the summary is its own email", async () => {
    const s = await subscriber({ frequency: "daily", summary: true });
    const { alerts, summary } = await s.monday();
    expect(alerts.inSummary).toBe(0);
    expect(alerts.sent).toBe(1);
    expect(summary!.sent).toBe(1);
    expect(summary!.withDigest).toBe(0);
    expect(s.mails[1].text).not.toContain("YOUR ALERTS THIS WEEK");
  });

  it("with Intelligence off, a weekly digest is sent as before whatever the stored setting", async () => {
    const s = await subscriber({ frequency: "weekly", summary: true });
    const { alerts } = await s.monday(false);
    expect(alerts.inSummary).toBe(0);
    expect(alerts.sent).toBe(1);
  });
});
