// =============================================================================
// PRO BRIEFING
//
// The first Pro release built on the Monitor: a personal feed and effective-
// date timeline from the synced watchlist, saved changes, downloadable briefs,
// a private calendar feed, delivery preferences and alert history.
//
// What these tests hold:
//   • behind a flag: every route is a 404 while it is off, and the alert job
//     with the flag off behaves exactly as it did before Briefing;
//   • only real records: saves are limited to archive ids, every link points
//     at a change page that exists, and nothing is dated that the record does
//     not date;
//   • privacy: only ids and delivery settings are stored, the calendar link is
//     revocable, and erase removes what Briefing keeps.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAlertBatch, isPriorityEvent, reminderAlerts, serializeCursor } from "@/lib/billing/alerts";
import { runAlerts, type SendAlert } from "@/lib/billing/alert-run";
import { COOKIE_NAME, sign } from "@/lib/billing/entitlement";
import { MemoryStore, emailKey, type SubscriberRecord } from "@/lib/billing/store";
import { EVENTS } from "@/lib/event-store";
import type { IndexedEvent } from "@/lib/event-index";
import { flagOn } from "@/lib/flags";
import { changeSlug, changePath } from "@/lib/share";
import { buildCalendar, calendarToken, calendarUrl, parseCalendarToken, verifyCalendarToken } from "@/lib/pro/calendar";
import { renderBriefHtml, renderBriefMarkdown, BRIEF_DISCLAIMER } from "@/lib/pro/export";
import { buildBriefing, savedBriefs } from "@/lib/pro/feed";
import { appendHistory, MAX_HISTORY, parseHistory } from "@/lib/pro/history";
import { DEFAULT_PREFS, digestDue, parsePrefs, sanitizePrefs } from "@/lib/pro/prefs";
import { MAX_SAVED, isChangeIdShape, parseSaved, setSaved } from "@/lib/pro/saved";
import { matchFollows } from "@/lib/intelligence/inbox";
import { toPublicChange, type ChangeInput } from "@/lib/intelligence/change";

const shared = vi.hoisted(() => ({ store: null as unknown }));
vi.mock("@/lib/billing/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/store")>();
  return { ...actual, resolveStore: () => shared.store };
});

const SECRET = "s".repeat(64);
const ORIGIN = "https://immigrationclock.com";
const NOW = Math.floor(Date.now() / 1000);
const REAL_PAGES = new Set(EVENTS.map((e) => `/what-changed/${changeSlug(e)}`));

function event(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: "federal_register:2026-1",
    title: "A rule about H-1B petitions",
    publishedAt: "2026-10-01",
    effectiveAt: null,
    scheduled: false,
    severity: "notable",
    classification: "final_rule",
    sourceKey: "federal_register",
    sourceUrl: "https://www.federalregister.gov/x",
    summary: "Something changed.",
    entityIds: ["visa:h-1b", "agency:uscis"],
    ...over,
  };
}

const DATA = (events: IndexedEvent[]) => ({ events, warnEmployers: [], h1bEmployers: [], fiscalYear: "" });

function subscriber(over: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return { email: "pro@example.com", customerId: "cus_1", status: "active", currentPeriodEnd: NOW + 30 * 86400, updatedAt: NOW, ...over };
}

/** A real record with a strong visa or country classification and a stated effective date. */
function realDatedRecord(): { input: ChangeInput; follow: string } {
  for (const e of EVENTS as unknown as ChangeInput[]) {
    if (!e.effectiveAt) continue;
    const pub = toPublicChange(e, "2000-01-01");
    // The issuing agency is always a primary match, so the record is eligible
    // for the timeline and the calendar.
    const follow = pub.agency ? `agency:${pub.agency}` : null;
    if (follow) return { input: e, follow };
  }
  throw new Error("no dated, classified record in the archive");
}

// -----------------------------------------------------------------------------

describe("flag", () => {
  it("is on only for the exact string true", () => {
    expect(flagOn("pro_briefing", {})).toBe(false);
    expect(flagOn("pro_briefing", { FEATURE_PRO_BRIEFING: "1" })).toBe(false);
    expect(flagOn("pro_briefing", { FEATURE_PRO_BRIEFING: "true" })).toBe(true);
  });
});

