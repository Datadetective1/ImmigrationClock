// =============================================================================
// PRO FEEDBACK
//
// What these tests hold:
//   • it only ever mails our own inbox: the recipient is a constant and a
//     request cannot change it;
//   • it needs a signed session, keeps the answer on the subscriber's record,
//     and is erased with the rest of what Pro keeps;
//   • nothing is required: bad or empty input is refused politely, a mail
//     outage still keeps the answer, and a daily cap stops a loop;
//   • the alert email invites a reply only when replies reach a person;
//   • the three places that ask exist, and the cancel one never blocks billing.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { readFileSync } from "node:fs";
import { COOKIE_NAME, sign } from "@/lib/billing/entitlement";
import { MemoryStore, PRO_DOC_KINDS, emailKey, type SubscriberRecord } from "@/lib/billing/store";
import { resetRateLimiter } from "@/lib/billing/http";
import { FEEDBACK_LINE, buildAlertEmail } from "@/lib/billing/alert-email";
import {
  DAILY_MAX,
  FEEDBACK_INBOX,
  MAX_KEPT,
  MAX_MESSAGE,
  appendFeedback,
  buildFeedbackEmail,
  cleanMessage,
  parseFeedbackInput,
  parseFeedbackLog,
} from "@/lib/pro/feedback";

const shared = vi.hoisted(() => ({ store: null as unknown }));
vi.mock("@/lib/billing/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/store")>();
  return { ...actual, resolveStore: () => shared.store };
});

const SECRET = "f".repeat(64);
const ORIGIN = "https://immigrationclock.com";
const NOW = Math.floor(Date.now() / 1000);
const EMAIL = "pro@example.com";

function subscriber(over: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return { email: EMAIL, customerId: "cus_1", status: "active", currentPeriodEnd: NOW + 30 * 86400, updatedAt: NOW, ...over };
}

describe("the message", () => {
  it("is trimmed, stripped of control characters and capped", () => {
    expect(cleanMessage("  hello\u0000 there\r\n  ")).toBe("hello there");
    expect(cleanMessage("a\n\n\n\nb")).toBe("a\n\nb");
    expect(cleanMessage("x".repeat(MAX_MESSAGE + 50))?.length).toBe(MAX_MESSAGE);
    expect(cleanMessage(" ")).toBeNull();
    expect(cleanMessage(42)).toBeNull();
  });

  it("must come from a known place", () => {
    expect(parseFeedbackInput({ source: "briefing", message: "More countries" })).toEqual({
      ok: true,
      source: "briefing",
      message: "More countries",
    });
    expect(parseFeedbackInput({ source: "anywhere", message: "hi there" }).ok).toBe(false);
    expect(parseFeedbackInput({ source: "cancel", message: "" }).ok).toBe(false);
    expect(parseFeedbackInput(null).ok).toBe(false);
  });

  it("is kept newest first and capped on the record", () => {
    let raw: string | null = null;
    for (let i = 0; i < MAX_KEPT + 5; i++) raw = appendFeedback(raw, { at: i, source: "briefing", message: `m${i}` });
    const log = parseFeedbackLog(raw);
    expect(log).toHaveLength(MAX_KEPT);
    expect(log[0].message).toBe(`m${MAX_KEPT + 4}`);
    expect(parseFeedbackLog("not json")).toEqual([]);
  });

  it("is mailed to our inbox only, with the subscriber as Reply-To", () => {
    const mail = buildFeedbackEmail({ source: "cancel", message: "Too pricey for me\nsecond line", email: EMAIL, standing: "Pro", at: NOW });
    expect(mail.to).toBe("hello@immigrationclock.com");
    expect(mail.replyTo).toBe(EMAIL);
    expect(mail.subject).toBe("What was missing (cancel): Too pricey for me");
    expect(mail.text).toContain("second line");
    expect(mail.text).toContain(`From: ${EMAIL}`);
    expect(mail.text).not.toMatch(/—|--(?!-)/);
  });
});

