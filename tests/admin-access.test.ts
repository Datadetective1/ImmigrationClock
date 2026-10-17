// =============================================================================
// THE ADMIN WORKSPACE IS ACCESS-CONTROLLED ON THE SERVER
//
// /admin/refresh-status and /admin/pulse-email used to be served to anyone,
// kept out of search only by noindex. These tests fail if an admin page or API
// answers to anyone but an allowlisted, verified session (or, for the API, the
// monitoring token), or if operational detail is published again.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { COOKIE_NAME, sign } from "@/lib/billing/entitlement";
import { adminEmails, isAdminSession, monitorAuthorized } from "@/lib/admin";
import { FOOTER_SECTIONS, NAV } from "@/lib/site";

const SECRET = "s".repeat(64);
const NOW = 1_800_000_000;
const ENV = { BILLING_SESSION_SECRET: SECRET, ADMIN_EMAILS: "Owner@Example.com, ops@example.com", MONITOR_TOKEN: "m".repeat(40) };
const session = (email: string, plan: "free" | "pro" = "free", exp = NOW + 3600) =>
  sign({ plan, email, customerId: plan === "pro" ? "cus_1" : "", exp } as never, SECRET, NOW);

describe("who is an admin", () => {
  it("is an allowlisted address with a verified, unexpired session", () => {
    expect(isAdminSession(session("owner@example.com"), NOW, ENV)).toBe(true);
    expect(isAdminSession(session("OPS@example.com"), NOW, ENV)).toBe(true);
  });

  it("is never a Pro subscriber by being Pro, an expired session, a forged cookie, or anyone when unset", () => {
    expect(isAdminSession(session("someone@example.com", "pro"), NOW, ENV)).toBe(false);
    expect(isAdminSession(session("owner@example.com", "free", NOW - 1), NOW, ENV)).toBe(false);
    expect(isAdminSession("forged.value", NOW, ENV)).toBe(false);
    expect(isAdminSession(undefined, NOW, ENV)).toBe(false);
    expect(isAdminSession(session("owner@example.com"), NOW, { ...ENV, ADMIN_EMAILS: "" })).toBe(false);
    expect(isAdminSession(session("owner@example.com"), NOW, { ...ENV, BILLING_SESSION_SECRET: "" })).toBe(false);
  });

  it("parses the allowlist and ignores junk", () => {
    expect([...adminEmails({ ADMIN_EMAILS: " a@x.com ,, nope , B@Y.org " })]).toEqual(["a@x.com", "b@y.org"]);
  });

  it("accepts the monitoring token only exactly, and never when unset", () => {
    expect(monitorAuthorized(`Bearer ${ENV.MONITOR_TOKEN}`, ENV)).toBe(true);
    expect(monitorAuthorized(`Bearer ${ENV.MONITOR_TOKEN}x`, ENV)).toBe(false);
    expect(monitorAuthorized(ENV.MONITOR_TOKEN, ENV)).toBe(false);
    expect(monitorAuthorized("Bearer ", { MONITOR_TOKEN: "" })).toBe(false);
  });
});

describe("/api/admin/health", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, ENV);
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.useRealTimers();
  });
  const call = async (headers: Record<string, string>, ip: string) => {
    const { GET } = await import("@/app/api/admin/health/route");
    return GET(new Request("https://immigrationclock.com/api/admin/health", { headers: { "x-forwarded-for": ip, ...headers } }));
  };

  it("is a 404 to anonymous callers and to signed-in non-admins, Pro included", async () => {
    expect((await call({}, "10.0.0.1")).status).toBe(404);
    expect((await call({ cookie: `${COOKIE_NAME}=${session("someone@example.com", "pro")}` }, "10.0.0.2")).status).toBe(404);
    expect((await call({ authorization: "Bearer wrong" }, "10.0.0.3")).status).toBe(404);
  });

  it("answers an admin session and the monitoring token with pipeline and billing health", async () => {
    for (const [headers, ip] of [
      [{ cookie: `${COOKIE_NAME}=${session("owner@example.com")}` }, "10.0.0.4"],
      [{ authorization: `Bearer ${ENV.MONITOR_TOKEN}` }, "10.0.0.5"],
    ] as const) {
      const res = await call(headers, ip);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pipeline.lastSuccessfulIngestion).toBeTruthy();
      expect(Object.keys(body.billing).sort()).toEqual(["checkoutReady", "testMode", "webhookReady"]);
    }
  });
});

describe("nothing operational is published or linked", () => {
  const ROOT = process.cwd();
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

  it("every admin page checks access itself and is rendered per request", () => {
    const pages = walk(join(ROOT, "src/app/admin")).filter((f) => f.endsWith("page.tsx"));
    expect(pages.length).toBeGreaterThan(0);
    for (const f of pages) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/requireAdminPage\(\);/);
      expect(src, f).toMatch(/export const dynamic = "force-dynamic"/);
    }
  });

  it("every /api/admin handler checks access", () => {
    for (const f of walk(join(ROOT, "src/app/api/admin")).filter((f) => f.endsWith("route.ts"))) {
      expect(readFileSync(f, "utf8"), f).toMatch(/adminRoute\(req\)/);
    }
  });

  it("the public health file is gone and no longer written", () => {
    expect(existsSync(join(ROOT, "public/api/health.json"))).toBe(false);
    expect(readFileSync(join(ROOT, "scripts/build-health.ts"), "utf8")).not.toMatch(/public\/api\/health\.json/);
  });

  it("no public navigation, footer link or page links to the admin workspace", () => {
    const hrefs = [
      ...NAV.flatMap((n) => [n.href ?? "", ...(n.children ?? []).map((c) => c.href)]),
      ...JSON.stringify(FOOTER_SECTIONS).match(/"href":"[^"]*"/g)!.map((h) => h.slice(8, -1)),
    ];
    expect(hrefs.length).toBeGreaterThan(10);
    expect(hrefs.filter((h) => h.startsWith("/admin"))).toEqual([]);
    const linking = walk(join(ROOT, "src"))
      .filter((f) => /\.(tsx?)$/.test(f) && !f.includes(join("src", "app", "admin")))
      .filter((f) => /href=["{`][^"}`]*\/admin\//.test(readFileSync(f, "utf8")));
    expect(linking).toEqual([]);
  });

  it("the webhook no longer reports readiness to anyone who asks", async () => {
    const { GET } = await import("@/app/api/billing/webhook/route");
    const res = await GET();
    expect(res.status).toBe(405);
    expect(JSON.stringify(await res.json())).not.toMatch(/Ready|testMode/);
  });
});