describe("preferences", () => {
  it("default to the alert job's existing behaviour: daily, every match, no reminders", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toMatchObject({ frequency: "daily", relevance: "all", reminders: false });
  });

  it("keep only known values, and survive garbage", () => {
    expect(parsePrefs("{nope")).toEqual(DEFAULT_PREFS);
    const p = sanitizePrefs({ frequency: "hourly", relevance: "priority", reminders: "yes", extra: 1 }, DEFAULT_PREFS);
    expect(p).toEqual({ ...DEFAULT_PREFS, relevance: "priority" });
    expect(Object.keys(p).sort()).toEqual(["calendarVersion", "frequency", "relevance", "reminders"]);
  });

  it("make a weekly digest due on Mondays only", () => {
    const monday = Date.UTC(2026, 9, 12) / 1000;
    const tuesday = Date.UTC(2026, 9, 13) / 1000;
    const weekly = { ...DEFAULT_PREFS, frequency: "weekly" as const };
    expect(digestDue(weekly, monday)).toBe(true);
    expect(digestDue(weekly, tuesday)).toBe(false);
    expect(digestDue(DEFAULT_PREFS, tuesday)).toBe(true);
  });
});

describe("saved changes", () => {
  it("accept every real record id shape and refuse free text", () => {
    expect(EVENTS.every((e) => isChangeIdShape(e.id))).toBe(true);
    expect(isChangeIdShape("my case number is ABC123")).toBe(false);
    expect(isChangeIdShape(42)).toBe(false);
  });

  it("save newest first, unsave, ignore duplicates and refuse past the cap", () => {
    let items = setSaved([], "a:1", true, 1).items;
    items = setSaved(items, "a:2", true, 2).items;
    expect(items.map((i) => i.id)).toEqual(["a:2", "a:1"]);
    expect(setSaved(items, "a:2", true, 3).items).toEqual(items);
    expect(setSaved(items, "a:1", false, 4).items.map((i) => i.id)).toEqual(["a:2"]);
    const full = Array.from({ length: MAX_SAVED }, (_, i) => ({ id: `a:${i}`, savedAt: i }));
    const r = setSaved(full, "b:1", true, 9);
    expect(r.full).toBe(true);
    expect(r.items).toHaveLength(MAX_SAVED);
  });

  it("drop malformed stored entries", () => {
    expect(parseSaved(JSON.stringify([{ id: "ab:1", savedAt: 1 }, { id: "bad id", savedAt: 2 }, { id: "ab:1", savedAt: 3 }]))).toEqual([
      { id: "ab:1", savedAt: 1 },
    ]);
    expect(parseSaved("{")).toEqual([]);
  });
});

describe("alert history", () => {
  it("records what was sent, newest first, capped", () => {
    let h = appendHistory([], [{ kind: "change", id: "change:x", matched: [], title: "T", detail: "", href: "/what-changed/t-abc123", date: "2026-10-01" }], 10);
    expect(h[0]).toEqual({ sentAt: 10, items: [{ id: "change:x", kind: "change", title: "T", href: "/what-changed/t-abc123", date: "2026-10-01" }] });
    for (let i = 0; i < MAX_HISTORY + 5; i++) h = appendHistory(h, [], i);
    expect(h).toHaveLength(MAX_HISTORY);
    expect(parseHistory(JSON.stringify(h))).toHaveLength(MAX_HISTORY);
  });
});

// -----------------------------------------------------------------------------
// ALERT SELECTION
// -----------------------------------------------------------------------------

