# 💰 Monetization — activation playbook

Everything below is **already built into the site**. It earns nothing until you
turn it on, which is just setting environment variables (in Vercel → Project →
Settings → Environment Variables) and signing up for a few programs. No code
changes required.

Do it in this order — top items are the fastest path to real money.

---

## 0. Turn on measurement first (so you can see what works)

You can't optimize what you can't see. The site already fires a `partner_click`
event (with a `?subid=ic-<placement>` tag identifying the exact module) and page
views — but only once an analytics provider is loaded.

| Env var | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | your domain, e.g. `immigrationclock.vercel.app` | **Recommended.** Cookieless, privacy-first, no consent needed. ~$9/mo. |
| `NEXT_PUBLIC_GA_ID` | `G-XXXXXXXXXX` | Free. Uses cookies, so it loads only after the cookie banner is accepted. |

Set one (Plausible is the cleaner fit for this site). After deploy, you'll see
`Partner Click` events broken down by partner + placement — that tells you which
pages and modules actually drive clicks.

---

## 1. Affiliate / partner links — the biggest lever in this niche

The "Helpful services" modules, the `/resources` page, the Key Dates "get help"
links, and the country pages all link to real services. **Out of the box they
point to each service's homepage** (useful, but un-attributed = you earn $0). To
earn, replace them with your tracked affiliate links via **one** env var:

```
NEXT_PUBLIC_PARTNER_LINKS={"wise":"https://wise.com/invite/...","sprintax":"https://...","esim":"https://..."}
```

It's a JSON object mapping **partner id → your tracked URL**. Any id you omit keeps
its homepage default. Partner ids and where to sign up:

| Priority | Partner id | Service | Affiliate program to search |
| --- | --- | --- | --- |
| ⭐⭐⭐ | `wise` | Money transfer | "Wise affiliate / referral program" |
| ⭐⭐⭐ | `remitly` | Remittances | "Remitly affiliate program" (Impact/Partnerize) |
| ⭐⭐⭐ | `sprintax` | Nonresident tax (F-1/J-1) | "Sprintax affiliate program" |
| ⭐⭐⭐ | `boundless` | Immigration applications | "Boundless affiliate / partner" |
| ⭐⭐⭐ | `attorney-match` | Lawyer lead-gen | An immigration-lawyer lead network (e.g. Martindale/Nolo/LegalMatch) |
| ⭐⭐ | `esim` | Airalo eSIM | "Airalo affiliate" (Impact) |
| ⭐⭐ | `newcomer-insurance` | Student/visitor health | "international student insurance affiliate" |
| ⭐⭐ | `credential-evaluation` | WES degree evaluation | "credential evaluation affiliate" |
| ⭐⭐ | `document-translation` | Certified translation | "RushTranslate / translation affiliate" |
| ⭐ | `resident-tax` | Resident tax filing | TurboTax/TaxAct affiliate |
| ⭐ | `newcomer-credit`, `credit-builder` | Banking & credit | newcomer fintech referral programs |
| ⭐ | `visa-jobs` | Visa-sponsor job search | relevant job-board affiliate |
| ⭐ | `intl-moving` | International moving | moving-lead affiliate |
| ⭐ | `english-prep`, `citizenship-prep` | Education | course affiliate (or leave as free gov links) |

Start with the three-star rows — they have the highest payout-per-action in this
audience. You don't need all of them.

---

## 2. Display ads (AdSense)

| Env var | Value |
| --- | --- |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | `ca-pub-XXXXXXXXXXXXXXXX` |
| `NEXT_PUBLIC_ADSENSE_SLOT_TOP` / `_SIDEBAR` / `_INCONTENT` / `_BOTTOM` | per-slot ids (optional) |

Until set, the ad slots show the newsletter signup instead of blank space. Get
approved at [adsense.google.com](https://adsense.google.com), then set the id —
the slots become real ad units automatically (loaded only after cookie consent).

> Approval needs real traffic + the policy pages, which you already have
> (`/privacy`, `/terms`, `/disclosure`, `/about`).

---

## 3. Newsletter (build the audience you can later sell to)

| Env var | Value |
| --- | --- |
| `NEXT_PUBLIC_NEWSLETTER_ENDPOINT` | your provider's subscribe URL (Buttondown, ConvertKit, Mailchimp…) |

The weekly "Immigration Pulse" signup is everywhere ads aren't configured. Wiring
a real endpoint starts growing a list you can later monetize with sponsorships.

---

## 4. Tip jar (low effort, small but free)

| Env var | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPPORT_URL` | a Buy Me a Coffee / Ko-fi / GitHub Sponsors URL |

Shows a "♥ Support this project" link in the footer.

---

## Where the money actually comes from (the funnels already in place)

- **Homepage origin map** → click a country → **country page** (remittance + legal
  partner modules). Highest-traffic entry point.
- **`/for-you`** → pick a persona → persona-matched partner module.
- **Key Dates** (home, `/work-visas`, `/key-dates`) → a deadline → the partner that
  helps you meet it (tax day → tax filing; H-1B window → legal).
- **`/resources`** → the full categorized directory.
- **Company / state pages** → contextual modules for people researching sponsors.

Every partner link is `rel="sponsored"`, labelled "Partner", and disclosed at
`/disclosure` (FTC-compliant). The neutral, sourced data is the moat — it's what
keeps the audience that makes all of the above convert.

---

## Recommended first session (≈1 hour)

1. Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` (or `NEXT_PUBLIC_GA_ID`). _See the data._
2. Join Wise, Remitly, Sprintax, Boundless, Airalo affiliate programs.
3. Set `NEXT_PUBLIC_PARTNER_LINKS` with those 5 links.
4. Apply for AdSense; set `NEXT_PUBLIC_ADSENSE_CLIENT_ID` once approved.
5. Check Plausible after a week to see which placements convert, and expand the
   partner list toward what's working.
