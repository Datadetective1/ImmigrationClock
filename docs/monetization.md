# Monetization

How ImmigrationClock earns money without damaging the thing that makes it
worth paying for. Written 2026-09-03, from an audit of the repository rather
than from assumptions about it.

---

## The rule everything below follows

The founder directive (Part 5) settles the hard question before it is asked:

> Revenue is earned by creating additional value, not by restricting essential
> public information.

> Whenever there is tension between increasing short-term revenue and
> preserving long-term trust: choose trust.

So the design rule is: **nothing that is free today becomes paid.** Every paid
capability is one the site does not have at all. `tests/billing.test.ts`
enforces this — each capability carries an `existsToday` flag, and a test fails
if anything already built is marked paid.

That is not only ethics. All 3,856 pages are prerendered and indexable, and the
search traffic they earn is the top of any funnel a paid tier could have.
Putting an existing page behind a login would remove it from the index and cut
off the demand the subscription depends on.

---

## 1. What the audit found

### Assets, with numbers

| Asset | Scale | Where |
|---|---|---|
| Recorded policy changes | 544 records, 525 indexed, each with its own page and source | `src/lib/generated/events.json` |
| H-1B sponsoring employers | 2,614 employers, FY2023 USCIS Data Hub | `employers.json` |
| WARN layoff notices | 7,457 notices, 5 states, 2004–2026 | `warn.json` (4.0 MB) |
| Sourced explainers | 14 | `src/lib/editorial/explainers.ts` |
| Data signals | 11 builders over the site's own data | `src/lib/editorial/signals.ts` |
| Free public API | `/api/warn.json`, `/api/warn.csv`, no key | `public/api/` |
| Newsletter | Resend, weekly, 4 locales, real sends recorded | `newsletter-sent.json` |
| Social | X live on an hourly schedule | `docs/social.md` |
| Analytics | Plausible, 20 events already defined | `src/lib/analytics.ts` |

### What is genuinely differentiated

1. **The WARN × H-1B join.** State layoff notices matched to USCIS sponsorship
   data (`warnH1bCrossLink()`). Neither source publishes this; the join is the
   product. **Strongest commercial asset.**
2. **The change archive with provenance.** 544 changes, each with a stable
   page, an effective date, a status and a source link. The Federal Register
   publishes the documents; it does not publish "what changed, and is it in
   force yet".
3. **Employer-level normalization.** The key that makes the two datasets
   joinable at all.

### What is not differentiated

- The H-1B numbers themselves. USCIS publishes the Data Hub export; anyone can
  download it. Our value is the joins, the normalization and the interface.
- The explainers. Many sites explain OPT.
- Raw Federal Register documents.

**This distinction sets the price ceiling.** We are selling monitoring and
joins, not exclusive data.

### Highest commercial intent, by page

`/employer/[slug]` and `/company/[slug]` · `/h1b/employers` ·
`/layoffs-vs-h1b` · `/what-changed` · `/developers`.

### Recurring problems, by segment

| Segment | The problem that recurs |
|---|---|
| Immigration attorneys / legal ops | "Did anything change this week that affects my clients?" Checking manually across USCIS, the Federal Register and the courts is the recurring cost. |
| Employers, HR, global mobility | "What changed that affects our sponsored population, and when does it take effect?" |
| Recruiters | "Which employers sponsor, for this job title, in this state?" — a list, exported. |
| Researchers, journalists | Bulk data with provenance, and something citable. |
| Applicants | Deadlines and plain-language explanation. **They should not be charged**; the directive is explicit that the public platform serves them. |

### What must stay free

Everything that exists today. Specifically the change archive and all 543 change
pages, the employer directory, the layoff feed and the public API, the weekly
newsletter, in-browser follows, per-page CSV downloads, explainers and data
signals.

### What the architecture has, and does not

| | Status |
|---|---|
| Authentication, accounts | **None**, and `/privacy` promises none for reading |
| Database, ORM | **None** |
| Stripe, any payment code | **None** before this change |
| Server runtime | Yes — `output: "export"` was removed for `/api/subscribe`; one serverless function exists |
| Saved items / watchlists | Yes, but `localStorage` only (`src/lib/follows.ts`, 6 entity types) |
| Email delivery | Yes — Resend, with entity-filtered editions already supported |
| Analytics | Yes — Plausible, plus four B2B events defined and never fired |