describe("alert selection with Briefing preferences", () => {
  const TODAY = "2026-10-16";

  it("without options is unchanged: every match, no reminders", () => {
    const dated = event({ id: "federal_register:2", effectiveAt: "2026-10-20" });
    const batch = buildAlertBatch(DATA([dated]), ["visa:h-1b"], {});
    expect(batch.alerts.map((a) => a.kind)).toEqual(["change"]);
  });

  it("priority keeps major changes and ones taking effect within the window", () => {
    expect(isPriorityEvent(event({ severity: "major" }), TODAY, 30)).toBe(true);
    expect(isPriorityEvent(event({ effectiveAt: "2026-11-01" }), TODAY, 30)).toBe(true);
    expect(isPriorityEvent(event({ effectiveAt: "2027-03-01" }), TODAY, 30)).toBe(false);
    expect(isPriorityEvent(event({ effectiveAt: "2026-10-01" }), TODAY, 30)).toBe(false);
    expect(isPriorityEvent(event(), TODAY, 30)).toBe(false);

    const batch = buildAlertBatch(
      DATA([event({ id: "a:1" }), event({ id: "a:2", severity: "major" })]),
      ["visa:h-1b"],
      {},
      { today: TODAY, relevance: "priority" }
    );
    expect(batch.alerts.map((a) => a.id)).toEqual(["change:a:2"]);
  });

  it("reminds once, a week out, only for followed changes with a stated date", () => {
    const events = [
      event({ id: "a:soon", effectiveAt: "2026-10-20" }),
      event({ id: "a:far", effectiveAt: "2026-12-20" }),
      event({ id: "a:past", effectiveAt: "2026-10-01" }),
      event({ id: "a:undated" }),
      event({ id: "a:unfollowed", effectiveAt: "2026-10-18", entityIds: ["country:mexico"] }),
    ];
    const r = reminderAlerts(events, ["visa:h-1b"], {}, TODAY, 7);
    expect(r.map((a) => a.id)).toEqual(["effective:a:soon:2026-10-20"]);
    expect(r[0].title).toMatch(/^Takes effect in 4 days: /);
    expect(r[0].href).toBe(changePath(events[0]));
    // Already sent: never again.
    expect(reminderAlerts(events, ["visa:h-1b"], { sent: [r[0].id] }, TODAY, 7)).toEqual([]);
  });

  it("puts reminders first and does not let them move the change cursor", () => {
    const batch = buildAlertBatch(
      DATA([event({ id: "a:new", publishedAt: "2026-10-15" }), event({ id: "a:soon", publishedAt: "2026-09-01", effectiveAt: "2026-10-20" })]),
      ["visa:h-1b"],
      { lastChangeDate: "2026-10-10" },
      { today: TODAY, remindWithinDays: 7 }
    );
    expect(batch.alerts.map((a) => a.kind)).toEqual(["effective_reminder", "change"]);
    expect(batch.cursor.lastChangeDate).toBe("2026-10-15");
  });

  it("links every real alert to a change page that exists", () => {
    const real = EVENTS.slice(0, 50).map((e) =>
      event({ id: e.id, title: e.title, publishedAt: "2099-01-01", entityIds: ["visa:h-1b"] })
    );
    const batch = buildAlertBatch(DATA(real), ["visa:h-1b"], {}, 50);
    expect(batch.alerts.length).toBeGreaterThan(0);
    for (const a of batch.alerts) expect(REAL_PAGES.has(a.href)).toBe(true);
  });
});

