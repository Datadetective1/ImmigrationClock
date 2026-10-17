// =============================================================================
// PRO WATCHLIST ALERTS — delivery
//
// alerts.ts decides WHAT may be said (tests/billing-alerts.test.ts). These
// tests cover who receives it, when, how often and how they stop it:
//
//   • only a subscriber the store says is paying, never a free or lapsed one
//   • nothing on the first run, so the archive is never replayed as "new"
//   • a dry run sends nothing and moves nothing
//   • a sent batch is never sent again; a failed one is retried
//   • unsubscribe works from a signed link, and a forged one does nothing
//   • the cron route refuses without CRON_SECRET, and sends only on ALERTS_SEND
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCursor, serializeCursor, type AlertCursor } from "@/lib/billing/alerts";
import { buildAlertEmail } from "@/lib/billing/alert-email";
import {
  cronAuthorized,
  runAlerts,
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
  type SendAlert,
} from "@/lib/billing/alert-run";
import { billingStatus } from "@/lib/billing/config";
import { CAPABILITY_BY_ID } from "@/lib/billing/plans";
import { MemoryStore, type SubscriberRecord } from "@/lib/billing/store";
import type { IndexedEvent } from "@/lib/event-index";

const shared = vi.hoisted(() => ({ store: null as unknown }));
vi.mock("@/lib/billing/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/store")>();
  return { ...actual, resolveStore: () => shared.store };
});

const NOW = Date.UTC(2026, 9, 14, 13, 30) / 1000;
const SECRET = "s".repeat(64);
const ORIGIN = "https://immigrationclock.com";

function event(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: "federal_register:2026-500",
    title: "H-1B registration rule",
    publishedAt: "2026-10-15",
    effectiveAt: null,
    scheduled: false,
    severity: "major",
    classification: "final_rule",
    sourceKey: "federal_register",
    sourceUrl: "https://www.federalregister.gov/x",
    summary: "Something changed.",
    entityIds: ["visa:h-1b", "agency:uscis"],
    ...over,
  };
}

function subscriber(over: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return {
    email: "pro@example.com",
    customerId: "cus_1",
    status: "active",
    currentPeriodEnd: NOW + 30 * 86400,
    updatedAt: NOW,
    ...over,
  };
}

async function seed(store: MemoryStore, key: string, record: SubscriberRecord, follows: string[], cursor?: AlertCursor) {
  await store.putSubscriber(key, record);
  await store.putWatchlist(key, { entityIds: follows, updatedAt: NOW });
  if (cursor) await store.putAlertCursor(key, serializeCursor(cursor));
}

function recorder() {
  const calls: { to: string; subject: string; key: string; headers: Record<string, string> }[] = [];
  const sender: SendAlert = async (to, mail, key) => {
    calls.push({ to, subject: mail.subject, key, headers: mail.headers });
    return { ok: true };
  };
  return { calls, sender };
}

const base = (store: MemoryStore, extra: Partial<Parameters<typeof runAlerts>[0]> = {}) => ({
  store,
  nowSeconds: NOW,
  data: { events: [event()], warnEmployers: [], h1bEmployers: [], fiscalYear: "" },
  secret: SECRET,
  origin: ORIGIN,
  testMode: false,
  ...extra,
});