The last two rows are why the recommendation below is what it is: **the
newsletter engine already supports an edition filtered to a subscriber's
entities** (`docs/newsletter.md` §Segments). Nobody can receive one, because
there is no way to tell the server which entities are yours. That gap is the
product.

---

## 2. The business model

Ranked against the criteria requested, using repository evidence and labelled
assumptions where evidence does not exist.

| Model | Willingness to pay | Recurring | Effort | Defensibility | SEO risk | Time to $1 | Verdict |
|---|---|---|---|---|---|---|---|
| **B. Individual professional subscription** | Med-High (assumed) | **High** — the archive changes daily | Med | Med — the joins and the archive | **None** — adds only | Weeks | **PRIMARY** |
| F. Newsletter sponsorship | Med | Med | **Very low** — the newsletter ships already | Low | None | Days, if the list is large enough | **SECONDARY** |
| H. One-time paid reports | Med | **None** | Low-Med | Med (WARN × H-1B) | None | Weeks | Secondary, on demand |
| E. Premium export | — | — | — | — | — | — | Folded into B |
| D. Paid alerts | — | — | — | — | — | — | Folded into B |
| A. Free + Pro | — | — | — | — | — | — | This *is* B |
| C. Team subscription | Med-High | High | High (seats, roles) | Med | None | Months | **Not yet** — no individual has paid |
| I. API access | Med | High | High (keys, quotas, egress) | Low — the data is public | Removes a free asset | Months | **Not yet** |
| G. Ads / sponsorship of the site | Low | Low | Low | None | Hurts trust | Days | **No** — conflicts with the directive |

**Primary: ImmigrationClock Pro**, an individual professional subscription.
Monitoring and bulk work, built on assets that already exist.

**Secondary: newsletter sponsorship.** Fastest to first revenue, no paywall, no
accounts, no SEO risk. Blocked on one fact this repository cannot supply: the
subscriber count lives in Resend, not in git. **Do not quote a sponsorship rate
until you have read it from the Resend dashboard.**

**Not yet:** teams, API keys, ads. Each is defensible later; none is defensible
before one person has paid for anything.

---

## 3. Free versus Pro

| Capability | Free | Pro | New? |
|---|---|---|---|
| Full change archive, all change pages | ✓ | ✓ | existing |
| H-1B employer directory | ✓ | ✓ | existing |
| Public WARN API (JSON + CSV) | ✓ | ✓ | existing |
| Weekly newsletter | ✓ | ✓ | existing |
| Follows in your browser | ✓ | ✓ | existing |
| Per-page CSV download | ✓ | ✓ | existing |
| **Email alerts on your watchlist** | | ✓ | **new** |
| **Watchlist synced across devices** | | ✓ | **new** |
| **Bulk export** (whole filtered set) | | ✓ | **new** |
| **Professional search** (multi-filter archive) | | ✓ | **new** |
| **Employer monitoring** (WARN + sponsorship movement) | | ✓ | **new** |

No free row loses anything. Every Pro row is a capability the site does not
have yet.

---

## 4. Pricing

**Every number here is an assumption and none of it has been tested.**

| | Price | Reasoning |
|---|---|---|
| Pro monthly | **$19** | Below the $50–$99 legal-research tools these buyers already pay for, above the $5–$9 consumer band that signals a hobby product. One price, one decision. |
| Pro annual | **$190** | Two months free. Standard, legible, and it buys a year of runway per customer. |
| Free | $0, no limits | The public platform is not a trial. |
| Team | not offered | Offer one when an individual subscriber asks for seats, not before. |
| Trial | none at launch | The free platform is already the trial. A card-required trial adds refund handling before there is anything to refund. |

Anchors, not evidence: what these buyers pay for adjacent tools, and the
directive's insistence that the public platform stays primary. The first real
signal will be the `premium_interest` event described below — demand measured
before a price is in the way.

---

## 5. Stripe architecture

**There was no Stripe code in the repository before this change, and there is
no Stripe identifier in it now.** Price and product ids are named by
environment variable only.