describe("the alert job with Briefing", () => {
  const MONDAY = Date.UTC(2026, 9, 12, 13, 30) / 1000;
  const TUESDAY = Date.UTC(2026, 9, 13, 13, 30) / 1000;

  async function setup(prefs?: object) {
    const store = new MemoryStore();
    await store.putSubscriber("k1", subscriber({ currentPeriodEnd: MONDAY + 30 * 86400 }));
    await store.putWatchlist("k1", { entityIds: ["visa:h-1b"], updatedAt: MONDAY });
    await store.putAlertCursor("k1", serializeCursor({ lastChangeDate: "2026-10-01", sent: [] }));
    if (prefs) await store.putProDoc("prefs", "k1", JSON.stringify({ ...DEFAULT_PREFS, ...prefs }));
    const calls: string[] = [];
    const sender: SendAlert = async (_to, _mail, key) => {
      calls.push(key);
      return { ok: true };
    };
    return { store, calls, sender };
  }

  const run = (store: MemoryStore, now: number, extra: object) =>
    runAlerts({
      store,
      nowSeconds: now,
      data: DATA([event({ publishedAt: "2026-10-05" })]),
      secret: SECRET,
      origin: ORIGIN,
      testMode: false,
      ...extra,
    });

  it("holds a weekly digest until Monday, then sends and records it", async () => {
    const { store, calls, sender } = await setup({ frequency: "weekly" });
    const tue = await run(store, TUESDAY, { send: true, sender, briefing: true });
    expect(tue.notDue).toBe(1);
    expect(calls).toHaveLength(0);
    const mon = await run(store, MONDAY, { send: true, sender, briefing: true });
    expect(mon.sent).toBe(1);
    const history = parseHistory(await store.getProDoc("history", "k1"));
    expect(history).toHaveLength(1);
    expect(history[0].items[0].title).toBe("A rule about H-1B petitions");
  });

  it("with the flag off ignores preferences and writes no history", async () => {
    const { store, calls, sender } = await setup({ frequency: "weekly" });
    const report = await run(store, TUESDAY, { send: true, sender, briefing: false });
    expect(report.sent).toBe(1);
    expect(calls).toHaveLength(1);
    expect(await store.getProDoc("history", "k1")).toBeNull();
  });

  it("a dry run records nothing", async () => {
    const { store } = await setup();
    const report = await run(store, MONDAY, { briefing: true });
    expect(report.ready).toBe(1);
    expect(await store.getProDoc("history", "k1")).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// FEED, TIMELINE, EXPORT, CALENDAR — against the real archive
// -----------------------------------------------------------------------------

describe("the Briefing feed", () => {
  it("holds only followed or saved changes, each linked to a real page", () => {
    const { input, follow } = realDatedRecord();
    const today = input.effectiveAt!.slice(0, 10);
    const b = buildBriefing({ follows: [follow], savedIds: [], today });
    expect(b.feed.length).toBeGreaterThan(0);
    for (const item of b.feed) {
      expect(item.matched.length > 0 || item.saved).toBe(true);
      expect(REAL_PAGES.has(item.path)).toBe(true);
    }
    expect(b.limitations.join(" ")).toMatch(/not legal advice/);
  });

  it("is empty for an empty watchlist and nothing saved", () => {
    expect(buildBriefing({ follows: [], savedIds: [], today: "2026-10-16" }).feed).toEqual([]);
  });

  it("puts only stated, future effective dates on the timeline, on strong matches", () => {
    const { input, follow } = realDatedRecord();
    const effective = input.effectiveAt!.slice(0, 10);
    const dayBefore = new Date(Date.parse(effective) - 86_400_000).toISOString().slice(0, 10);
    const b = buildBriefing({ follows: [follow], savedIds: [], today: dayBefore });
    const hit = b.timeline.find((t) => t.recordId === input.id);
    expect(hit?.daysUntil).toBe(1);
    for (const t of b.timeline) {
      expect(t.daysUntil).toBeGreaterThanOrEqual(0);
      expect(t.effectiveDate >= dayBefore).toBe(true);
      expect(REAL_PAGES.has(t.path)).toBe(true);
      if (!t.saved) {
        const pub = toPublicChange((EVENTS as unknown as ChangeInput[]).find((e) => e.id === t.recordId)!, dayBefore);
        expect(matchFollows(pub, [follow])).toEqual([follow]);
      }
    }
    // The day after, it is gone.
    const after = new Date(Date.parse(effective) + 86_400_000).toISOString().slice(0, 10);
    expect(buildBriefing({ follows: [follow], savedIds: [], today: after }).timeline.some((t) => t.recordId === input.id)).toBe(false);
  });

  it("includes a saved change whatever is followed, and skips unknown saved ids", () => {
    const { input } = realDatedRecord();
    const b = buildBriefing({ follows: [], savedIds: [input.id], today: input.effectiveAt!.slice(0, 10) });
    expect(b.timeline.some((t) => t.recordId === input.id && t.saved)).toBe(true);
    expect(savedBriefs(["federal_register:does-not-exist", input.id], "2026-10-16").map((s) => s.change.recordId)).toEqual([input.id]);
  });
});

describe("the brief export", () => {
  const today = "2026-10-16";
  const entries = savedBriefs(EVENTS.slice(0, 3).map((e) => e.id), today);

  it("carries source, dates, record link, review state and the disclaimer for every record", () => {
    const text = renderBriefMarkdown({ title: "Brief", generatedAt: today, origin: ORIGIN, entries });
    expect(text).toContain(BRIEF_DISCLAIMER);
    for (const { change, path } of entries) {
      expect(text).toContain(change.source.url);
      expect(text).toContain(`**Published:** ${change.publishedDate}`);
      expect(text).toContain(`${ORIGIN}${path}`);
    }
    expect(text).toMatch(/Classified automatically|Reviewed by a person/);
  });

  it("escapes document text in HTML and never links a non-http URL", () => {
    const [first] = entries;
    const hostile = {
      ...first,
      change: { ...first.change, title: `<script>alert(1)</script>`, source: { ...first.change.source, url: "javascript:alert(1)" } },
    };
    const html = renderBriefHtml({ title: "B", generatedAt: today, origin: ORIGIN, entries: [hostile] });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('<meta name="robots" content="noindex">');
  });
});

describe("the calendar feed", () => {
  it("signs a revocable token over key and version", async () => {
    const key = emailKey("pro@example.com", SECRET);
    const token = calendarToken(key, 3, SECRET);
    expect(parseCalendarToken(token)).toMatchObject({ key, version: 3 });
    expect(await verifyCalendarToken(token, SECRET, async () => 3)).toBe(key);
    // Revoked: the stored version moved on.
    expect(await verifyCalendarToken(token, SECRET, async () => 4)).toBeNull();
    // Tampered.
    expect(await verifyCalendarToken(calendarToken(key, 3, "other".repeat(13)), SECRET, async () => 3)).toBeNull();
    expect(await verifyCalendarToken("garbage", SECRET, async () => 3)).toBeNull();
    expect(calendarUrl(ORIGIN, key, 3, SECRET)).toBe(`${ORIGIN}/api/pro/calendar/${token}.ics`);
  });

  it("writes valid all-day events, escaped and folded", () => {
    const ics = buildCalendar(
      [
        {
          recordId: "federal_register:1",
          path: "/what-changed/x-abc123",
          title: "Rule; with, commas and a very long title that will certainly need folding across more than one line of output",
          effectiveDate: "2026-12-31",
          daysUntil: 10,
          publishedDate: "2026-10-01",
          status: "scheduled",
          sourceName: "Federal Register",
          sourceUrl: "https://www.federalregister.gov/x",
          matched: ["visa:h-1b"],
          saved: false,
        },
      ],
      { origin: ORIGIN, now: new Date(Date.UTC(2026, 9, 16)) }
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231");
    expect(ics).toContain("DTEND;VALUE=DATE:20270101");
    expect(ics).toContain("Rule\\; with\\, commas");
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});

// -----------------------------------------------------------------------------
// ROUTES
// -----------------------------------------------------------------------------

describe("the Briefing routes", () => {
  const ENV = ["FEATURE_PRO_BRIEFING", "BILLING_SESSION_SECRET"] as const;
  const saved: Record<string, string | undefined> = {};
  let store: MemoryStore;
  const email = "pro@example.com";

  function cookieFor(plan: "pro" | "free" = "pro") {
    const value = sign({ plan, email, customerId: "cus_1", exp: NOW + 86400 }, SECRET, NOW);
    return `${COOKIE_NAME}=${value}`;
  }
  const req = (path: string, init: RequestInit = {}, cookie = cookieFor()) =>
    new Request(`${ORIGIN}${path}`, { ...init, headers: { cookie, "content-type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` } });

  beforeEach(async () => {
    for (const k of ENV) saved[k] = process.env[k];
    process.env.BILLING_SESSION_SECRET = SECRET;
    process.env.FEATURE_PRO_BRIEFING = "true";
    store = new MemoryStore();
    shared.store = store;
    await store.putSubscriber(emailKey(email, SECRET), subscriber());
  });
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("are 404 while the flag is off", async () => {
    delete process.env.FEATURE_PRO_BRIEFING;
    const { GET } = await import("@/app/api/pro/saved/route");
    expect((await GET(req("/api/pro/saved"))).status).toBe(404);
    const prefs = await import("@/app/api/pro/prefs/route");
    expect((await prefs.GET(req("/api/pro/prefs"))).status).toBe(404);
  });

  it("refuse a signed-out reader and a lapsed subscriber", async () => {
    const { GET } = await import("@/app/api/pro/saved/route");
    expect((await GET(req("/api/pro/saved", {}, ""))).status).toBe(401);
    await store.putSubscriber(emailKey(email, SECRET), subscriber({ currentPeriodEnd: NOW - 10 }));
    expect((await GET(req("/api/pro/saved"))).status).toBe(402);
  });

  it("save only real changes, and round-trip them", async () => {
    const { GET, POST } = await import("@/app/api/pro/saved/route");
    const id = EVENTS[0].id;
    expect((await POST(req("/api/pro/saved", { method: "POST", body: JSON.stringify({ id: "federal_register:nope", saved: true }) }))).status).toBe(404);
    expect((await POST(req("/api/pro/saved", { method: "POST", body: JSON.stringify({ id: "free text here", saved: true }) }))).status).toBe(400);
    expect((await POST(req("/api/pro/saved", { method: "POST", body: JSON.stringify({ id, saved: true }) }))).status).toBe(200);
    const body = (await (await GET(req("/api/pro/saved"))).json()) as { items: { id: string }[] };
    expect(body.items.map((i) => i.id)).toEqual([id]);
  });

  it("revoke the calendar link on reset, and never take a version from the body", async () => {
    const { GET, POST } = await import("@/app/api/pro/prefs/route");
    const before = (await (await GET(req("/api/pro/prefs"))).json()) as { calendarUrl: string };
    const forged = await POST(req("/api/pro/prefs", { method: "POST", body: JSON.stringify({ calendarVersion: 99, frequency: "weekly" }) }));
    const forgedBody = (await forged.json()) as { calendarUrl: string; frequency: string };
    expect(forgedBody.frequency).toBe("weekly");
    expect(forgedBody.calendarUrl).toBe(before.calendarUrl);
    const reset = (await (await POST(req("/api/pro/prefs", { method: "POST", body: JSON.stringify({ resetCalendar: true }) }))).json()) as { calendarUrl: string };
    expect(reset.calendarUrl).not.toBe(before.calendarUrl);

    const cal = await import("@/app/api/pro/calendar/[token]/route");
    const tokenOf = (url: string) => url.split("/api/pro/calendar/")[1];
    const calReq = (t: string) => new Request(`${ORIGIN}/api/pro/calendar/${t}`, { headers: { "x-forwarded-for": "10.9.9.9" } });
    expect((await cal.GET(calReq(tokenOf(before.calendarUrl)), { params: { token: tokenOf(before.calendarUrl) } })).status).toBe(404);
    const ok = await cal.GET(calReq(tokenOf(reset.calendarUrl)), { params: { token: tokenOf(reset.calendarUrl) } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toMatch(/text\/calendar/);
    expect(await ok.text()).toContain("BEGIN:VCALENDAR");
  });

  it("serve a downloadable brief of saved changes", async () => {
    const saved = await import("@/app/api/pro/saved/route");
    await saved.POST(req("/api/pro/saved", { method: "POST", body: JSON.stringify({ id: EVENTS[0].id, saved: true }) }));
    const { GET } = await import("@/app/api/pro/brief/route");
    const md = await GET(req("/api/pro/brief?scope=saved&format=md"));
    expect(md.status).toBe(200);
    expect(md.headers.get("content-disposition")).toMatch(/attachment; filename="immigrationclock-saved-/);
    expect(await md.text()).toContain(EVENTS[0].title.slice(0, 20));
    expect((await GET(req("/api/pro/brief?format=pdf"))).status).toBe(400);
  });

  it("erase what Briefing keeps, and the old calendar link with it", async () => {
    const key = emailKey(email, SECRET);
    await store.putProDoc("saved", key, JSON.stringify([{ id: EVENTS[0].id, savedAt: 1 }]));
    await store.putProDoc("history", key, JSON.stringify([{ sentAt: 1, items: [] }]));
    const { DELETE } = await import("@/app/api/pro/data/route");
    expect((await DELETE(req("/api/pro/data", { method: "DELETE" }))).status).toBe(200);
    expect(await store.getProDoc("saved", key)).toBeNull();
    expect(await store.getProDoc("history", key)).toBeNull();
    expect(parsePrefs(await store.getProDoc("prefs", key)).calendarVersion).toBe(2);
    // The watchlist and the subscription are untouched.
    expect(await store.getSubscriber(key)).not.toBeNull();
  });
});
