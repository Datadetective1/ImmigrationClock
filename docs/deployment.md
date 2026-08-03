# Deployment & configuration

Everything an operator needs to take this repository to production, and the
reasoning behind the choices that are not obvious.

The site is **statically generated with one serverless function**. All ~2,700
pages are prerendered at build from the committed data layer, so a source outage
still cannot take a page down. The single exception is `POST /api/subscribe`,
added on 2026-08-03 for newsletter signup: Resend requires a secret API key, and
a static site has nowhere to keep one — a key shipped to the browser is a
published key.

`output: "export"` was therefore removed from `next.config.js`. Page rendering
does not depend on the function, so if it is down the site is unaffected apart
from signup. **A static host is no longer sufficient**; the deployment target
needs to run Next.js server functions (Vercel does, on the free tier).

---

## 1. Environment variables

All of these are optional **except where marked**. The site is designed to run
with none of them set — a missing variable degrades a feature, it never breaks a
build. That is deliberate: a claim the site cannot back (a social handle, a
contact inbox) must be absent rather than guessed at.

Set them in **Vercel → Project → Settings → Environment Variables**, for the
Production environment. `.env.example` is the canonical list; `.env` is
gitignored and must never be committed.

| Variable | Required | What it does if unset |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | no | Defaults to `https://immigrationclock.com`. Set on preview deploys so canonical/OG/sitemap URLs point at the right host. |
| **`NEXT_PUBLIC_CONTACT_EMAIL`** | **YES — see §2** | No corrections inbox is published anywhere. Readers have no route to report an error. |
| `NEXT_PUBLIC_TWITTER_HANDLE` | no | No `sameAs` claim in structured data, no social link. Include the leading `@`. |
| `CONGRESS_API_KEY` | **recommended** | The Congress adapter ingests nothing and reports itself *unconfigured* (not failed). Free key: <https://api.congress.gov>. Must also be added as a **GitHub Actions secret** or the daily refresh loses the source. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | no | No Plausible analytics. |
| `NEXT_PUBLIC_GA_ID` | no | No Google Analytics. |
| **`RESEND_API_KEY`** | **YES for signup** | Newsletter signup does not render. No `NEXT_PUBLIC_` prefix, ever — that would publish the key to every visitor. |
| **`RESEND_AUDIENCE_ID`** | **YES for signup** | As above. Both are required together; either alone does nothing. |
| `RESEND_FROM_EMAIL` | no | Defaults to `Immigration Clock <noreply@immigrationclock.com>`. Must be on a Resend-verified domain. |
| `RESEND_API_BASE` | no | Test seam only. Points the route at a stub. Must stay unset in production. |
| `NEXT_PUBLIC_BUTTONDOWN_USERNAME` | no | Unused unless you want a third-party provider *instead of* Resend — it takes precedence. |
| `NEXT_PUBLIC_NEWSLETTER_ENDPOINT` | no | Custom subscribe endpoint; takes precedence over the Buttondown username. |
| `NEXT_PUBLIC_NEWSLETTER_MODE` | no | Overrides signup presentation. |
| `NEXT_PUBLIC_PARTNER_LINKS` / `NEXT_PUBLIC_SUPPORT_URL` | no | Partner/support links are hidden. |

### Build-time only (not `NEXT_PUBLIC_`)

| Variable | Default | Purpose |
|---|---|---|
| `EVENTS_SINCE` | 90 days ago | How far back `build-events` looks. Use `2025-01-01` for a full backfill. |
| `EVENTS_LIMIT` | `250` | Per-adapter event cap. The CI refresh sets `1000`. When it engages it now says so in the build log — it is never silent. |
| `EVENTS_OFFLINE` | unset | `1` validates the committed store without touching the network. |

---

## 2. Email

Inbound is Cloudflare Email Routing; outbound is Resend. Addresses in use:

| Address | Used by |
|---|---|
| `hello@` | `NEXT_PUBLIC_CONTACT_EMAIL` — rendered on /about, /privacy, /terms, /disclosure, and set as `Reply-To` on the welcome email |
| `noreply@` | Sender for newsletter transactional mail (`RESEND_FROM_EMAIL`) |
| `security@`, `privacy@`, `support@`, `admin@` | Created and routed, **not yet referenced by the application** |

The last row is deliberate rather than forgotten. Wiring them means deciding
where each belongs (a `security.txt`, a privacy-request route, a support
surface that does not yet exist), and this codebase does not hardcode an inbox
it cannot prove is monitored — see `tests/trust-claims.test.ts`. Raise it as
its own small change when you want them surfaced.

### Newsletter signup

`POST /api/subscribe` adds the address to the Resend audience and sends a
welcome email. **Single opt-in**: the contact is stored on submit, and the
welcome email is what makes that defensible — nobody is added silently. Double
opt-in is a roadmap item, not a shipped feature.

The route is public and unauthenticated, so it is written for the internet:

- A duplicate signup returns **exactly** what a new one returns. Reporting
  "already subscribed" would turn the form into an enumeration oracle, and
  "is this person a reader of an immigration site" is a question this
  audience cannot afford to have answered.
- Upstream responses are never echoed to the client; detail goes to the log.
- Honeypot field, explicit-consent requirement, and best-effort per-IP rate
  limiting (5/min). **That limiter is per-instance and resets on cold start** —
  it raises the cost of casual abuse and will not stop a distributed attacker.
  Real protection belongs at the edge; see ROADMAP.md.

Verified end-to-end against a stubbed Resend on 2026-08-03: contact stored with
`unsubscribed: false`, welcome email sent from `noreply@` with `Reply-To:
hello@`, duplicate suppressed without a second email, invalid address and
missing consent both rejected before any upstream call.

**Not verified against the live Resend API** — that needs the real key, which
only you hold. After the first deploy, subscribe once with your own address and
confirm the contact appears in the Resend audience and the welcome email
arrives.

## 3. Analytics

Two independent, both opt-in, both off unless configured.

**Plausible** (`NEXT_PUBLIC_PLAUSIBLE_DOMAIN`) is cookieless, sets no
identifiers, and loads immediately. No consent banner is legally required for
it.

**Google Analytics 4** (`NEXT_PUBLIC_GA_ID`) sets cookies and therefore loads
**only after** the visitor accepts the consent banner. The banner writes a
stored decision and dispatches `ic-consent-change`; `AnalyticsScripts` listens
for it and injects `gtag` at that point and not before.

Both honour **Do Not Track** and **Global Privacy Control**. That is not
required for Plausible — it is done because a reader who has asked not to be
measured has asked clearly.

Because the app is a client-side-routed static export, GA4's automatic
`page_view` fires only on the first load. `AnalyticsScripts` sends a manual
`page_view` on each subsequent route change and skips the first to avoid
double-counting. If pageviews ever look doubled, that skip is the thing to
check.

**No advertising script is present.** Display ads were removed from the
platform; see `docs/founder-directive-gap-analysis.md` (conflict C-2).

### Content-Security-Policy and analytics

`vercel.json` pins `connect-src` and `script-src` to `plausible.io` and
`googletagmanager.com`. **Adding any third-party script means editing that
header**, or the browser will silently block it. This is the intended tradeoff:
a new tracker cannot be added by accident.

`script-src` carries `'unsafe-inline'`, which is a real weakening and not an
oversight. Next.js inlines its hydration payload into every page, and removing
the directive breaks every page.

Nonces are the proper fix and they need a server to mint one per request. Until
2026-08-03 there was no server, which settled the question. There is one now —
but only for `/api/subscribe`; every *page* is still statically generated at
build time, so there is still no per-request moment at which a nonce could be
issued. Adopting nonces would mean making pages dynamic, which trades the
reliability the whole architecture is built on for a hardening measure this
threat model barely needs. Recorded in ROADMAP.md rather than done.

