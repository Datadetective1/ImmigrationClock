# ImmigrationClock 🇺🇸⏱️

**Track the immigration, visa, enforcement, and workforce numbers shaping America.**

A public, mobile-first, fact-based U.S. immigration and workforce data dashboard —
inspired by [usdebtclock.org](https://www.usdebtclock.org), rebuilt with a modern,
dark, animated UI. ImmigrationClock makes enforcement, visa approvals, deportations,
border encounters, H-1B sponsorship, layoffs, and wage trends easy for ordinary
people to understand — **neutrally, with a source on every number.**

> _Facts first. Trends live. Sources included._

**🔴 Live:** https://immigrationclock.netlify.app

**Data:** Headline figures are **real, sourced U.S. government numbers** (USCIS, ICE,
CBP, the State Department, BLS) — e.g. FY2024 H-1B 399,395 approvals (India 283,397),
ICE removals 271,484, real top-10 employers. FY2024 is the latest complete year for
most series; FY2025 is preliminary and detention is a dated point-in-time figure.
Fine-grained per-state / per-country splits are clearly-labeled estimates derived
from those real totals (see [`/methodology`](https://immigrationclock.netlify.app/methodology)).

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
- **Methodology** and **Sources** pages — every metric defined, every dataset linked.
- **Admin refresh status** (`/admin/refresh-status`) — per-source ingestion health.
- **Programmatic SEO pages** — top sponsors, H-1B salaries by job title, H-1B by
  state, enforcement trends, border encounters, F-1 visas, layoffs-vs-H1B.
- **AdSense-ready** ad slots, dynamic `sitemap.xml` / `robots.txt`, OpenGraph image
  route, and full metadata.
- **Sample data** so the app works the moment you run `npm run dev` — no database
  required. A Prisma schema + seed + Python ingestion pipeline are included for the
  live-data path.

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
so any static host serves the generated `out/` directory — no Next.js runtime,
serverless functions, or database required at runtime.

**Live on Netlify:** https://immigrationclock.netlify.app
(`netlify.toml`: build `npm run build`, publish `out`, Node 20). Set
`NEXT_PUBLIC_SITE_URL` to the deployed URL so sitemap/canonical/OG links are correct.

Deploys also work on Vercel, GitHub Pages, Cloudflare Pages, or `npx serve out` —
anywhere static files are hosted.

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

[`.github/workflows/refresh-data.yml`](.github/workflows/refresh-data.yml) runs every
6 hours: it executes the same pipeline, **commits the historical archive back to the
repo when the data changes** (so it accumulates over time), and triggers a Netlify
rebuild. To enable it:

1. Link this GitHub repo to the Netlify site (enables git builds + build hooks).
2. Create a Netlify **build hook** and add it as the GitHub secret `NETLIFY_BUILD_HOOK`.

That's it — CBP and BLS now flow in automatically. To wire additional sources (DOS,
WARN, …), add a fetcher to `refresh-data.mjs` and consume it in `source-data.ts`.

(The Prisma schema + seed + Python `data_pipeline/` remain in the repo as a legacy
DB path but are **not** used by the live site, which is fully static + JSON-backed.)

---

## 💰 AdSense setup

Ad slots render labelled **placeholders** until you provide a publisher id.

1. Get approved for [Google AdSense](https://adsense.google.com).
2. Set `NEXT_PUBLIC_ADSENSE_CLIENT_ID="ca-pub-XXXXXXXXXXXXXXXX"`.
3. The AdSense script is injected in `src/app/layout.tsx`, and `AdSlot.tsx` renders
   real `<ins class="adsbygoogle">` units (top banner, sidebar, in-content, bottom
   banner). Optionally set per-slot ids:
   `NEXT_PUBLIC_ADSENSE_SLOT_TOP`, `..._SIDEBAR`, `..._INCONTENT`, `..._BOTTOM`.

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
