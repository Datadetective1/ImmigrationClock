// =============================================================================
// THE ACCOUNT EXPERIENCE — visible, conventional, and honest about itself
//
// The identity system worked and was invisible. A person could verify an email,
// subscribe, and find nothing in the interface that acknowledged either: no
// sign-in, no account, no sign-out anywhere in the navigation, and an account
// page whose opening line read as "there are no accounts".
//
// These tests pin the behaviour a first-time visitor has to be able to discover
// on their own. Rendering assertions are source-level because the suite runs in
// a node environment with no DOM — the same convention tests/pricing-page.test.ts
// already uses — while every piece of actual LOGIC is exercised for real.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { accountStateFor, accountStatusLabel, ANONYMOUS_ACCOUNT } from "@/lib/billing/account-state";
import { emailKey } from "@/lib/billing/store";
import { sign, verify, MAX_TTL_DAYS, type Entitlement } from "@/lib/billing/entitlement";
import type { SubscriberRecord } from "@/lib/billing/store";

const SESSION_SECRET = "s".repeat(32);
const WEBHOOK_SECRET = "whsec_placeholder_for_tests";
const USER = "reader@example.com";
const USER_KEY = emailKey(USER, SESSION_SECRET);
const NOW = () => Math.floor(Date.now() / 1000);

const src = (rel: string) => readFileSync(fileURLToPath(new URL("../" + rel, import.meta.url)), "utf8");

/**
 * The same file with its comments removed.
 *
 * This codebase explains its defects in prose directly above the code that
 * fixes them, so a source-level assertion about what the code must NOT do will
 * match the sentence describing what it used to do — and fail the file for
 * documenting itself. Every "this must not appear" check reads from here.
 */
const codeOf = (rel: string) =>
  src(rel)
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

function record(over: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return {
    email: USER,
    customerId: "cus_1",
    status: "active",
    currentPeriodEnd: NOW() + 30 * 86_400,
    updatedAt: NOW(),
    ...over,
  };
}

function claim(over: Partial<Entitlement> = {}): Entitlement {
  return { plan: "pro", email: USER, customerId: "cus_1", exp: NOW() + 86_400, ...over };
}

// =============================================================================
// THE STATE MACHINE BEHIND EVERY SURFACE
// =============================================================================
describe("what an account says about itself", () => {
  it("anonymous when there is no verified identity", () => {
    expect(accountStateFor(null, null, NOW())).toEqual(ANONYMOUS_ACCOUNT);
    // A claim carrying no address identifies nobody, whatever else is on it.
    expect(accountStateFor(claim({ email: "" }), record(), NOW()).status).toBe("anonymous");
  });

  it("free when verified but never subscribed", () => {
    const state = accountStateFor(claim({ plan: "free", customerId: "" }), null, NOW());
    expect(state.status).toBe("free");
    expect(state.email).toBe(USER);
    expect(state.isPro).toBe(false);
    expect(state.hasBilling).toBe(false);
  });

  it("pro, and says it renews", () => {
    const state = accountStateFor(claim(), record({ cancelAtPeriodEnd: false }), NOW());
    expect(state.status).toBe("pro");
    expect(state.isPro).toBe(true);
    expect(state.renews).toBe(true);
    expect(accountStatusLabel(state)).toBe("Pro — active");
  });

  it("CANCELLING is distinguished from active", () => {
    // Calling a cancelled subscription "active" is technically true and reads
    // as "your cancellation did not work" — which is a support ticket.
    const state = accountStateFor(claim(), record({ cancelAtPeriodEnd: true }), NOW());
    expect(state.status).toBe("cancelling");
    expect(state.isPro, "access was cut off early on cancellation").toBe(true);
    expect(state.renews).toBe(false);
    expect(accountStatusLabel(state)).toMatch(/cancels/i);
  });

  it("EXPIRED is distinguished from free", () => {
    // Somebody who used to pay is not the same as somebody who never did:
    // the difference decides whether "Manage billing" is worth offering.
    const past = NOW() - 86_400;
    const state = accountStateFor(claim(), record({ currentPeriodEnd: past }), NOW());
    expect(state.status).toBe("expired");
    expect(state.isPro).toBe(false);
    expect(state.hasBilling, "an expired subscriber lost their route to billing").toBe(true);
  });

  it("reports the newsletter answer, and tells 'declined' from 'never asked'", () => {
    const asked = { granted: false, at: NOW(), source: "checkout" as const, version: "v1" };
    expect(accountStateFor(claim(), record({ newsletterConsent: asked }), NOW()).newsletter).toBe("declined");
    expect(
      accountStateFor(claim(), record({ newsletterConsent: { ...asked, granted: true } }), NOW()).newsletter
    ).toBe("subscribed");
    expect(accountStateFor(claim(), record(), NOW()).newsletter).toBe("never_asked");
  });

  it("a record that simply does not exist is FREE, and says so confidently", () => {
    // Verified, never subscribed. A real and common state, not an error.
    const state = accountStateFor(claim({ plan: "free" }), null, NOW(), { storeRead: true });
    expect(state.email).toBe(USER);
    expect(state.status).toBe("free");
    expect(state.confirmed).toBe(true);
  });

  it("a store that could not ANSWER is unconfirmed, never free", () => {
    // The two used to be indistinguishable: a failed read returns null and so
    // does "no such record". One KV timeout therefore told a paying subscriber
    // they had a free account and offered to sell them Pro.
    const state = accountStateFor(claim(), null, NOW(), { storeRead: false });
    expect(state.status).toBe("unconfirmed");
    expect(state.confirmed).toBe(false);
    expect(state.email, "an outage lost the person's own address").toBe(USER);
    // The claim was minted from the store recently, so it is good enough to
    // keep showing somebody their own subscription.
    expect(state.isPro, "a subscriber was told mid-outage that they are not one").toBe(true);
    expect(accountStatusLabel(state)).not.toMatch(/free/i);
    // But not good enough to promise money will move.
    expect(state.renews, "an outage promised a renewal it cannot know about").toBe(false);
  });

  it("an unconfirmed FREE reader is not upgraded to Pro by an outage either", () => {
    const state = accountStateFor(
      { plan: "free", email: USER, customerId: "", exp: NOW() + 86_400 },
      null,
      NOW(),
      { storeRead: false }
    );
    expect(state.status).toBe("unconfirmed");
    expect(state.isPro).toBe(false);
    expect(accountStatusLabel(state)).toBe("Signed in");
  });

  it("offers billing when EITHER the record or the claim names a customer", () => {
    // The account page offered "Manage billing" from the record while the
    // portal read the claim, so a buyer who abandoned checkout — record has a
    // customer, claim does not — got a button that answered 401.
    const fromRecord = accountStateFor(claim({ customerId: "" }), record(), NOW());
    expect(fromRecord.hasBilling).toBe(true);
    const fromClaim = accountStateFor(claim(), record({ customerId: "" }), NOW());
    expect(fromClaim.hasBilling).toBe(true);
    const neither = accountStateFor(
      claim({ customerId: "" }),
      record({ customerId: "" }),
      NOW()
    );
    expect(neither.hasBilling).toBe(false);
  });
});