describe("POST /api/pro/feedback", () => {
  const ENV = ["BILLING_SESSION_SECRET", "RESEND_API_KEY"] as const;
  const saved: Record<string, string | undefined> = {};
  let store: MemoryStore;
  let fetchSpy: MockInstance<typeof fetch>;
  const key = () => emailKey(EMAIL, SECRET);

  const cookie = () => `${COOKIE_NAME}=${sign({ plan: "pro", email: EMAIL, customerId: "cus_1", exp: NOW + 86400 }, SECRET, NOW)}`;
  const post = (body: unknown, c = cookie(), ip = `10.1.0.${Math.floor(Math.random() * 250)}`) =>
    new Request(`${ORIGIN}/api/pro/feedback`, {
      method: "POST",
      headers: { cookie: c, "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    resetRateLimiter();
    for (const k of ENV) saved[k] = process.env[k];
    process.env.BILLING_SESSION_SECRET = SECRET;
    process.env.RESEND_API_KEY = "re_test";
    store = new MemoryStore();
    shared.store = store;
    await store.putSubscriber(key(), subscriber());
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
  });
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  it("keeps the answer and mails it to hello@ and nowhere else", async () => {
    const { POST } = await import("@/app/api/pro/feedback/route");
    const res = await POST(post({ source: "briefing", message: "Alerts for my priority date", to: "someone@else.com" }));
    expect(res.status).toBe(200);

    const log = parseFeedbackLog(await store.getProDoc("feedback", key()));
    expect(log[0]).toMatchObject({ source: "briefing", message: "Alerts for my priority date" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const sent = JSON.parse(String(init.body)) as { to: string[]; reply_to: string; subject: string; text: string };
    expect(sent.to).toEqual([FEEDBACK_INBOX]);
    expect(sent.reply_to).toBe(EMAIL);
    expect(sent.text).toContain("Account: Pro");
    expect(JSON.stringify(sent)).not.toContain("someone@else.com");
  });

  it("refuses a signed-out reader and sends nothing", async () => {
    const { POST } = await import("@/app/api/pro/feedback/route");
    expect((await POST(post({ source: "briefing", message: "hello there" }, ""))).status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses empty or unknown input politely", async () => {
    const { POST } = await import("@/app/api/pro/feedback/route");
    const res = await POST(post({ source: "briefing", message: "  " }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toBe("Write a few words first.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still keeps the answer when mail is down", async () => {
    fetchSpy.mockResolvedValue(new Response("{}", { status: 500 }));
    const { POST } = await import("@/app/api/pro/feedback/route");
    expect((await POST(post({ source: "cancel", message: "Needed more states" }))).status).toBe(200);
    expect(parseFeedbackLog(await store.getProDoc("feedback", key()))).toHaveLength(1);
  });

  it("hears from people who are no longer Pro too", async () => {
    await store.putSubscriber(key(), subscriber({ status: "canceled", currentPeriodEnd: NOW - 10 }));
    const { POST } = await import("@/app/api/pro/feedback/route");
    expect((await POST(post({ source: "cancel", message: "Did not use it enough" }))).status).toBe(200);
    const sent = JSON.parse(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body)) as { text: string };
    expect(sent.text).toContain("Account: not Pro");
  });

  it("caps one identity per day", async () => {
    const { POST } = await import("@/app/api/pro/feedback/route");
    for (let i = 0; i < DAILY_MAX; i++) {
      resetRateLimiter();
      expect((await POST(post({ source: "briefing", message: `idea ${i}` }))).status).toBe(200);
    }
    resetRateLimiter();
    expect((await POST(post({ source: "briefing", message: "one more" }))).status).toBe(429);
  });

  it("is erased with everything else Pro keeps", () => {
    expect(PRO_DOC_KINDS).toContain("feedback");
  });
});

describe("the alert email", () => {
  const base = {
    alerts: [
      { kind: "change" as const, id: "change:x", matched: ["visa:h-1b"], title: "Rule", detail: "final rule", href: "/what-changed/x", date: "2026-10-15" },
    ],
    origin: ORIGIN,
    unsubscribeUrl: `${ORIGIN}/api/billing/alerts/unsubscribe?k=pro&t=x`,
    testMode: false,
  };

  it("invites a reply with ideas when replies reach us", () => {
    const mail = buildAlertEmail({ ...base, supportEmail: "hello@immigrationclock.com" });
    expect(mail.text).toContain(FEEDBACK_LINE);
    expect(mail.html).toContain(FEEDBACK_LINE);
  });

  it("says nothing about replying when no reply inbox is set", () => {
    const mail = buildAlertEmail(base);
    expect(mail.text).not.toContain(FEEDBACK_LINE);
    expect(mail.html).not.toContain(FEEDBACK_LINE);
  });
});

describe("the places that ask", () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

  it("Briefing has the optional link, and the public example does not", () => {
    const v2 = read("src/components/BriefingV2.tsx");
    expect(v2).toContain("What should Pro do next?");
    expect(v2).toMatch(/\{example \? null : \(\s*<FeedbackBox/);
    expect(read("src/app/briefing/page.tsx")).toContain("What should Pro do next?");
  });

  it("the account page asks what was missing, beside billing, without gating it", () => {
    const page = read("src/app/account/page.tsx");
    expect(page).toContain('label="What was missing?"');
    expect(page).toContain("Thinking of cancelling? Tell us what was missing.");
    // The billing button is rendered on its own, never inside the feedback form.
    expect(page.indexOf("<ManageBillingButton />")).toBeLessThan(page.indexOf("Thinking of cancelling?"));
    expect(read("src/components/ManageBillingButton.tsx")).not.toContain("feedback");
  });
});