describe("who receives an alert", () => {
  it("only an active, paid-up subscriber; never free, cancelled, lapsed or refunded", async () => {
    const store = new MemoryStore();
    const cursor = { lastChangeDate: "2026-10-01", sent: [] };
    await seed(store, "pro", subscriber(), ["visa:h-1b"], cursor);
    await seed(store, "cancelled", subscriber({ email: "c@example.com", status: "canceled" }), ["visa:h-1b"], cursor);
    await seed(store, "lapsed", subscriber({ email: "l@example.com", currentPeriodEnd: NOW - 1 }), ["visa:h-1b"], cursor);
    await seed(store, "refunded", subscriber({ email: "r@example.com", status: "refunded" }), ["visa:h-1b"], cursor);
    const { calls, sender } = recorder();

    const report = await runAlerts({ ...base(store), send: true, sender });

    expect(calls.map((c) => c.to)).toEqual(["pro@example.com"]);
    expect(report.notPro).toBe(3);
    expect(report.sent).toBe(1);
  });

  it("keeps alerting a subscriber who cancelled, until the paid period ends", async () => {
    // Cancelling in the portal sets cancel_at_period_end; Stripe keeps the
    // status "active" until the period ends. The pricing page and the terms
    // promise Pro until then, so alerts must keep arriving until then.
    const store = new MemoryStore();
    const cursor = { lastChangeDate: "2026-10-01", sent: [] };
    await seed(store, "cancelling", subscriber({ cancelAtPeriodEnd: true }), ["visa:h-1b"], cursor);
    const { calls, sender } = recorder();
    await runAlerts({ ...base(store), send: true, sender });
    expect(calls.map((c) => c.to)).toEqual(["pro@example.com"]);

    const after = new MemoryStore();
    await seed(after, "ended", subscriber({ cancelAtPeriodEnd: true, currentPeriodEnd: NOW - 1 }), ["visa:h-1b"], cursor);
    const later = recorder();
    const report = await runAlerts({ ...base(after), send: true, sender: later.sender });
    expect(later.calls).toEqual([]);
    expect(report.notPro).toBe(1);
  });

  it("starts a new subscriber from today and sends nothing on the first run", async () => {
    const store = new MemoryStore();
    await seed(store, "new", subscriber(), ["visa:h-1b"]);
    const { calls, sender } = recorder();

    const report = await runAlerts({ ...base(store), send: true, sender });

    expect(calls).toEqual([]);
    expect(report.started).toBe(1);
    expect(parseCursor(await store.getAlertCursor("new")).lastChangeDate).toBe("2026-10-14");
  });

  it("skips a subscriber who turned alerts off, and one following nothing", async () => {
    const store = new MemoryStore();
    await seed(store, "off", subscriber(), ["visa:h-1b"], { lastChangeDate: "2026-10-01", sent: [], pausedAt: NOW - 10 });
    await seed(store, "empty", subscriber({ email: "e@example.com" }), [], { lastChangeDate: "2026-10-01", sent: [] });
    const { calls, sender } = recorder();

    const report = await runAlerts({ ...base(store), send: true, sender });

    expect(calls).toEqual([]);
    expect(report.paused).toBe(1);
    expect(report.emptyWatchlist).toBe(1);
  });
});

describe("how often", () => {
  it("a dry run sends nothing and moves no cursor", async () => {
    const store = new MemoryStore();
    const cursor = { lastChangeDate: "2026-10-01", sent: [] };
    await seed(store, "pro", subscriber(), ["visa:h-1b"], cursor);

    const report = await runAlerts(base(store));

    expect(report.mode).toBe("dry_run");
    expect(report.ready).toBe(1);
    expect(report.sent).toBe(0);
    expect(parseCursor(await store.getAlertCursor("pro"))).toEqual(cursor);
  });

  it("never sends the same change twice", async () => {
    const store = new MemoryStore();
    await seed(store, "pro", subscriber(), ["visa:h-1b"], { lastChangeDate: "2026-10-01", sent: [] });
    const { calls, sender } = recorder();

    await runAlerts({ ...base(store), send: true, sender });
    const second = await runAlerts({ ...base(store), send: true, sender });

    expect(calls).toHaveLength(1);
    expect(second.nothingNew).toBe(1);
  });

  it("retries a failed send on the next run, with the same idempotency key", async () => {
    const store = new MemoryStore();
    await seed(store, "pro", subscriber(), ["visa:h-1b"], { lastChangeDate: "2026-10-01", sent: [] });
    const keys: string[] = [];
    const failing: SendAlert = async (_to, _mail, key) => {
      keys.push(key);
      return { ok: false, detail: "Resend returned 500" };
    };
    const first = await runAlerts({ ...base(store), send: true, sender: failing });
    expect(first.failed).toBe(1);

    const { calls, sender } = recorder();
    await runAlerts({ ...base(store), send: true, sender });
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe(keys[0]);
  });

  it("keeps an unsubscribe that lands while the email is being sent", async () => {
    const store = new MemoryStore();
    await seed(store, "pro", subscriber(), ["visa:h-1b"], { lastChangeDate: "2026-10-01", sent: [] });
    const racing: SendAlert = async () => {
      const c = parseCursor(await store.getAlertCursor("pro"));
      await store.putAlertCursor("pro", serializeCursor({ ...c, pausedAt: NOW }));
      return { ok: true };
    };
    await runAlerts({ ...base(store), send: true, sender: racing });
    expect(parseCursor(await store.getAlertCursor("pro")).pausedAt).toBe(NOW);
  });
});