// =============================================================================
// THE NAVIGATION — the thing that was missing entirely
// =============================================================================
describe("the navigation exposes the account", () => {
  const nav = () => src("src/components/AccountNav.tsx");
  const bar = () => src("src/components/Navbar.tsx");

  it("offers Sign in when signed out and Account when signed in", () => {
    expect(nav()).toContain('"Account"');
    expect(nav()).toContain('"Sign in"');
    expect(nav()).toMatch(/signedIn \? "Account" : "Sign in"/);
  });

  it("decides from the readable hint, never from the signed cookie", () => {
    // ic_ent is httpOnly and must stay unreadable by script. ic_session carries
    // no identity, no plan and no signature — forging it buys a link to a page
    // that then asks you to sign in.
    expect(nav()).toContain("ic_session=1");
    expect(nav(), "the nav tried to read the signed entitlement cookie").not.toContain("ic_ent");
  });

  it("is rendered in BOTH the desktop header and the mobile menu", () => {
    const source = bar();
    expect(source).toContain("<AccountNav onNavigate");
    expect(source).toContain('<AccountNav variant="mobile"');
  });

  it("puts the account row FIRST in the mobile menu", () => {
    // Twenty-two content rows follow it; below them it would be unreachable
    // in practice on a phone.
    // Scoped to the mobile panel: the desktop <nav> maps NAV earlier in the
    // file, so comparing against the first occurrence would compare the mobile
    // account row against the DESKTOP list and pass for the wrong reason.
    const source = bar();
    const panelStart = source.indexOf("id={mobileNavId}");
    expect(panelStart, "the mobile panel was not found").toBeGreaterThan(-1);
    const panel = source.slice(panelStart);

    const account = panel.indexOf('variant="mobile"');
    const firstNavRow = panel.indexOf("{NAV.map((item) =>");
    expect(account).toBeGreaterThan(-1);
    expect(firstNavRow).toBeGreaterThan(-1);
    expect(account, "the account row is buried under the content links").toBeLessThan(firstNavRow);
  });

  it("does not make the root layout dynamic", () => {
    // Reading cookies() in the layout would deopt ~7,000 prerendered pages —
    // paying for an account control with the whole public site's performance.
    const layout = src("src/app/layout.tsx");
    expect(layout).not.toContain("cookies()");
    expect(layout).not.toMatch(/export const dynamic/);
  });

  it("re-reads on navigation, so signing out updates the header", () => {
    expect(nav()).toContain("usePathname");
    expect(nav()).toMatch(/useEffect\([\s\S]*?\[pathname/);
  });

  it("also re-reads when the tab comes back, so a SECOND tab is not stale", () => {
    // Two tabs is the ordinary case, and signing out is exactly when somebody
    // has two open. Without this the other tab offers "Account" for as long as
    // it is left open — the wrong identity state, indefinitely.
    const source = nav();
    expect(source).toContain('addEventListener("visibilitychange"');
    expect(source).toContain('addEventListener("focus"');
    expect(source, "the listeners are never removed").toContain('removeEventListener("focus"');
  });

  it("never shows the email address in the header", () => {
    // The control names the surface, not the person. A header that prints an
    // address discloses it to anyone glancing at the screen, on every page.
    // Read past the comments: a future note explaining WHY no address is here
    // would otherwise fail the very rule it is describing.
    expect(codeOf("src/components/AccountNav.tsx")).not.toMatch(/entitlement|email/i);
  });
});

// =============================================================================
// SIGN OUT — and what it must not destroy
// =============================================================================
describe("signing out", () => {
  it("clears both identity cookies and nothing else on the server", async () => {
    const { POST } = await import("@/app/api/billing/signout/route");
    const res = await POST(new Request("https://immigrationclock.com/api/billing/signout", { method: "POST" }));
    const cookie = res.headers.get("Set-Cookie") ?? "";

    expect(res.status).toBe(200);
    expect(cookie).toContain("ic_ent=");
    expect(cookie).toContain("ic_session=");
    expect(cookie).toMatch(/Max-Age=0/);
  });

  it("STAMPS the per-device merge flag rather than clearing it", async () => {
    // A shared laptop, and the direction of the merge is the whole point. The
    // union PUSHES this browser's local follows into whichever account signs
    // in next — so clearing the flag on sign-out uploads Alice's follows to
    // Bob's account and on to Bob's phone. On this site a follow can imply a
    // nationality.
    //
    // A union is only ever right on a device that has never hosted a session.
    // After a sign-out this device is not that.
    const source = src("src/components/SignOutButton.tsx");
    expect(source).toContain("writeSyncState");
    expect(source, "sign-out still clears the flag, so the next account inherits these follows").not.toContain(
      "clearSyncState"
    );

    // And the rule it feeds: a stamped device takes its list FROM the account.
    const { resolveLoad } = await import("@/lib/billing/watchlist-sync");
    const strangersLocal = ["country:india", "visa:h-1b"];
    const bobsAccount = ["country:mexico"];
    const loaded = resolveLoad({ merged: true, server: bobsAccount, local: strangersLocal });
    expect(loaded.entityIds, "a stranger's follows reached the next account").toEqual(bobsAccount);
    expect(loaded.added, "a stranger's follows would have been pushed to the server").toEqual([]);
    expect(loaded.changed, "a PUT would have written a stranger's follows").toBe(false);

    // Unstamped — a device that has never hosted a session — still unions, so
    // somebody who followed things anonymously and then subscribed keeps them.
    const first = resolveLoad({ merged: false, server: [], local: strangersLocal });
    expect(first.entityIds).toEqual(strangersLocal);
  });

  it("refuses a CROSS-SITE sign-out, and still allows every other caller", async () => {
    // Not a security boundary — the worst a forged request achieves is a
    // sign-out, undone by one email link. But the browser already tells us
    // where the request came from, so an unrelated page should not be able to
    // inflict it. A MISSING header is allowed: an attacker cannot remove a
    // header the browser adds, so absence means an older browser.
    const { POST } = await import("@/app/api/billing/signout/route");
    const url = "https://immigrationclock.com/api/billing/signout";

    const forged = await POST(
      new Request(url, { method: "POST", headers: { "sec-fetch-site": "cross-site" } })
    );
    expect(forged.status).toBe(403);
    expect(forged.headers.get("Set-Cookie"), "a refused sign-out still cleared cookies").toBeNull();

    for (const site of ["same-origin", "same-site", "none"]) {
      const ok = await POST(new Request(url, { method: "POST", headers: { "sec-fetch-site": site } }));
      expect(ok.status, `a ${site} sign-out was refused`).toBe(200);
    }
    expect((await POST(new Request(url, { method: "POST" }))).status).toBe(200);
  });

  it("does NOT delete the local follow list", () => {
    // Following works with no account at all. Deleting somebody's reading
    // preferences because they signed out of billing would be a surprise.
    const source = src("src/components/SignOutButton.tsx");
    expect(source).not.toContain("writeStoredFollows");
    expect(source).not.toMatch(/localStorage\.removeItem\(\s*["'`]immigrationclock\.follows/);
  });

  it("refreshes so the account panel immediately shows the sign-in form", () => {
    expect(src("src/components/SignOutButton.tsx")).toContain("router.refresh()");
  });

  it("ANNOUNCES the change, because a refresh does not reach the header", async () => {
    // FOUND IN A BROWSER. Signing out does not navigate: the button posts, the
    // server expires the cookies, and router.refresh() re-renders the SERVER
    // components. The account control is a client component that reads the
    // hint cookie on navigation — so the page said "Sign in with your email"
    // while the header above it still offered "Account".
    expect(src("src/components/SignOutButton.tsx")).toContain("announceIdentityChange");
    // And the same in the other direction: the magic link is consumed by a
    // fetch, so signing IN never navigates either.
    expect(src("src/components/SignInForm.tsx")).toContain("announceIdentityChange");
    expect(src("src/components/AccountActivation.tsx")).toContain("announceIdentityChange");
    // The control listens for it.
    expect(src("src/components/AccountNav.tsx")).toContain("onIdentityChange");
  });

  it("the identity signal reaches OTHER tabs, and carries nothing", async () => {
    const mod = await import("@/lib/billing/identity-signal");
    // localStorage is the only cross-tab notification available: `storage`
    // fires in every tab EXCEPT the one that wrote it, and cookies have no
    // equivalent. The value is a timestamp — no address, no plan, no key.
    const source = src("src/lib/billing/identity-signal.ts");
    expect(source).toContain("localStorage.setItem");
    expect(source).toContain('addEventListener("storage"');
    expect(source).toMatch(/String\(Date\.now\(\)\)/);
    expect(
      codeOf("src/lib/billing/identity-signal.ts"),
      "the signal carries identity"
    ).not.toMatch(/email|plan|customerId/);

    // SSR-safe: this module is imported by components that render on the
    // server, where there is no window to touch.
    expect(() => mod.announceIdentityChange()).not.toThrow();
    expect(typeof mod.onIdentityChange(() => {})).toBe("function");
  });

  it("strips the sign-in token with REPLACE, which a refresh undoes", () => {
    // FOUND IN A BROWSER. `history.replaceState` does not tell Next's router,
    // which still holds `/account?signin=…` — so `router.refresh()` re-rendered
    // that route and PUT THE TOKEN BACK in the address bar, leaving the
    // sign-in link in history and in the referrer of the next outbound click.
    // The same applied to the paid checkout session id.
    for (const file of ["src/components/SignInForm.tsx", "src/components/AccountActivation.tsx"]) {
      // The success path — the only one that has ever held a token in the URL —
      // must navigate to the bare path. AccountActivation still refreshes on a
      // 402, which is right: that branch carries no token, it just needs the
      // page re-rendered once Pro has been revoked.
      const code = codeOf(file);
      expect(code, `${file} still strips only with replaceState`).toContain("router.replace(bare)");
      const successPath = code.slice(code.indexOf("const bare"), code.indexOf("router.replace(bare)"));
      expect(successPath, `${file} refreshes before it replaces, restoring the token`).not.toContain(
        "router.refresh()"
      );
    }
  });
});

// =============================================================================
// THE COPY THAT MADE PEOPLE THINK THERE WERE NO ACCOUNTS
// =============================================================================
describe("identity copy", () => {
  it("no longer claims the site has no accounts", () => {
    for (const file of ["src/app/account/page.tsx", "src/app/pricing/page.tsx"]) {
      // Comments may quote the old line to explain the fix; rendered copy may not.
      const rendered = src(file)
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      expect(rendered, `${file} still tells readers there are no accounts`).not.toMatch(
        /no accounts (on|for)/i
      );
    }
  });

  it("says plainly that reading needs no account", () => {
    const page = src("src/app/account/page.tsx");
    expect(page).toMatch(/never needs an account|do not need an account/i);
  });
});

// =============================================================================
// THE ACCOUNT PAGE SHOWS WHAT IT PROMISES
// =============================================================================
describe("the account page", () => {
  const page = () => src("src/app/account/page.tsx");

  it("renders every field the account surface owes the reader", () => {
    const source = page();
    expect(source).toContain("Signed in as");
    expect(source).toContain("Follows");
    expect(source).toContain("Newsletter");
    expect(source).toContain("<SignOutButton");
    expect(source).toContain("<ManageBillingButton");
    expect(source).toContain("Upgrade to Pro");
    expect(source).toContain("<SignInForm");
  });

  it("reads the authoritative record, not only the cookie", () => {
    // The claim says who this browser is; the store is what Stripe wrote, and
    // it is the only thing that knows whether a subscription renews.
    const source = page();
    expect(source).toContain("getSubscriber");
    expect(source).toContain("accountStateFor");
  });

  it("stays out of the search index", () => {
    expect(page()).toContain("noindex: true");
  });

  it("tells the store's SILENCE from its answer", () => {
    // Both produce a null record. Rendering them the same way told a paying
    // subscriber caught by one KV timeout that they had a free account.
    const source = page();
    expect(source).toContain("storeRead");
    expect(source).toMatch(/storeRead = false/);
    // And the upgrade offer is gated on the answer, not just on the plan.
    expect(source).toMatch(/!account\.isPro && account\.confirmed/);
  });

  it("gives the newsletter THREE answers, not two", () => {
    // The consent record only covers the checkout checkbox. Somebody who
    // signed up through the newsletter form has no entry, and telling them
    // "Not subscribed" states something the site does not know.
    const source = page();
    expect(source).toContain('account.newsletter === "subscribed"');
    expect(source).toContain('account.newsletter === "declined"');
    expect(source).toMatch(/No preference recorded/i);
  });

  it("cannot CHANGE the newsletter answer, only report it", () => {
    // The consent record is evidence: dated, versioned, and written against the
    // verified identity at the moment the question was asked. An account page
    // that could write it would be a second, undated source of truth — and the
    // one place a consent could change without anybody agreeing to anything.
    const source = codeOf("src/app/account/page.tsx");
    expect(source).not.toMatch(/newsletterConsent\s*[:=]/);
    expect(source).not.toContain("updateSubscriber");
    expect(source).not.toContain("putSubscriber");
    // It reads, and only reads.
    expect(source).toContain("getSubscriber");
  });

  it("never navigates to a protocol-relative target when stripping a token", () => {
    // router.replace("//evil.com") is an external navigation, not a path, and
    // location.pathname can begin with two slashes.
    for (const file of ["src/components/SignInForm.tsx", "src/components/AccountActivation.tsx"]) {
      expect(codeOf(file), `${file} would follow a protocol-relative path`).toContain(
        'path.startsWith("//")'
      );
    }
  });

  it("says out loud what crosses devices and what does not", () => {
    // A sync feature that does not state its scope is one people discover the
    // edges of by losing something.
    const source = page();
    expect(source).toMatch(/What follows you, and what stays on this device/i);
    expect(source).toMatch(/On your account/);
    expect(source).toMatch(/On this device only/);
  });
});

// =============================================================================
// THE BEHAVIOUR, AGAINST REAL ROUTES
//
// Everything above is about what a person can SEE. This is about what actually
// happens when they act: signing in on a second device, and clicking Subscribe
// while already signed in.
// =============================================================================
const ENV: Record<string, string> = {
  BILLING_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STRIPE_PRICE_PRO_MONTHLY: "price_monthly",
  STRIPE_PRICE_PRO_ANNUAL: "price_annual",
  BILLING_SESSION_SECRET: SESSION_SECRET,
  KV_REST_API_URL: "https://kv.example",
  KV_REST_API_TOKEN: "kv-token",
  RESEND_API_KEY: "re_placeholder",
  NEXT_PUBLIC_SITE_URL: "https://immigrationclock.com",
};

function store() {
  const data = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const impl = async (url: string, init: { body?: string; method?: string } = {}) => {
    const u = String(url);
    if (u.includes("api.stripe.com")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "cs_1", url: "https://stripe/x" }) };
    }
    const args = JSON.parse(init.body ?? "[]") as string[];
    const [cmd, key, ...rest] = args;
    let result: unknown = null;
    switch (cmd) {
      case "GET":
        result = data.get(key) ?? null;
        break;
      case "SET": {
        const nx = rest.includes("NX");
        if (nx && data.has(key)) result = null;
        else {
          data.set(key, rest[0]);
          result = "OK";
        }
        break;
      }
      case "GETDEL":
        result = data.get(key) ?? null;
        data.delete(key);
        break;
      case "SADD": {
        const set = sets.get(key) ?? new Set<string>();
        set.add(rest[0]);
        sets.set(key, set);
        result = 1;
        break;
      }
      case "EVAL": {
        const casKey = String(rest[1]);
        const expected = String(rest[2] ?? "");
        const next = String(rest[3] ?? "");
        const cur = data.get(casKey) ?? "";
        if (cur === expected) {
          data.set(casKey, next);
          result = 1;
        } else result = 0;
        break;
      }
      case "SMEMBERS":
        result = [...(sets.get(key) ?? [])];
        break;
      default:
        result = null;
    }
    return { ok: true, status: 200, json: async () => ({ result }), text: async () => "" };
  };
  return { data, impl };
}

let world: ReturnType<typeof store>;

describe("account behaviour across devices", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
    world = store();
    vi.spyOn(globalThis, "fetch").mockImplementation(world.impl as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of Object.keys(ENV)) delete process.env[k];
  });

  function seedPro() {
    world.data.set(
      `sub:${USER_KEY}`,
      JSON.stringify({
        email: USER,
        customerId: "cus_1",
        status: "active",
        currentPeriodEnd: NOW() + 200 * 86_400,
        updatedAt: 1,
      })
    );
  }

  it("signing in on a SECOND device restores the same Pro entitlement", async () => {
    // The store is authoritative, so a new browser with no cookies gets the
    // subscription back from one emailed link — not from anything local.
    seedPro();
    const { tokenHash } = await import("@/lib/billing/store");
    world.data.set(
      `login:${tokenHash("tok-device-2", SESSION_SECRET)}`,
      JSON.stringify({ k: USER_KEY, e: USER })
    );

    const { POST } = await import("@/app/api/billing/signin/verify/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/signin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "tok-device-2" }),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan: string };
    expect(body.plan, "a paying subscriber was not restored on a new device").toBe("pro");

    const token = (res.headers.get("Set-Cookie") ?? "").match(/ic_ent=([^;]+)/)?.[1] ?? "";
    const ent = verify(decodeURIComponent(token), SESSION_SECRET, NOW())!;
    expect(ent.plan).toBe("pro");
    expect(ent.email).toBe(USER);
    // The claim is capped by policy; the true paid-through rides alongside it.
    expect(ent.exp).toBeLessThanOrEqual(NOW() + MAX_TTL_DAYS * 86_400);
    expect(ent.periodEnd).toBeGreaterThan(NOW() + 190 * 86_400);
  });

  it("a signed-in Pro user is NOT sent back through email verification", async () => {
    // Clicking Subscribe while already subscribed must say "you already have
    // one", not "confirm your email" — that would look like the account was
    // forgotten seconds after it was used.
    seedPro();
    const cookie = `ic_ent=${sign(claim(), SESSION_SECRET, NOW())}`;

    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ interval: "monthly", newsletterOptIn: false }),
      })
    );

    const body = (await res.json()) as { error?: string };
    expect(body.error, "a signed-in subscriber was asked to verify their email again").not.toBe(
      "identity_required"
    );
    expect(res.status).toBe(409);
    expect(body.error).toBe("already_subscribed");
  });

  it("a signed-in FREE user goes straight to checkout, with no re-verification", async () => {
    const cookie = `ic_ent=${sign(
      { plan: "free", email: USER, customerId: "", exp: NOW() + 86_400 },
      SESSION_SECRET,
      NOW()
    )}`;

    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ interval: "monthly", newsletterOptIn: false }),
      })
    );

    expect(res.status, "a verified free user was bounced back to verification").toBe(200);
  });

  it("still refuses an unverified visitor, so the safeguard is intact", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: "monthly" }),
      })
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("identity_required");
  });

  it("MANAGE BILLING works from the verified identity, not only from the claim", async () => {
    // The account page offered the button from the RECORD while the portal
    // read the CLAIM. A buyer who abandoned checkout — record has a customer,
    // claim does not — got a button that answered 401, and so did an expired
    // subscriber wanting an invoice.
    seedPro();
    const cookie = `ic_ent=${sign(claim({ customerId: "" }), SESSION_SECRET, NOW())}`;

    const { POST } = await import("@/app/api/billing/portal/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/portal", {
        method: "POST",
        headers: { cookie },
      })
    );

    expect(res.status, "a subscriber could not reach their own billing page").toBe(200);
    expect(((await res.json()) as { url: string }).url).toContain("stripe");
  });

  it("and still refuses a browser that has proved no identity at all", async () => {
    const { POST } = await import("@/app/api/billing/portal/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/portal", { method: "POST" })
    );
    expect(res.status).toBe(401);
  });

  it("the portal is never pointed at a customer the CALLER chose", async () => {
    // The classic insecure-direct-object hole. Every trusted source is ours:
    // the store keyed on the verified address, or the claim this site signed.
    seedPro();
    const cookie = `ic_ent=${sign(claim({ customerId: "" }), SESSION_SECRET, NOW())}`;
    const { POST } = await import("@/app/api/billing/portal/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/portal", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: "cus_someone_else" }),
      })
    );
    expect(res.status).toBe(200);
    // Whatever it opened, it was not the id in the body.
    const sent = JSON.stringify([...world.data.entries()]);
    expect(sent).not.toContain("cus_someone_else");
  });

  it("a REFRESH with no claim left clears the stale session hint", async () => {
    // The hint is what the header reads to choose "Account" over "Sign in".
    // Given 180 days so recovery keeps being offered, it outlived every claim
    // it described — so the navigation asserted an identity that was gone.
    // There is nothing left to renew here, so the hint goes with it.
    const { POST } = await import("@/app/api/billing/session/refresh/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/session/refresh", { method: "POST" })
    );
    expect(res.status).toBe(401);
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("ic_session=");
    expect(cookie).toMatch(/Max-Age=0/);
    // The signed cookie is not touched: there was none, and clearing one we
    // never read is not this route's business.
    expect(cookie, "the 401 path started clearing signed claims").not.toContain("ic_ent=");
  });

  it("a full SIGN OUT and SIGN IN AGAIN round trip restores the subscription", async () => {
    seedPro();

    // Out.
    const { POST: signOut } = await import("@/app/api/billing/signout/route");
    const out = await signOut(
      new Request("https://immigrationclock.com/api/billing/signout", { method: "POST" })
    );
    expect(out.status).toBe(200);
    expect(out.headers.get("Set-Cookie") ?? "").toMatch(/Max-Age=0/);

    // The subscription itself is untouched — sign-out writes nothing.
    expect(world.data.get(`sub:${USER_KEY}`), "signing out changed the subscription").toBeTruthy();

    // And back in, from an emailed link, with the entitlement intact.
    const { tokenHash } = await import("@/lib/billing/store");
    world.data.set(
      `login:${tokenHash("tok-again", SESSION_SECRET)}`,
      JSON.stringify({ k: USER_KEY, e: USER })
    );
    const { POST: verifyLink } = await import("@/app/api/billing/signin/verify/route");
    const back = await verifyLink(
      new Request("https://immigrationclock.com/api/billing/signin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "tok-again" }),
      })
    );
    expect(back.status).toBe(200);
    expect(((await back.json()) as { plan: string }).plan).toBe("pro");
  });

  it("a magic link cannot be replayed after it has been spent", async () => {
    seedPro();
    const { tokenHash } = await import("@/lib/billing/store");
    world.data.set(
      `login:${tokenHash("tok-once", SESSION_SECRET)}`,
      JSON.stringify({ k: USER_KEY, e: USER })
    );
    const { POST } = await import("@/app/api/billing/signin/verify/route");
    const call = () =>
      POST(
        new Request("https://immigrationclock.com/api/billing/signin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: "tok-once" }),
        })
      );
    expect((await call()).status).toBe(200);
    const replay = await call();
    expect(replay.status, "a sign-in link worked twice").toBe(400);
    expect(((await replay.json()) as { error: string }).error).toBe("link_expired");
  });

  it("a REVOKED subscription cannot be signed back into, on any device", async () => {
    // Refund and dispute handling is the expensive part of this system. A new
    // device arriving with a valid emailed link must not be a way around it.
    world.data.set(
      `sub:${USER_KEY}`,
      JSON.stringify({
        email: USER,
        customerId: "cus_1",
        status: "canceled",
        currentPeriodEnd: NOW() + 200 * 86_400,
        revokedAt: NOW() - 60,
        updatedAt: 1,
      })
    );
    const { tokenHash } = await import("@/lib/billing/store");
    world.data.set(
      `login:${tokenHash("tok-revoked", SESSION_SECRET)}`,
      JSON.stringify({ k: USER_KEY, e: USER })
    );

    const { POST } = await import("@/app/api/billing/signin/verify/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/signin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "tok-revoked" }),
      })
    );

    // The link still proves control of the address — that is all it ever did.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan: string };
    expect(body.plan, "a revoked subscription was restored by an email link").toBe("free");

    // And the claim it mints unlocks nothing.
    const token = (res.headers.get("Set-Cookie") ?? "").match(/ic_ent=([^;]+)/)?.[1] ?? "";
    const ent = verify(decodeURIComponent(token), SESSION_SECRET, NOW())!;
    expect(ent.plan).toBe("free");

    // The account page calls it EXPIRED, not free: somebody who used to pay is
    // not somebody who never did, and the difference decides what to offer.
    const stored = JSON.parse(world.data.get(`sub:${USER_KEY}`)!) as SubscriberRecord;
    expect(accountStateFor(ent, stored, NOW()).status).toBe("expired");
  });

  it("an EXPIRED subscriber is downgraded, not ejected — and can still see why", async () => {
    // FOUND IN A BROWSER, NOT IN A UNIT TEST. Rendering /account for a lapsed
    // subscriber showed the SIGN-IN FORM: the page loads, its activation
    // component calls refresh, refresh saw a paid claim over a dead record and
    // cleared the cookie outright — ending the identity along with the
    // subscription. So the one page that exists to explain "your subscription
    // ended" had nothing to say, offered no route to the person's own invoices,
    // and asked for another email round trip to re-subscribe.
    //
    // Pro must stop. The proof that this person controls this address is
    // unaffected by Stripe declining a card.
    world.data.set(
      `sub:${USER_KEY}`,
      JSON.stringify({
        email: USER,
        customerId: "cus_1",
        status: "active",
        currentPeriodEnd: NOW() - 10,
        updatedAt: 1,
      })
    );
    const cookie = `ic_ent=${sign(claim(), SESSION_SECRET, NOW())}`;
    const { POST } = await import("@/app/api/billing/session/refresh/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/session/refresh", {
        method: "POST",
        headers: { cookie },
      })
    );

    // 402 still means "a paid claim was revoked" — the watchlist client reads
    // exactly this to stop claiming that syncing is on.
    expect(res.status).toBe(402);

    const set = res.headers.get("Set-Cookie") ?? "";
    const token = set.match(/ic_ent=([^;]+)/)?.[1] ?? "";
    const ent = verify(decodeURIComponent(token), SESSION_SECRET, NOW());
    expect(ent, "the identity was destroyed along with the subscription").not.toBeNull();
    expect(ent!.plan, "Pro survived a dead subscription").toBe("free");
    expect(ent!.email).toBe(USER);
    expect(ent!.customerId, "the route to their own invoices was lost").toBe("cus_1");

    // And the page it lands on says the true thing, with billing reachable.
    const stored = JSON.parse(world.data.get(`sub:${USER_KEY}`)!) as SubscriberRecord;
    const state = accountStateFor(ent, stored, NOW());
    expect(state.status).toBe("expired");
    expect(state.isPro).toBe(false);
    expect(state.hasBilling, "an expired subscriber cannot reach their invoices").toBe(true);
  });

  it("a first-time buyer's incomplete record is NOT treated as a revocation", async () => {
    // The other half of the same branch. Checkout seeds `incomplete`, and the
    // magic-link claim is free — so this path must answer 200 and keep the
    // identity, or Subscribe tells somebody to confirm an address they just did.
    world.data.set(
      `sub:${USER_KEY}`,
      JSON.stringify({
        email: USER,
        customerId: "cus_1",
        status: "incomplete",
        currentPeriodEnd: 0,
        updatedAt: 1,
      })
    );
    const cookie = `ic_ent=${sign(
      { plan: "free", email: USER, customerId: "cus_1", exp: NOW() + 86_400 },
      SESSION_SECRET,
      NOW()
    )}`;
    const { POST } = await import("@/app/api/billing/session/refresh/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/session/refresh", {
        method: "POST",
        headers: { cookie },
      })
    );
    expect(res.status, "a verified identity was destroyed before it could buy").toBe(200);
    expect((await res.json()) as { revoked?: boolean }).not.toHaveProperty("revoked");
  });

  it("one subscriber's claim cannot reach another's watchlist", async () => {
    // The watchlist is keyed on an HMAC of the VERIFIED address in the signed
    // claim. On this site a follow can imply a nationality, so a claim that
    // could name someone else's key would be the worst leak here.
    seedPro();
    const OTHER = "someone.else@example.com";
    const otherKey = emailKey(OTHER, SESSION_SECRET);
    world.data.set(
      `watch:${otherKey}`,
      JSON.stringify({ entityIds: ["country:india"], updatedAt: 1 })
    );

    const cookie = `ic_ent=${sign(claim(), SESSION_SECRET, NOW())}`;
    const { GET } = await import("@/app/api/billing/watchlist/route");
    const res = await GET(
      new Request("https://immigrationclock.com/api/billing/watchlist", { headers: { cookie } })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { entityIds: string[] };
    expect(body.entityIds, "a claim read another identity's watchlist").toEqual([]);
  });

  it("a claim signed with the wrong secret is worth nothing anywhere", async () => {
    seedPro();
    const forged = `ic_ent=${sign(claim(), "a-secret-we-do-not-use".padEnd(32, "x"), NOW())}`;
    const { GET } = await import("@/app/api/billing/watchlist/route");
    const res = await GET(
      new Request("https://immigrationclock.com/api/billing/watchlist", {
        headers: { cookie: forged },
      })
    );
    expect(res.status).toBe(401);
  });

  it("there is exactly ONE identity cookie, not a competing session system", async () => {
    // The whole point of reusing the magic-link identity is that nothing else
    // mints a session. Two cookies would be two sources of truth.
    const { COOKIE_NAME, SESSION_HINT_NAME } = await import("@/lib/billing/entitlement");
    expect(COOKIE_NAME).toBe("ic_ent");
    expect(SESSION_HINT_NAME).toBe("ic_session");

    const routes = src("src/app/api/billing/signin/verify/route.ts");
    const setCookies = routes.match(/serializeCookie\(/g) ?? [];
    // The signed claim and its readable hint. Nothing else.
    expect(setCookies.length).toBe(2);
  });
});
