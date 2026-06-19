# ImmigrationClock 🇺🇸⏱️

**Track the immigration, visa, enforcement, and workforce numbers shaping America.**

A public, mobile-first, fact-based U.S. immigration and workforce data dashboard —
inspired by [usdebtclock.org](https://www.usdebtclock.org), rebuilt with a modern,
dark, animated UI. ImmigrationClock makes enforcement, visa approvals, deportations,
border encounters, H-1B sponsorship, layoffs, and wage trends easy for ordinary
people to understand — **neutrally, with a source on every number.**

> _Facts first. Trends live. Sources included._

**🔴 Live:** https://immigrationclock.vercel.app

**🚀 Deploy your own:** [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https%3A%2F%2Fgithub.com%2FDatadetective1%2FImmigrationClock)

> **Go live in 3 steps:** (1) merge the open PR into `main`; (2) import the repo at
> [vercel.com/new](https://vercel.com/new) — Next.js is auto-detected and `vercel.json` sets the
> security headers; (3) set `NEXT_PUBLIC_SITE_URL` to your Vercel URL (optionally
> `NEXT_PUBLIC_NEWSLETTER_ENDPOINT` for the Pulse signup). Every push to `main` then auto-deploys, and the
> daily GitHub Action keeps data fresh — rebuilding only when it actually changes, to stay within the free tier.

**Data:** Headline figures are **real, sourced U.S. government numbers** (USCIS, ICE,
CBP, the State Department, BLS) — e.g. FY2024 H-1B 399,395 approvals (India 283,397),
ICE removals 271,484, real top-10 employers. FY2024 is the latest complete year for
most series; FY2025 is preliminary and detention is a dated point-in-time figure.
Fine-grained per-state / per-country splits are clearly-labeled estimates derived
from those real totals (see [`/methodology`](https://immigrationclock.vercel.app/methodology)).

---

## ✨ What's inside

- **The Immigration Clock dashboard** — animated live counters for ICE arrests,
  removals, detention, border encounters, H-1B approvals/denials, F-1 visas, top
  sponsors, average offered wage, layoffs, and more. Each counter has a value,
  trend arrow, status color, source badge, last-updated date, and a tooltip.
- **Section trackers** — Enforcement, Border, Visa Flow, and Jobs/Wages, each with
  Recharts line/bar charts, ranking tables, a state heat-tile map placeholder, and
  filters.
- **Employer pages** (`/company/[slug]`) — H-1B approvals/denials, approval rate,
  LCA filings, offered wages, top job titles, worksites, year-over-year trend, and
  layoffs.
- **State pages** (`/state/[code]`) and **Country pages** (`/country/[slug]`).
- **H-1B employer directory** (`/h1b/employers`) — search the real USCIS H-1B
  Employer Data Hub (thousands of sponsors) by name for reported approvals,
  denials, and approval rate.
- **For You** (`/for-you`) — pick your situation (H-1B worker, F-1 student,
  employer, employment-based green-card applicant) and get the data that affects
  you, labelled and framed as context, not advice — plus the services that fit it.
- **Resources** (`/resources`) — a curated, honestly-labelled directory of the
  services newcomers actually use (immigration legal help, money transfer,
  nonresident tax, newcomer banking, insurance, eSIM). Contextual "Helpful
  services" modules also appear on the homepage, company, country, and state pages.
  This is the site's primary revenue layer — see **Monetization** below.
- **What changed / Pulse** — a cross-source "what changed this month" feed, a
  shareable [`/pulse`](https://immigrationclock.vercel.app/pulse) page, and an
  auto-generated weekly email (preview/copy at `/admin/pulse-email`).
- **Insights**, **Timeline** (events overlaid on the data), and **Explained**
  (Simple / Technical / Methodology reading-level toggle).
- **Search** (`/search`) + a persistent navbar lookup — find any employer, state,
  country, visa type, or job.
- **Reporting-lag transparency** (`/data`) — which sources are live vs curated and
  how far behind each is.
- **Methodology** / **Sources** / **Admin refresh status** pages; programmatic SEO
  pages (top sponsors, H-1B salaries, H-1B by state, enforcement, border, F-1).
- **SEO**: JSON-LD (Organization, WebSite SearchAction, BreadcrumbList), dynamic
  `sitemap.xml` / `robots.txt`, OpenGraph, full metadata. Ad slots fall back to a
  newsletter signup until AdSense is configured.
- **Live + curated data** through a build-time JSON pipeline (BLS, CBP, and Texas
  WARN fetched live; a growing historical archive). Works the moment you run
  `npm run dev` — no database required.

## 🧱 Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Animation | Framer Motion (animated counters) |
| Database | PostgreSQL + Prisma ORM |
| Ingestion | Python (pandas + SQLAlchemy) |
| Hosting | Vercel-ready |

---

## 🚀 Quick start (MVP — no database needed)

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The homepage, all section trackers, and every
employer/state/country page render from the **generated dataset snapshot**
(`src/lib/generated/dataset.json`, read via `src/lib/dataset.ts`). That snapshot
is produced at build time by `scripts/build-dataset.ts` from the curated +
modeled source in `src/lib/source-data.ts` — run `npm run build:data` to
regenerate it. This is the fastest way to see the product.

> `npm install` runs `prisma generate` automatically (postinstall). It does **not**
> need a database connection.

### Build & run production

```bash
npm run build
npm run start
```

---

## 🗄️ Database setup (live-data path)

The app reads from the sample dataset by default. To use PostgreSQL:

### 1. Configure environment

```bash
cp .env.example .env
```

Set `DATABASE_URL` (and `DIRECT_URL` if you use a pooled connection). Examples:

```env
# Local PostgreSQL
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/immigration_clock?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/immigration_clock?schema=public"
```

Create the database locally:

```bash
createdb immigration_clock        # or use Docker / Neon / Supabase
```

> **Hosted Postgres (recommended for Vercel):** create a free database on
> [Neon](https://neon.tech) or [Supabase](https://supabase.com), paste the pooled
> connection string into `DATABASE_URL`, and the direct string into `DIRECT_URL`.

### 2. Generate the client & run migrations

```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 3. Seed the database

```bash
npm run seed
```

This loads the **same sample dataset** the static MVP uses, so the database path
matches the UI exactly. Inspect it with:

```bash
npx prisma studio
```

### 4. (optional) Switch the app to read from the database

Set `USE_DATABASE="true"` in `.env`. (The data-access layer in `src/lib/data.ts`
is the single place to wire Prisma queries behind the existing selectors.)

---

## 🐍 Python ingestion scripts

Located in [`data_pipeline/`](data_pipeline). They download/normalize public
datasets and load them into PostgreSQL. See
[`data_pipeline/README.md`](data_pipeline/README.md) for details.

```bash
python -m venv .venv
# Windows:  .venv\Scripts\activate   |   macOS/Linux:  source .venv/bin/activate
pip install -r data_pipeline/requirements.txt

# run the full pipeline (uses DATABASE_URL; DRY-RUN if unset)
python data_pipeline/run_all_ingestions.py

# or one source
python data_pipeline/ingest_uscis_h1b.py
```

Each script downloads-or-reads public data, cleans column names, normalizes dates,
employer names and state codes, attaches the source URL + refresh timestamp, loads
into Postgres, writes a `RefreshLog`, logs row counts, and **fails gracefully**.

---

## 📜 All the commands

```bash
npm install                       # install deps (+ prisma generate)
npm run dev                       # start dev server (reads generated/dataset.json)
npm run build                     # prebuild (refresh + build:data) + next build
npm run start                     # run the production build
npm run lint                      # eslint

npm run refresh                   # fetch near-live feeds (BLS, CBP) → refresh.json + history.json
npm run build:data                # rebuild generated/dataset.json from source-data.ts
npm run backfill:history          # (re)seed the historical archive from CBP's monthly CSVs

npx prisma studio                 # browse the (legacy) database
python data_pipeline/run_all_ingestions.py   # legacy Postgres ingestion (not used by the site)
```

---

## ☁️ Deployment

The app builds as a **fully static export** (`next.config.js` → `output: "export"`),
so the host just serves the generated `out/` directory — no Next.js server runtime,
serverless functions, image optimization, or database required at runtime. That
makes it cheap to run and keeps usage inside the **Vercel Free (Hobby)** tier.

**Live on Vercel:** https://immigrationclock.vercel.app

Deploy by importing the GitHub repo in Vercel — the Next.js framework preset is
auto-detected and `vercel.json` sets the security headers. Every push to `main`
auto-deploys. Set `NEXT_PUBLIC_SITE_URL` to your deployed URL so
sitemap/canonical/OG links are correct. The export also works on GitHub Pages,
Cloudflare Pages, or `npx serve out` — anywhere static files are hosted.

### Data pipeline (how the numbers get in)

The site reads exactly one file at runtime: `src/lib/generated/dataset.json`. It is
produced at build time by the `prebuild` step, which runs two scripts:

1. **`scripts/refresh-data.mjs`** — fetches the near-live feeds:
   - **BLS** unemployment (public API), and
   - **CBP Nationwide Encounters** (parsed from CBP's published monthly CSV).
   It writes `src/lib/generated/refresh.json` + `public/data-manifest.json`, and
   **appends** the latest CBP month to the growing archive
   `src/lib/generated/history.json`. On any fetch failure it keeps the last good
   value (never fabricates, never crashes the build).
2. **`scripts/build-dataset.ts`** — runs the curated + modeled source
   (`src/lib/source-data.ts`), which prefers the live-fetched values when present,
   and serializes the full dataset to `dataset.json`.

Everything is labelled **reported / projected / estimated**, and CBP figures that
came from a real fetch are shown as *reported* with the actual reporting month.

### Tier 2 — automated live data + growing archive

[`.github/workflows/refresh-data.yml`](.github/workflows/refresh-data.yml) runs
**once daily**: it executes the same pipeline, and **only when the underlying data
actually changed** (ignoring timestamps) commits the refreshed snapshot + archive
back to the repo. That push to `main` triggers Vercel's git integration to rebuild.
Because the data moves at most weekly/monthly, this keeps Vercel builds to a handful
per month — comfortably within the free tier. To enable it:

1. Import this GitHub repo in Vercel (its Git integration auto-deploys pushes to `main`).
2. That's it — no secret required. *(Optional: if you prefer a Vercel **Deploy Hook**
   over git auto-deploy, add it as the secret `VERCEL_DEPLOY_HOOK` and the workflow
   will also ping it on a data change.)*

CBP, BLS, and Texas WARN now flow in automatically. To wire additional sources (more
WARN states, …), add a fetcher to `refresh-data.mjs` and consume it in `source-data.ts`.

(The Prisma schema + seed + Python `data_pipeline/` remain in the repo as a legacy
DB path but are **not** used by the live site, which is fully static + JSON-backed.)

---

## 💰 Monetization

ImmigrationClock sits in one of the highest-intent verticals on the web — people
making real immigration, money, and tax decisions. There are **four** revenue
levers, in rough order of revenue-per-visitor for this niche. All work on the
static export; none require a backend.

### 1. Affiliate / partner links (the biggest lever) ⭐

Contextual **"Helpful services"** modules sit beside (never inside) the data on the
highest-intent pages — the homepage + `/for-you` persona switcher, every company,
country, and state page — plus a dedicated [`/resources`](src/app/resources/page.tsx)
hub. They link to services newcomers genuinely use (immigration legal help,
certified document translation, foreign-degree evaluation, visa-sponsor job search,
international money transfer, nonresident tax filing, newcomer banking & credit,
student insurance, eSIMs, and international moving). In this niche an affiliate
signup/lead is worth far more than a display impression.

- The catalog lives in [`src/lib/partners.ts`](src/lib/partners.ts). Out of the box
  links point to each service's homepage, so the modules are useful immediately.
- **To earn**, map each partner id to your tracked affiliate/referral URL via one env
  var — no code changes:
  ```env
  NEXT_PUBLIC_PARTNER_LINKS={"wise":"https://wise.com/invite/abc","sprintax":"https://www.sprintax.com/?ref=you"}
  ```
  Ids: `boundless`, `attorney-match`, `wise`, `remitly`, `sprintax`, `resident-tax`,
  `newcomer-credit`, `newcomer-insurance`, `esim`, `citizenship-prep`,
  `credential-evaluation`, `document-translation`, `visa-jobs`, `credit-builder`,
  `intl-moving`, `english-prep`. Sign up for each program (Wise, Remitly, Airalo,
  Sprintax, Boundless, WES, RushTranslate, insurance/banking affiliates, etc.), or
  add/replace partners by editing `partners.ts`.
- Every outbound link is `rel="sponsored nofollow noopener"`, labelled **Partner**, and
  carries a `?subid=ic-<placement>` so your affiliate dashboard attributes revenue to the
  exact module (`for-you-h1b-worker`, `company`, `country`, `state`, `resources-legal`, …).
- A clear [`/disclosure`](src/app/disclosure/page.tsx) page (FTC/AdSense-compliant) is
  linked from every module and the footer. Trust is what keeps this earning.

### 2. Display advertising (AdSense)

Ad slots render labelled **placeholders** (a newsletter signup) until you provide a
publisher id.

1. Get approved for [Google AdSense](https://adsense.google.com).
2. Set `NEXT_PUBLIC_ADSENSE_CLIENT_ID="ca-pub-XXXXXXXXXXXXXXXX"`.
3. The AdSense script is injected in `src/app/layout.tsx`, and `AdSlot.tsx` renders
   real `<ins class="adsbygoogle">` units (top banner, sidebar, in-content, bottom
   banner). Optionally set per-slot ids:
   `NEXT_PUBLIC_ADSENSE_SLOT_TOP`, `..._SIDEBAR`, `..._INCONTENT`, `..._BOTTOM`.

### 3. Newsletter ("Immigration Pulse")

The weekly Pulse signup (`PulseSignup.tsx`) builds an email list you can later
monetize with sponsorships. Wire it up with `NEXT_PUBLIC_NEWSLETTER_ENDPOINT`
(Buttondown, ConvertKit, Mailchimp, …). Until then the ad slots double as list-builders.

### 4. Direct support (tip jar)

Set `NEXT_PUBLIC_SUPPORT_URL` to a Buy Me a Coffee / Ko-fi / GitHub Sponsors link to
show a **♥ Support this project** button in the footer. Hidden until configured.

> **Partner-click analytics:** the modules fire a `partner_click` event to GA4
> (`gtag`) or Plausible if present, so you can see which placements convert and tune
> the catalog. No analytics library is required — it's a no-op when none is loaded.

---

## 🔍 SEO

- Dynamic `sitemap.xml` (`src/app/sitemap.ts`) and `robots.txt` (`src/app/robots.ts`).
- Per-page metadata, canonical URLs, OpenGraph + Twitter cards (`src/lib/seo.ts`).
- Dynamic OG images (`/api/og?title=…`).
- Programmatic long-tail pages: `/h1b/top-sponsors`, `/h1b/salaries/[jobTitle]`,
  `/h1b/state/[stateCode]`, `/immigration/enforcement-trends`, `/border/encounters`,
  `/visa/f1-student-visas`, `/layoffs-vs-h1b`, `/company/[slug]`.

---

## 🧭 Project structure

```
src/
  app/                     # App Router pages, sitemap, robots, /api/og
  components/              # AnimatedCounter, MetricCard, charts, AdSlot, …
  lib/
    source-data.ts         # build-time curated + modeled source (NOT imported by the app)
    generated/dataset.json # build-time snapshot the app actually reads
    dataset.ts             # single runtime data source (reads generated/dataset.json)
    data.ts                # selectors / derived metrics over dataset.ts
    chart-data.ts          # Recharts row transforms
    sources.ts, seo.ts, site.ts, format.ts, refresh.ts, seo-pages.ts
prisma/
  schema.prisma            # full data model
  seed.ts                  # loads sample data into Postgres
data_pipeline/             # Python ingestion scripts
```

---

## ⚖️ Tone, safety & compliance

ImmigrationClock is built to be **urgent and emotionally engaging but neutral,
factual, and legally safe.** It:

- uses **only aggregated public government / reputable public datasets**;
- **does not** profile or track individual immigrants, report raids, or show
  private personal data;
- **does not** claim immigrants caused layoffs or that sponsorship replaced specific
  workers — layoffs and sponsorship are shown side-by-side **without asserting
  causation**;
- avoids dehumanizing language, slurs, and inflammatory framing.

**Footer disclaimer (shown site-wide):** _This platform uses public datasets for
informational and research purposes only. It does not provide legal, immigration,
employment, or financial advice. Data may lag official reporting schedules._

See [`/methodology`](http://localhost:3000/methodology) for how each metric is
defined and why some counters are estimated, and [`/sources`](http://localhost:3000/sources)
for the full list of datasets.

---

## 📄 License

Provided for informational and research use. Underlying government datasets are in
the public domain; verify any figure against its linked source.