describe("the email", () => {
  const mail = buildAlertEmail({
    alerts: [
      {
        kind: "change",
        id: "change:x",
        matched: ["visa:h-1b"],
        title: "Rule <script>",
        detail: "final rule · federal register",
        href: "/what-changed/x",
        date: "2026-10-15",
      },
    ],
    origin: ORIGIN,
    unsubscribeUrl: unsubscribeUrl(ORIGIN, "pro", SECRET),
    testMode: false,
  });

  it("says why it arrived, links the change, and offers one-click unsubscribe", () => {
    expect(mail.text).toContain("Matched:");
    expect(mail.text).toContain(`${ORIGIN}/what-changed/x`);
    expect(mail.text).toContain("/api/billing/alerts/unsubscribe?k=pro&t=");
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(mail.headers["List-Unsubscribe"]).toContain("/api/billing/alerts/unsubscribe");
  });

  it("escapes what it renders", () => {
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("Rule &lt;script&gt;");
  });

  it("links each change's official source, in the redesign's style, with every way out", () => {
    const sourced = buildAlertEmail({
      alerts: [
        {
          kind: "change",
          id: "change:y",
          matched: ["visa:h-1b"],
          title: "A rule",
          detail: "Final rule · Federal Register · stated effective date Oct 1, 2026",
          href: "/what-changed/y",
          date: "2026-10-15",
          source: { name: "Federal Register", url: "https://www.federalregister.gov/d/2026-1" },
        },
      ],
      origin: ORIGIN,
      unsubscribeUrl: unsubscribeUrl(ORIGIN, "pro", SECRET),
      testMode: false,
    });
    expect(sourced.html).toContain('href="https://www.federalregister.gov/d/2026-1"');
    expect(sourced.text).toContain("Source: Federal Register https://www.federalregister.gov/d/2026-1");
    expect(sourced.html).toContain("#0369a1"); // the site's light accent
    for (const way of ["/following", "/account", "/api/billing/alerts/unsubscribe"]) expect(sourced.html).toContain(way);
    expect(sourced.html).toMatch(/not legal advice/);
  });
});

describe("unsubscribe tokens", () => {
  it("verifies only the token for that subscriber and secret", () => {
    const t = unsubscribeToken("pro", SECRET);
    expect(verifyUnsubscribeToken("pro", t, SECRET)).toBe(true);
    expect(verifyUnsubscribeToken("other", t, SECRET)).toBe(false);
    expect(verifyUnsubscribeToken("pro", t, "x".repeat(64))).toBe(false);
    expect(verifyUnsubscribeToken("pro", "", SECRET)).toBe(false);
  });
});

