# Deployment & configuration

Everything an operator needs to take this repository to production, and the
reasoning behind the choices that are not obvious.

The site is a **fully static export** (`output: "export"` in `next.config.js`).
There is no server runtime, no database, and no serverless function. Vercel
builds it and serves `out/` as files. Any static host works.

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
| `NEXT_PUBLIC_BUTTONDOWN_USERNAME` | no | Newsletter signup renders as unavailable rather than posting nowhere. |
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

## 2. The contact address is an open launch item

`NEXT_PUBLIC_CONTACT_EMAIL` is **not set**, and nothing in this repository sets
it. The site therefore ships with **no way for a reader to report an incorrect
figure**.

For a platform whose entire proposition is accuracy and correction, that is a
structural hole rather than a missing nicety, and it is the one launch blocker
this work could not close from inside the codebase: publishing an address is an
outward-facing decision about a real inbox that someone has to monitor.

**Before public beta, set it to an address you actually read.** A forwarding
alias (`corrections@…`) is preferable to a personal inbox — it will be scraped
and it will attract spam.

The plumbing is already complete and tested: `/about`, `/privacy`, `/terms` and
`/disclosure` render a contact route the moment the variable exists, and
`tests/trust-claims.test.ts` asserts none of them ever emit an empty `mailto:`.

---

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
oversight. Next.js inlines its hydration payload into every page, and CSP nonces
require a server to mint one per request — which a static export does not have.
Removing it breaks every page. What the policy still buys is worth having:
`object-src 'none'` and `base-uri 'self'` remove the classic injection
escalations, `frame-ancestors` blocks clickjacking, and `connect-src` pins where
data can be sent. The site renders no user-supplied content and stores no
credentials, so the residual risk from inline script is small. Revisit if a
server runtime is ever introduced.

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

- [ ] **Set `NEXT_PUBLIC_CONTACT_EMAIL`** in Vercel (§2 — open blocker).
- [ ] Set `CONGRESS_API_KEY` in Vercel **and** as a GitHub Actions secret.
- [ ] Enable branch protection on `main` requiring the CI `verify` job.
- [ ] Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` and/or `NEXT_PUBLIC_GA_ID` if you want analytics.
- [ ] Confirm the deployed response carries `Content-Security-Policy` and check the browser console on `/` and `/what-changed` for violations.
- [ ] Confirm `/admin/*` returns `noindex` and is absent from `sitemap.xml` (it is robots-disallowed, `noindex`, and unlisted — but it is **publicly reachable**, so it must never display anything sensitive).
- [ ] Run one `workflow_dispatch` of **Refresh data** and confirm it commits `events.json` and `events-index.json`.
