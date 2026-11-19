import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  CONFIRM_TTL_SECONDS,
  alertsOrigin,
  confirmToken,
  readConfirmToken,
  unsubscribeToken,
  verifyUnsubscribe,
  unsubscribeUrl,
  isRow,
  isCountry,
  sectionOf,
  pickLabel,
  type AlertSubscriber,
} from "@/lib/bulletin-alerts";
import { ROW_OPTIONS, COUNTRY_OPTIONS, ALL_ROWS } from "@/lib/bulletin-alerts/options";
import { alertEmail, confirmEmail, welcomeEmail, datesFor, alertSubject, movementWords } from "@/lib/bulletin-alerts/email";
import { MemoryAlertStore, alertKey, ALERT_KEYS } from "@/lib/bulletin-alerts/store";
import { isDue, runBulletinAlerts } from "@/lib/bulletin-alerts/run";
import { BULLETINS, formatCutoff, latestBulletin, previousBulletin, type Bulletin } from "@/lib/visa-bulletin";

const SECRET = "test-secret-for-bulletin-alerts";
const NOW = 1_795_000_000;

function sub(over: Partial<AlertSubscriber> = {}): AlertSubscriber {
  return {
    email: "reader@example.com",
    row: "EB2",
    country: "india",
    consent: { text: "x", version: "v", givenAt: NOW, confirmedAt: NOW },
    sinceMonth: "2026-10",
    ...over,
  };
}

describe("options", () => {
  it("offers every bulletin row and the five chargeability columns", () => {
    const offered = ROW_OPTIONS.flatMap((g) => g.rows).sort();
    expect(offered).toEqual([...ALL_ROWS].sort());
    expect(COUNTRY_OPTIONS.map((c) => c.value).sort()).toEqual(["all", "china", "india", "mexico", "philippines"]);
  });
  it("validates rows and countries", () => {
    expect(isRow("EB2")).toBe(true);
    expect(isRow("EB9")).toBe(false);
    expect(isCountry("india")).toBe(true);
    expect(isCountry("canada")).toBe(false);
    expect(sectionOf("F4")).toBe("family");
    expect(sectionOf("EB3")).toBe("employment");
    expect(pickLabel("EB2", "india")).toBe("EB-2, India");
    expect(pickLabel("F4", "all")).toBe("F4, All other countries");
  });
});

describe("confirmation links", () => {
  const pending = { email: "a@example.com", row: "EB3" as const, country: "philippines" as const, givenAt: NOW };

  it("round-trips a pending signup", () => {
    expect(readConfirmToken(confirmToken(pending, SECRET), SECRET, NOW + 60)).toEqual(pending);
  });
  it("expires after the TTL", () => {
    expect(readConfirmToken(confirmToken(pending, SECRET), SECRET, NOW + CONFIRM_TTL_SECONDS + 1)).toBeNull();
  });
  it("rejects a tampered body or a different secret", () => {
    const t = confirmToken(pending, SECRET);
    const [, sig] = t.split(".");
    const forged = `${Buffer.from(JSON.stringify(["b@example.com", "EB3", "philippines", NOW])).toString("base64url")}.${sig}`;
    expect(readConfirmToken(forged, SECRET, NOW)).toBeNull();
    expect(readConfirmToken(t, "other-secret", NOW)).toBeNull();
    expect(readConfirmToken("", SECRET, NOW)).toBeNull();
    expect(readConfirmToken("a.b.c", SECRET, NOW)).toBeNull();
  });
  it("is not interchangeable with an unsubscribe token", () => {
    const key = alertKey("a@example.com", SECRET);
    expect(verifyUnsubscribe(key, unsubscribeToken(key, SECRET), SECRET)).toBe(true);
    expect(verifyUnsubscribe(key, confirmToken(pending, SECRET).split(".")[1], SECRET)).toBe(false);
    expect(verifyUnsubscribe(alertKey("b@example.com", SECRET), unsubscribeToken(key, SECRET), SECRET)).toBe(false);
  });
});