### Shape

```
/pricing  ──click──>  POST /api/billing/checkout
                          │  creates a hosted Checkout Session
                          v
                   checkout.stripe.com          (card never touches this origin)
                          │
              ┌───────────┴────────────┐
              v                        v
   /account?session_id=cs_…     /pricing?checkout=cancelled
              │
     POST /api/billing/activate  ── asks Stripe: was this session PAID? ──> mints
              │                     a signed, httpOnly entitlement cookie
              v
          /account  ──"Manage billing"──> POST /api/billing/portal ──> Stripe portal

   Stripe ──events──> POST /api/billing/webhook  (signature verified, audit log)
```

### Decisions, and why

- **Hosted Checkout, not embedded.** No card field on this origin, no PCI
  scope, and the strict CSP in `vercel.json` needs no new script source. The
  redirect is a top-level navigation, which no CSP directive blocks.
- **No Stripe SDK.** Raw `fetch`, as the X, LinkedIn and OpenAI clients already
  do. Three form-encoded POSTs and one GET, against a pinned API version.
- **A signed claim instead of a session row.** There is no database. Stripe is
  the system of record; the browser carries an HMAC-signed cookie
  `{plan, email, customerId, exp}` that expires at the subscription's period
  end and in no case more than 30 days out.
- **Inert until switched on.** `BILLING_ENABLED` must be exactly `"true"` and
  every secret present, or every route answers 503 naming what is missing.

### Known limitation, stated plainly

Without a database, **a subscriber who clears cookies or moves to a new device
cannot restore access by themselves.** The next step (§8) is an emailed
sign-in link, which Resend already makes possible. Until then a lost session
needs a manual re-activation. This is the honest cost of not adding Postgres
before the first customer, and it is the first thing to fix after one exists.

Webhook events are verified and logged; they cannot yet *revoke* an entitlement
early, because there is nothing to write to. A cancelled subscription stops
working when the claim lapses (≤30 days) at the latest.

---

## 6. Analytics funnel

Six events, added to the existing Plausible taxonomy:

```
premium_interest ─> pricing_view ─> checkout_started ─> checkout_completed ─> subscription_active
                                                                                    │
                                                                          billing_portal_open
```

`premium_interest` is the one that matters before any of the others: it
measures whether anyone wants the paid capability, **before a price is in the
way**. Fire it wherever a Pro capability is touched.

Existing events that already reveal commercial intent, and should be read
alongside: `data_export`, `search_results`, `entity_follow`, `related_link_click`,
`source_link_click`, `social_post_click`.

**Every property is a fixed, low-cardinality string** — a capability id, a plan
id, an interval, a placement. Never an email, a search term, a followed
employer, a Stripe id or an amount tied to a person. This is an immigration
site; a followed entity can imply someone's nationality or visa status, and it
never leaves the browser.

---

## 7. What was implemented

**Implemented now** (all inert until an owner configures Stripe):

- The plan and capability model, with the free/paid boundary enforced by tests.
- Entitlement claims: HMAC signing, verification, expiry, capability gates.
- A Stripe client over raw `fetch`, and webhook signature verification.
- Four API routes: checkout, activate, portal, webhook.
- `/pricing` and `/account`.
- The six funnel events.
- 53 tests.
- Privacy-page corrections (see below).

**After initial data:** the paid capabilities themselves — alerts, sync, bulk
export, professional search, employer monitoring — built in the order that
`premium_interest` says people want them. Building all five before anyone has
expressed interest is how a year disappears.

**Deferred:** teams and seats, an API tier, ads, one-time reports.

### Privacy corrections shipped with this

`/privacy` said "we do not collect names, emails, or payment details" while
`/api/subscribe` was storing newsletter addresses in Resend, and claimed
"We use Google AdSense to display ads" when no advertising code exists anywhere
in the app. Both are now accurate, and the page describes the Stripe
relationship before any payment can be taken.

---

## 8. Manual actions the owner must perform

Nothing in this repository can create a Stripe account, a product or a key.
Click-by-click instructions are in the final report; the environment contract
is at the end of `.env.example`.

The very next step after that: **the emailed sign-in link**, so a paying
subscriber can restore access on a new device.