describe("the routes", () => {
  const ENV = ["CRON_SECRET", "ALERTS_SEND", "BILLING_SESSION_SECRET", "RESEND_API_KEY"] as const;
  const saved: Record<string, string | undefined> = {};
  let store: MemoryStore;

  beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k];
    process.env.BILLING_SESSION_SECRET = SECRET;
    delete process.env.CRON_SECRET;
    delete process.env.ALERTS_SEND;
    store = new MemoryStore();
    shared.store = store;
  });
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  it("the cron route refuses everyone when CRON_SECRET is unset, and a wrong bearer when it is set", async () => {
    const { GET } = await import("@/app/api/billing/alerts/run/route");
    const req = (auth?: string) =>
      new Request(`${ORIGIN}/api/billing/alerts/run`, auth ? { headers: { authorization: auth } } : {});
    // Unset: refused as not configured, so "switched off" is visible from outside.
    const off = await GET(req("Bearer anything"));
    expect(off.status).toBe(503);
    expect(JSON.stringify(await off.json())).not.toMatch(/CRON_SECRET|process\.env/);
    expect((await GET(req())).status).toBe(503);
    process.env.CRON_SECRET = "cron-secret";
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(cronAuthorized("Bearer cron-secret", "cron-secret")).toBe(true);
  });

  it("the cron route dry-runs unless ALERTS_SEND is exactly true", async () => {
    process.env.CRON_SECRET = "cron-secret";
    await seed(store, "pro", subscriber(), ["visa:h-1b"], { lastChangeDate: "2000-01-01", sent: [] });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("@/app/api/billing/alerts/run/route");
    const res = await GET(
      new Request(`${ORIGIN}/api/billing/alerts/run`, { headers: { authorization: "Bearer cron-secret" } })
    );
    const body = (await res.json()) as { report: { mode: string; sent: number } };
    expect(res.status).toBe(200);
    expect(body.report.mode).toBe("dry_run");
    expect(body.report.sent).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("opening the link changes nothing, so mail scanners cannot unsubscribe anyone", async () => {
    await store.putAlertCursor("pro", serializeCursor({ lastChangeDate: "2026-10-01", sent: [] }));
    const { GET } = await import("@/app/api/billing/alerts/unsubscribe/route");

    const res = await GET(new Request(unsubscribeUrl(ORIGIN, "pro", SECRET)));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('method="post"');
    expect(parseCursor(await store.getAlertCursor("pro")).pausedAt).toBeUndefined();

    const forged = await GET(new Request(`${ORIGIN}/api/billing/alerts/unsubscribe?k=pro&t=nope`));
    expect(forged.status).toBe(400);
  });

  it("the confirm button turns alerts off and lands on /account", async () => {
    await store.putAlertCursor("pro", serializeCursor({ lastChangeDate: "2026-10-01", sent: [] }));
    const { POST } = await import("@/app/api/billing/alerts/unsubscribe/route");
    const res = await POST(new Request(unsubscribeUrl(ORIGIN, "pro", SECRET), { method: "POST", body: "" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/account?alerts=off");
    expect(typeof parseCursor(await store.getAlertCursor("pro")).pausedAt).toBe("number");
  });

  it("RFC 8058 one-click works; a forged token changes nothing", async () => {
    await store.putAlertCursor("pro", serializeCursor({ lastChangeDate: "2026-10-01", sent: [] }));
    const { POST } = await import("@/app/api/billing/alerts/unsubscribe/route");
    const oneClick = (url: string) =>
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      });

    const forged = await POST(oneClick(`${ORIGIN}/api/billing/alerts/unsubscribe?k=pro&t=nope`));
    expect(forged.status).toBe(400);
    expect(parseCursor(await store.getAlertCursor("pro")).pausedAt).toBeUndefined();

    const res = await POST(oneClick(unsubscribeUrl(ORIGIN, "pro", SECRET)));
    expect(res.status).toBe(200);
    expect(typeof parseCursor(await store.getAlertCursor("pro")).pausedAt).toBe("number");
  });
});

describe("what Pro sells", () => {
  it("lists alerts as available, and live checkout stays shut until the job can send", () => {
    expect(CAPABILITY_BY_ID.get("watchlist_alerts")?.status).toBe("available");
    const live = {
      BILLING_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_live_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      STRIPE_PRICE_PRO_MONTHLY: "price_m",
      STRIPE_PRICE_PRO_ANNUAL: "price_a",
      BILLING_SESSION_SECRET: SECRET,
      KV_REST_API_URL: "https://kv.example",
      KV_REST_API_TOKEN: "t",
      RESEND_API_KEY: "re_x",
      CRON_SECRET: "c",
    };
    expect(billingStatus(live).checkoutReady).toBe(false);
    expect(billingStatus(live).missing).toContain("ALERTS_SEND");
    expect(billingStatus({ ...live, ALERTS_SEND: "true" }).checkoutReady).toBe(true);
    // Test keys may dry-run, so a sandbox lifecycle can be walked without mail.
    expect(billingStatus({ ...live, STRIPE_SECRET_KEY: "sk_test_x" }).checkoutReady).toBe(true);
  });
});