What the policy still buys is worth having: `object-src 'none'` and
`base-uri 'self'` remove the classic injection escalations, `frame-ancestors`
blocks clickjacking, and `connect-src` pins where data can be sent. The site
renders no user-supplied content and stores no credentials in the browser, so
the residual risk from inline script is small.

---

## 4. CI and the automated pipelines

Three workflows, with different jobs.

**`ci.yml`** — typecheck, lint, test, production build, on every push and pull
request to `main`. It does **not** run the data pipeline: `npm run prebuild`
fetches from eight government sources, and making that a merge gate would let an
unrelated agency outage block an unrelated pull request. It builds with
`--ignore-scripts` so it compiles the *committed* data.

> Enable **branch protection on `main` requiring the `verify` job**. Without it
> this workflow reports failures rather than preventing them.

**`refresh-data.yml`** — daily at 11:00 UTC. Runs the real `prebuild`, then
commits the regenerated data **only if the underlying data actually changed**,
ignoring timestamps. The push to `main` triggers Vercel's git integration.
Gating on real change keeps builds within the Vercel free tier.

The change signature includes the **set of event IDs**. It previously did not,
and the omission meant a new Executive Order produced no commit and therefore no
deploy unless BLS, CBP, WARN or employer data happened to move the same day —
the flagship feature was not on the automation at all. The signature uses IDs
rather than the file because `events.json` carries a `generatedAt` and a per-run
adapter report that change on every run; hashing the file would deploy daily and
defeat the free-tier gate.

**`refresh-warn.yml`** — Tuesdays and Fridays. Needs Python, Selenium and Xvfb,
which is exactly why it is a separate job: the site build stays Python-free and
just reads the committed JSON.

---

## 5. The event archive

`src/lib/generated/events.json` is **committed** and grows monotonically.
`build-events.ts` merges by stable event ID and never deletes — a source outage
must not erase what was already recorded. Removing an event requires an explicit
entry in the `RETRACTED` map, which is a reviewed code change with a stated
reason, visible in git history.

`events-index.json` is the browser's slim view, capped at a **400KB payload
budget**. On a large archive it is therefore a *window*: the newest events that
fit. The store keeps everything; search reaches the window. The `/what-changed`
page states the shortfall in words, and `tests/event-index.test.ts` asserts both
the budget and that the window is an unbroken newest-first run rather than a
sample with holes.

To extend the archive backwards:

```bash
EVENTS_SINCE=2025-01-01 EVENTS_LIMIT=1000 npm run build:events
```

---

## 6. Pre-launch checklist

Done:

- [x] `NEXT_PUBLIC_CONTACT_EMAIL` set (`hello@`) — verified live in production.
- [x] Cloudflare Email Routing configured and tested.
- [x] Resend domain verified.
- [x] Repository public, so CI status checks are enforceable.

Still required:

- [ ] Set **`RESEND_API_KEY`** and **`RESEND_AUDIENCE_ID`** in Vercel, then
      **redeploy** — both are read at build time, so the signup form will not
      appear until a build runs with them present.
- [ ] Set `CONGRESS_API_KEY` in Vercel **and** as a GitHub Actions secret.
      Without the secret, the daily refresh silently loses the Congress source.
- [ ] Enable **branch protection on `main` requiring the CI `verify` job**.
- [ ] After the first deploy with Resend live: subscribe once with your own
      address, confirm the contact lands in the Resend audience and the welcome
      email arrives. This is the only part of the signup flow that cannot be
      verified without the real key.
- [ ] Confirm the deployed response carries `Content-Security-Policy`, and check
      the browser console on `/` and `/pulse` for violations.
- [ ] Optional: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` and/or `NEXT_PUBLIC_GA_ID`.

Note: `/admin/*` is `noindex`, robots-disallowed and absent from the sitemap,
but it is **publicly reachable** — a statically generated site cannot
authenticate. It must never display anything sensitive.