describe("alertsOrigin", () => {
  it("uses the preview deployment's own address on a preview, the site otherwise", () => {
    expect(alertsOrigin({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "x-git-branch.vercel.app", NEXT_PUBLIC_SITE_URL: "https://immigrationclock.com" })).toBe(
      "https://x-git-branch.vercel.app"
    );
    expect(alertsOrigin({ VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://immigrationclock.com/" })).toBe("https://immigrationclock.com");
    expect(alertsOrigin({})).toBe("https://immigrationclock.com");
  });
});

describe("the store key", () => {
  it("is not the address and differs from the Pro key for the same address", async () => {
    const { emailKey } = await import("@/lib/billing/store");
    const k = alertKey("Reader@Example.com", SECRET);
    expect(k).not.toContain("reader");
    expect(k).toBe(alertKey("reader@example.com", SECRET));
    expect(k).not.toBe(emailKey("reader@example.com", SECRET));
  });
});

describe("emails", () => {
  const b = latestBulletin()!;
  const prev = previousBulletin(b);
  const origin = "https://immigrationclock.com";
  const unsub = unsubscribeUrl(origin, "k123", SECRET);
  const emails = [
    confirmEmail({ pick: { row: "EB2", country: "india" }, confirmUrl: `${origin}/api/bulletin-alerts/confirm?t=abc`, origin }),
    welcomeEmail({ pick: { row: "EB2", country: "india" }, bulletin: b, previous: prev, origin, unsubscribeUrl: unsub, trialDays: 30 }),
    alertEmail({ pick: { row: "EB2", country: "india" }, bulletin: b, previous: prev, origin, unsubscribeUrl: unsub, trialDays: 30 }),
  ];

  it("carry the postal address and never a partner or referral link", () => {
    for (const m of emails) {
      expect(m.text).toContain("Coppell, TX");
      expect(m.html.toLowerCase()).not.toContain("onenotary");
      expect(m.text.toLowerCase()).not.toContain("onenotary");
      expect(m.text).not.toContain("--");
      expect(m.text).not.toContain("—");
    }
  });

  it("put an unsubscribe link and the 30 day trial in every email after the confirmation", () => {
    for (const m of emails.slice(1)) {
      expect(m.text).toContain(unsub);
      expect(m.html).toContain("Try Pro free for 30 days");
      expect(m.text).toContain(`${origin}/trial`);
    }
    expect(emails[0].text).toContain("/api/bulletin-alerts/confirm?t=abc");
  });

  it("states the bulletin's own dates for the pick", () => {
    const d = datesFor({ row: "EB2", country: "india" }, b, prev);
    const alert = emails[2];
    expect(alert.text).toContain(`Final action date: ${formatCutoff(d.finalAction)}`);
    expect(alert.text).toContain(`Date for filing: ${formatCutoff(d.filing)}`);
    expect(alert.subject).toBe(alertSubject("EB-2, India", b, d));
    expect(alert.subject.startsWith(`${b.label} Visa Bulletin:`)).toBe(true);
  });

  it("links the wait-time page when the pick has one, the month otherwise", () => {
    expect(emails[2].text).toContain(`${origin}/green-card-wait-time/eb-2-india`);
    const f1 = alertEmail({ pick: { row: "F1", country: "china" }, bulletin: b, previous: prev, origin, unsubscribeUrl: unsub, trialDays: 30 });
    expect(f1.text).toContain(`${origin}/visa-bulletin/${b.id}`);
  });

  it("describes movement in plain words", () => {
    expect(movementWords({ kind: "ahead", gap: "3 mo" })).toBe("moved ahead 3 mo");
    expect(movementWords({ kind: "same" })).toBe("no change");
    expect(movementWords({ kind: "unknown" })).toBe("");
  });
});

function nextMonth(b: Bulletin): Bulletin {
  return { ...b, id: "2099-01", label: "January 2099" };
}

describe("the monthly send", () => {
  let store: MemoryAlertStore;
  const latest = latestBulletin()!;

  beforeEach(async () => {
    store = new MemoryAlertStore();
    await store.put("due", sub({ email: "due@example.com", sinceMonth: "2026-10" }));
    await store.put("fresh", sub({ email: "fresh@example.com", sinceMonth: latest.id }));
  });

  it("is due only for months after the one they confirmed on", () => {
    expect(isDue({ sinceMonth: "2026-10" }, "2026-11")).toBe(true);
    expect(isDue({ sinceMonth: "2026-11" }, "2026-11")).toBe(false);
  });

  it("sends nothing on a dry run", async () => {
    const deliver = vi.fn();
    const r = await runBulletinAlerts({ store, bulletin: latest, previous: null, origin: "https://x", secret: SECRET, trialDays: 30, send: false, deliver });
    expect(deliver).not.toHaveBeenCalled();
    expect(r).toMatchObject({ subscribers: 2, due: 1, sent: 0, dryRun: true, skippedNotDue: 1 });
  });

  it("sends once per subscriber per month, however often it runs", async () => {
    const deliver = vi.fn(async () => ({ ok: true }));
    const input = { store, bulletin: nextMonth(latest), previous: latest, origin: "https://x", secret: SECRET, trialDays: 30, send: true, deliver };
    const first = await runBulletinAlerts(input);
    const second = await runBulletinAlerts(input);
    expect(first.sent).toBe(2);
    expect(second.sent).toBe(0);
    expect(second.skippedAlreadySent).toBe(2);
    expect(deliver).toHaveBeenCalledTimes(2);
    const [, , headers, idem] = deliver.mock.calls[0] as unknown as [string, unknown, Record<string, string>, string];
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(idem).toMatch(/^balert-2099-01-/);
  });

  it("gives a failed send back so the next run retries it", async () => {
    let fail = true;
    const deliver = vi.fn(async () => (fail ? { ok: false, detail: "500" } : { ok: true }));
    const input = { store, bulletin: nextMonth(latest), previous: latest, origin: "https://x", secret: SECRET, trialDays: 30, send: true, deliver };
    expect((await runBulletinAlerts(input)).failed).toBe(2);
    fail = false;
    expect((await runBulletinAlerts(input)).sent).toBe(2);
  });

  it("stops at the limit and leaves the rest for the next run", async () => {
    const deliver = vi.fn(async () => ({ ok: true }));
    const input = { store, bulletin: nextMonth(latest), previous: latest, origin: "https://x", secret: SECRET, trialDays: 30, send: true, deliver, limit: 1 };
    const r = await runBulletinAlerts(input);
    expect(r.sent).toBe(1);
    expect(r.remaining).toBe(1);
    expect((await runBulletinAlerts(input)).sent).toBe(1);
  });

  it("forgets a subscriber completely on unsubscribe", async () => {
    await store.remove("due");
    expect(await store.get("due")).toBeNull();
    expect(await store.listKeys()).toEqual(["fresh"]);
    expect([...store.data.keys()].some((k) => k === ALERT_KEYS.subscriber("due"))).toBe(false);
  });
});

describe("routes", () => {
  const env = { ...process.env };
  let store: MemoryAlertStore;

  beforeEach(() => {
    store = new MemoryAlertStore();
    vi.resetModules();
    vi.doMock("@/lib/bulletin-alerts/store", async (orig) => ({
      ...(await orig<typeof import("@/lib/bulletin-alerts/store")>()),
      resolveAlertStore: () => store,
    }));
    process.env.BILLING_SESSION_SECRET = SECRET;
    process.env.RESEND_API_KEY = "re_test";
    process.env.NEXT_PUBLIC_SITE_URL = "https://immigrationclock.com";
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/bulletin-alerts/store");
  });

  it("subscribe stores nothing and emails a confirmation link", async () => {
    const sent: { to: string[]; subject: string; text: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: "e1" }), { status: 200 });
    }));
    const { POST } = await import("@/app/api/bulletin-alerts/subscribe/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/bulletin-alerts/subscribe", {
        method: "POST",
        body: JSON.stringify({ email: "New@Example.com", row: "EB2", country: "india", consent: true }),
      })
    );
    expect(res.status).toBe(200);
    expect(await store.listKeys()).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["new@example.com"]);
    expect(sent[0].text).toContain("https://immigrationclock.com/api/bulletin-alerts/confirm?t=");
  });

  it("subscribe refuses without consent, a bad row or a bad country", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { POST } = await import("@/app/api/bulletin-alerts/subscribe/route");
    const call = (body: object) =>
      POST(new Request("https://x/api", { method: "POST", body: JSON.stringify(body) })).then((r) => r.status);
    expect(await call({ email: "a@example.com", row: "EB2", country: "india" })).toBe(400);
    expect(await call({ email: "a@example.com", row: "XX", country: "india", consent: true })).toBe(400);
    expect(await call({ email: "a@example.com", row: "EB2", country: "canada", consent: true })).toBe(400);
    expect(await call({ email: "nope", row: "EB2", country: "india", consent: true })).toBe(400);
  });

  it("confirm GET changes nothing; POST stores the four things and sends the welcome", async () => {
    const sent: { subject: string; headers?: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: "e2" }), { status: 200 });
    }));
    const token = confirmToken({ email: "c@example.com", row: "F4", country: "mexico", givenAt: Math.floor(Date.now() / 1000) }, SECRET);
    const { GET, POST } = await import("@/app/api/bulletin-alerts/confirm/route");
    const url = `https://immigrationclock.com/api/bulletin-alerts/confirm?t=${encodeURIComponent(token)}`;
    const page = await GET(new Request(url));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("F4, Mexico");
    expect(await store.listKeys()).toEqual([]);

    const res = await POST(new Request(url, { method: "POST" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://immigrationclock.com/visa-bulletin-alerts?confirmed=1");
    const key = alertKey("c@example.com", SECRET);
    const rec = await store.get(key);
    expect(rec).toMatchObject({ email: "c@example.com", row: "F4", country: "mexico", sinceMonth: BULLETINS.map((b) => b.id).sort().pop() });
    expect(Object.keys(rec!).sort()).toEqual(["consent", "country", "email", "row", "sinceMonth"]);
    expect(sent).toHaveLength(1);
    expect(sent[0].headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("confirm rejects a bad token", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { POST } = await import("@/app/api/bulletin-alerts/confirm/route");
    const res = await POST(new Request("https://x/api/bulletin-alerts/confirm?t=bad.token", { method: "POST" }));
    expect(res.status).toBe(400);
    expect(await store.listKeys()).toEqual([]);
  });

  it("one-click unsubscribe deletes the subscriber; a wrong token does nothing", async () => {
    const key = alertKey("d@example.com", SECRET);
    await store.put(key, sub({ email: "d@example.com" }));
    const { POST } = await import("@/app/api/bulletin-alerts/unsubscribe/route");
    const bad = await POST(new Request(`https://x/api?k=${key}&t=nope`, { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(bad.status).toBe(400);
    expect(await store.get(key)).not.toBeNull();
    const ok = await POST(
      new Request(`https://x/api?k=${key}&t=${unsubscribeToken(key, SECRET)}`, { method: "POST", body: "List-Unsubscribe=One-Click" })
    );
    expect(ok.status).toBe(200);
    expect(await store.get(key)).toBeNull();
  });
});

describe("adding a bulletin month from a typed file", async () => {
  const { parseIncoming, parsePrintedCell, insertIntoData, IncomingError } = await import("@/lib/visa-bulletin/incoming");
  const { readFileSync } = await import("node:fs");
  const { FAMILY_ROWS, EMPLOYMENT_ROWS, CHARGEABILITY } = await import("@/lib/visa-bulletin");
  const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const printed = (c: string) => (c === "C" || c === "U" ? c : `${c.slice(8, 10)}${MON[Number(c.slice(5, 7)) - 1]}${c.slice(2, 4)}`);

  function asTyped(b: Bulletin, id = b.id, label = b.label): string {
    const lines = [`id,${id}`, `label,${label}`, `source,${b.sourceUrl}`, `verified,${b.verifiedAt}`, "note,CA/VO: test"];
    for (const [section, rows] of [["family", FAMILY_ROWS], ["employment", EMPLOYMENT_ROWS]] as const) {
      for (const kind of ["finalAction", "filing"] as const) {
        lines.push(`chart,${section},${kind}`);
        const table = (b[section] as unknown as Record<string, Record<string, Record<string, string>>>)[kind];
        for (const r of rows) lines.push([r, ...CHARGEABILITY.map((c) => printed(table[r][c]))].join(","));
      }
    }
    return lines.join("\n");
  }

  it("reads printed cells", () => {
    expect(parsePrintedCell("22JAN21")).toBe("2021-01-22");
    expect(parsePrintedCell("c")).toBe("C");
    expect(parsePrintedCell("31FEB21")).toBeNull();
    expect(parsePrintedCell("?")).toBeNull();
  });

  it("reproduces a hand-checked month exactly", () => {
    const b = latestBulletin()!;
    const m = parseIncoming(asTyped(b));
    expect(m.bulletin.family).toEqual(b.family);
    expect(m.bulletin.employment).toEqual(b.employment);
  });

  it("refuses the blank template and a missing row", () => {
    const template = readFileSync("data/visa-bulletin-incoming/TEMPLATE.txt", "utf8");
    expect(() => parseIncoming(template)).toThrow(IncomingError);
    const b = latestBulletin()!;
    expect(() => parseIncoming(asTyped(b).replace(/\nEB4,[^\n]+/, ""))).toThrow(/missing row EB4/);
    expect(() => parseIncoming(asTyped(b, "2099-01", "February 2099"))).toThrow(/label must be "January 2099"/);
  });

  it("adds the month to the top of data.ts and refuses a duplicate", () => {
    const b = latestBulletin()!;
    const source = readFileSync("src/lib/visa-bulletin/data.ts", "utf8");
    const next = insertIntoData(source, parseIncoming(asTyped(b, "2099-01", "January 2099")));
    expect(next.indexOf('id: "2099-01"')).toBeLessThan(next.indexOf(`id: "${b.id}"`));
    expect(next.length).toBeGreaterThan(source.length);
    expect(() => insertIntoData(source, parseIncoming(asTyped(b)))).toThrow(/already in data.ts/);
  });
});
