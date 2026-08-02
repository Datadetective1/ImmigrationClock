# ImmigrationClock — Current State Audit (Phase 0)

**Audit date:** 2026-08-01
**Commit audited:** `0cc1099` (branch `main`, working tree has `M pass.txt` + untracked `council/`)
**Method:** Full read of every tracked source file, generated data snapshot inspection, `tsc --noEmit`, `next lint`, and a full production build (`next build`).

> This document records what *is*, with evidence. Recommendations are proposals only — nothing has been changed.

---

## 0. Verification results

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npx tsc --noEmit` | ✅ Clean, exit 0 |
| Lint | `npx next lint` | ✅ "No ESLint warnings or errors" |
| Production build | `npx next build` | ✅ Succeeds. Static export, ~2,660 pages (2,614 `/employer/[slug]`, 10 `/company`, 10 `/state`, 10 `/h1b/state`, 10 `/country`, 8 `/h1b/salaries`, ~30 static) |
| Shared JS | build output | 87.6 kB first-load shared; heaviest routes ~204 kB (`/h1b/top-sponsors`) |
| Tests | — | ❌ **No test framework, no test files, no test script** |
| Dependency audit | — | Not run in this pass (proposed in Phase 1 checklist) |

The codebase is in **good technical health**. The risks below are almost entirely **data-integrity, editorial, and security** risks, not code-quality ones.

---

## 1. Critical findings (read these first)

### 🔴 C-1 — Live API keys and a database password are committed to git

`pass.txt` is tracked in the repository and present in `HEAD`. It has been committed since `8b73379`. It contains, in plaintext:

- An OpenAI API key (`sk-proj-…`)
- An Anthropic API key (`sk-ant-api03-…`)
- A Supabase project password and anon JWT, plus the project URL
- An ElevenLabs API key
- A Netlify build hook URL

**Containment:** `https://api.github.com/repos/Datadetective1/ImmigrationClock` returns `404` unauthenticated, which indicates the GitHub remote is **private**. That limits exposure but does not remove it — the keys are in git history, survive any clone, and one visibility flip or added collaborator exposes all of them.

**These keys must be treated as compromised and rotated regardless of repo visibility.** Rotation is a founder action (see `docs/founder-next-actions.md`, to be written in Phase 1). Removing the file from history is a separate, destructive git operation requiring explicit approval.

### 🔴 C-2 — Synthetic WARN "notices" for named real companies are presented as government records

`src/lib/source-data.ts:800-842` generates `layoffRows` — individual layoff records with a specific employer name, city, state, notice date, and headcount — from two synthetic sources:

1. A loop over `COMPANY_SEEDS[].layoffYears` that **splits an annual press-reported layoff total into N fabricated "events"**, each assigned a computed month and a day hardcoded to the 15th (`noticeDate: \`${ly.year}-${String(month).padStart(2,"0")}-15\``).
2. A hardcoded `EXTRA_LAYOFFS` array naming Intel, Salesforce, UPS, Charter Communications, Wells Fargo, Peloton, Boeing, and CVS Health with specific dates (several also on the 15th) and headcounts.

Every one of these rows is stamped with `sourceRef("warn_layoffs", …)` → source name **"State WARN Act Layoff Notices"**, source URL **dol.gov**.

They surface on `/state/[stateCode]` under the heading **"Recent layoff notices (WARN)"** with a WARN source badge (`src/app/state/[stateCode]/page.tsx:197-213`), and they drive the homepage **"Layoffs tracked"** counter and `/layoffs-vs-h1b`.

This attributes **specific, non-existent government filing dates to named real companies**. It is the highest-severity issue on the site: an editorial-integrity failure, a defamation-adjacent risk, and a direct violation of the project's own stated principle that every figure keeps its true source.

**Compounding the problem:** a genuine multi-state WARN feed already exists (6,527 real notices, `src/lib/generated/warn.json`) and powers `/layoffs`. The site runs two parallel layoff systems — one real, one fabricated — and the fabricated one occupies the higher-traffic surfaces.

### 🟠 C-3 — Modeled per-state and per-country enforcement figures are shown without provenance labels

`iceByState`, `iceByCountry`, `cbpByCountry`, `wageByState`, and `wageRows` are all generated in `source-data.ts` by apportioning national totals through hand-assigned weights and a `jitter()` function (`source-data.ts:158-172`, a seeded pseudo-random ±12% spread).

`/state/[stateCode]:92` renders `<Stat label="ICE arrests" value={formatNumber(agg.ice.arrests)} sub="FY2024" />` — a bare number with **no `ProvenanceTag`, no "Estimated" marker**. The page's `MethodologyNote` (line 220) discloses that *H-1B* attribution is a curated subset but says nothing about the enforcement figure being apportioned.

The `ProvenanceTag` component exists and works well. It simply is not applied on these programmatic pages. Country pages do better — their FAQ text says "apportioned from reported U.S. government totals… estimates, not official per-country counts."

---

## 2. Area-by-area audit

| Area | Current implementation | Working status | Evidence | Risk | Recommended action | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| **Framework** | Next.js 14.2.35 App Router, React 18, TypeScript 5.6, Tailwind 3.4, Recharts, framer-motion | ✅ Working | `package.json`, build output | Low | Keep. No migration needed. | — |
| **Rendering model** | `output: "export"` — fully static export, no serverless functions | ✅ Working | `next.config.js:12` | **Med** — blocks any runtime API, form handler, auth, or webhook without changing hosting model | Keep for now; note that Phase 7/12/14 features (lead form, newsletter capture, keyed API) require either a third-party endpoint or dropping static export | P1 |
| **Deployment** | Vercel via git integration; `vercel.json` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` | ✅ Working | `vercel.json`, workflow comments | Low. Stale `.netlify/` dir + a Netlify build hook in `pass.txt` suggest an incomplete migration | Confirm Vercel is the only live host; delete `.netlify/` | P2 |
| **Secrets** | `pass.txt` committed with live keys | 🔴 **Broken** | `git ls-tree HEAD` → `pass.txt`; content read | **Critical** | Rotate all 5 credentials; remove from tree; add to `.gitignore`; decide separately on history rewrite | **P0** |
| **Data: WARN (real)** | `scripts/build-warn.ts` (449 lines) — per-state adapters for TX/OR/CA structured feeds + merge of `warn-scraper.json` (biglocalnews Python scraper, refreshed via CI). Normalizes, dedupes, aggregates by employer. Best-effort: never overwrites last-good on failure | ✅ **Genuinely working and good** | `warn.json`: 6,527 notices, 5,202 employers, 857,864 employees, 5 states (NJ 2,289 / TX 2,358 / WA 1,476 / OR 395 / CA 9), range 2004-01-12 → 2026-07-08 | Med — CA yields only 9 notices, suggesting a broken/partial adapter. "5 states" is far below the founder-stated coverage impression | Investigate CA adapter; keep the honest `coverageNote`; this asset is the strongest monetization foundation | P1 |
| **Data: H-1B employer directory (real)** | `scripts/build-employers.ts` fetches the USCIS Data Hub CSV, aggregates approvals/denials per employer, filters ≥10 approvals | ✅ Working, but **stale and version-mismatched** | `employers.json`: `fiscalYear: 2023`, 2,614 employers of 28,061, `nationalApprovals: 176,949`, dataset URL `h1b_datahubexport-2023.csv` | **High** — the rest of the site asserts FY2024 employer data (`EMPLOYER_LATEST_FY = 2024`, homepage "FY2024, 399,395"). Employer pages say FY2023. Two different national denominators (176,949 vs 399,395) appear on the site with no explanation | Fix the archive-page scrape (the FY2024/25 export likely uses a different URL pattern); reconcile the two denominators in copy | **P0** |
| **Data: CBP border (real)** | `scripts/refresh-data.mjs` fetches CBP's published nationwide-encounters CSV, sums FY totals, appends to the archive | ✅ Working | `refresh.json`: FY2026 YTD 249,060 through May 2026, real dataset URL | Low. Correctly labeled `reported` when live | Keep. Best-implemented live feed | — |
| **Data: BLS unemployment (real)** | BLS Public Data API fetch at build | ✅ Working | `refresh.json`: 4.2%, June 2026 | Low | Keep | — |
| **Data: everything else (modeled)** | ICE by FY/state/country, CBP monthly + by country, DOS visa rows, wages, companies (10 seeds), layoffs — all built in `source-data.ts` from curated anchors + `jitter()` | ⚠️ **Working as designed, but under-disclosed** | `source-data.ts:158-172` (jitter), `:404-842` | **High** (see C-2, C-3) | Apply `ProvenanceTag` everywhere modeled data renders; retire fabricated per-notice layoff records entirely | **P0** |
| **Data freshness** | Local snapshot generated `2026-07-08`; WARN `2026-07-13` | ⚠️ ~3.5 weeks stale locally | `refresh.json`, `warn.json` | Low — CI refreshes on deploy | Verify the daily workflow is actually running on GitHub | P1 |
| **Data refresh CI** | 2 workflows: daily `refresh-data.yml` (11:00 UTC), twice-weekly `refresh-warn.yml` (Tue/Fri 09:00 UTC). Both compute a content signature and only commit when data genuinely changed, to stay in Vercel free tier | ✅ Well-designed | `.github/workflows/*.yml` | Low | Keep. This is a genuinely thoughtful piece of engineering | — |
| **Historical archive** | `history.json` — a single series: cumulative CBP nationwide YTD per monthly release, 9 points | ⚠️ Much narrower than "daily-committed historical archive of government data" | `history.json` (1,930 bytes) | Med — the claim overstates the asset | Either broaden the archive (snapshot each dataset per refresh) or describe it accurately | P1 |
| **Data classification** | `Provenance` = reported / projected / estimated; `Completeness` = complete / ytd / preliminary / point_in_time. Well-modeled in `types.ts`, defaulted in `data.ts:378` | ✅ **Excellent design** | `types.ts:10-39`, `ProvenanceTag.tsx` | Low where applied; High where omitted (C-3) | Enforce application with a test; add a `modeled` provenance value distinct from `estimated` | P1 |
| **Employer normalization** | `normalizeEmployer()` in `format.ts`, used to join WARN ↔ H-1B via exact normalized-string match | ✅ Working, deterministic | `warn.ts:64-69`, `warnH1bCrossLink()` | Med — exact-match only, no confidence score, no manual-review flag, no way to exclude weak matches (Phase 13 requires all of these) | Add match type + confidence + review status before any paid output ships | P1 |
| **WARN × H-1B language** | "Appearing in both does not imply one caused the other"; "WARN notices report planned layoffs; they do not indicate whether or how those roles relate to H-1B sponsorship" | ✅ **Correct and careful** | `employer/[slug]/page.tsx:177, 84` | Low | Keep this exact wording; reuse it verbatim in the paid report | — |
| **Public API** | Static files `public/api/warn.json` (2.7 MB) + `warn.csv` (854 KB), documented at `/developers`. No key, no rate limit | ✅ Working | `developers/page.tsx`, file sizes | Med — 2.7 MB uncached full-dump on every request; no versioning; no field selection; `robots.ts` disallows `/api/` so the endpoints are excluded from crawl | Add a versioned path before promoting; keep free tier as promised (Phase 14) | P1 |
| **Newsletter** | `PulseSignup.tsx`. **No provider is configured.** With `NEXT_PUBLIC_NEWSLETTER_ENDPOINT` unset, submit sets state to `done` and renders "✓ You're on the list." | 🔴 **Broken — silently discards addresses** | `PulseSignup.tsx:31-34` | **High** — shows a false confirmation; every subscriber acquired to date is lost. Also `mode: "no-cors"` means real failures are invisible once configured | Either wire a provider or show an honest "not open yet" state. This is the single biggest audience-growth leak | **P0** |
| **Newsletter content** | `scripts/build-pulse-email.ts` generates `pulse-email.html`/`.txt` + a `/admin/pulse-email` preview | ✅ Working (generation only) | `public/pulse-email.html` (9 KB) | Low | Good base for the Phase 8 draft workflow — no LLM in the loop, which is correct | — |
| **"What Changed" engine** | `src/lib/changes.ts` — `buildChangeFeed()` produces 5 items: CBP month-over-month, TX WARN MoM, ICE removal pace, H-1B reporting lag, BLS backdrop. Deterministic, threshold-gated (±1%), each item carries provenance + source | ✅ **Working — and this is the seed of Phase 3** | `changes.ts:57-171` | Low | **Do not rebuild.** Extend this into `/what-changed` with explicit per-dataset thresholds and a methodology doc | — |
| **Persona / "For You"** | `/for-you`, `relevance.ts`, `PersonaRelevance` on the homepage. Personas drive partner-link selection | ✅ Working | `for-you/page.tsx`, `relevance.ts` | Med — personas currently route mainly to affiliate partners rather than to data | Repoint personas at topic hubs and follow/alerts; keep partners secondary | P2 |
| **Search** | `search()` over 10 companies + 10 states + 10 countries + visa classes + job titles; `/search` additionally covers the 2,614-employer directory | ⚠️ Partial | `data.ts:748-806`, `SearchPageClient.tsx` | Med — the global `SearchBar` misses 2,600 employers and all 5,202 WARN employers | Unify search across all entity types | P2 |
| **Analytics** | GA4 (consent-gated) + Plausible (cookieless), App Router pageview tracking. GSC verification meta tag present in `layout.tsx:23` | ⚠️ Code correct, **not activated** | `AnalyticsScripts.tsx`; `.env.example` shows both vars empty | **High** — zero funnel visibility today | Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` or `NEXT_PUBLIC_GA_ID` before any further product work | **P0** |
| **Event taxonomy** | Ad-hoc: `partner_click` with `?subid=ic-<placement>` | ⚠️ Revenue-only | `partner-link.ts`, `MONETIZATION.md` | Med — no audience events (source-link click, chart interaction, signup, follow) | Define the Phase 11 plan before instrumenting | P1 |
| **SEO metadata** | `buildMetadata()` — canonical, OG, Twitter, robots, keywords. Applied on every page | ✅ Consistent | `seo.ts` | Low. `keywords` is ignored by Google (harmless) | Keep | — |
| **Sitemap** | ~2,660 URLs generated | ⚠️ **Omits real pages** | `sitemap.ts:11-37` | Med — `/developers`, `/layoffs`, `/search`, `/migration-map`, `/insights`… `/layoffs` and `/developers` are missing from `staticPaths` and not added by `seoPages()`. Also every entry uses `lastModified: now`, which tells Google nothing | Add missing routes; use real per-dataset dates | P1 |
| **robots.txt** | Allows all except `/admin`, `/api/` | ⚠️ | `robots.ts` | Low-Med — `/api/` disallow blocks the free WARN API from discovery while `/developers` promotes it | Reconsider: allow `/api/` or accept it as intentional | P2 |
| **Structured data** | Organization + WebSite/SearchAction sitewide; FAQPage on employer/country/salary/state pages built from visible content | ✅ Correctly implemented | `StructuredData.tsx`, `Faq.tsx` | Low. **But** `sameAs: twitter.com/immigrationclock` asserts ownership of an account that may not exist | Verify or remove the `sameAs` and `SITE.twitter`; add `Dataset` schema (Phase 10) | P2 |
| **Programmatic SEO** | 2,614 employer pages, each with real USCIS numbers, rank, national share, approval-rate comparison, FAQ, and a WARN cross-link where present | ✅ **Strong — genuinely differentiated** | `employer/[slug]/page.tsx` | Med — thin-content risk for the long tail (an employer with 10 approvals gets little unique substance) | Preserve every URL. Consider `noindex` below a substance threshold rather than deleting | P1 |
| **Admin pages** | `/admin/refresh-status`, `/admin/pulse-email` — `noindex`, disallowed in robots, but **publicly reachable** (static export, `ADMIN_TOKEN` is defined in `.env.example` and never read anywhere in `src/`) | ⚠️ | grep for `ADMIN_TOKEN` → only `.env.example` | Low-Med — content is not sensitive, but it is not "admin" in any real sense | Either remove the pretense or move behind the host's password protection | P2 |
| **Fake failure state** | `refresh.ts:59`: `// One source intentionally shown as FAILED to exercise the admin UI` — `bls_wages` is hardcoded to FAILED | ⚠️ Demo artifact | `refresh.ts:59` | Med — a status page that reports a fabricated status. `refreshRows()` periods are all hardcoded, not derived from the actual pipeline | Wire to the real `refresh.json`, or remove the page | P1 |
| **Prisma / Postgres** | `prisma/schema.prisma`, `seed.ts`, `lib/prisma.ts`, `USE_DATABASE` flag | 💀 **Dead code** | No `src/` file imports `prisma` except `lib/prisma.ts` itself; `USE_DATABASE` is never branched on | Low — but `@prisma/client` + `prisma` ship in dependencies and `postinstall` runs `prisma generate` | Remove, or document as a deliberate future path. Currently pure overhead | P2 |
| **Python pipeline** | `data_pipeline/` — 7 ingestion scripts + `run_all_ingestions.py`, writes to Postgres | 💀 **Dead relative to the site** | The app reads only `src/lib/generated/*.json`; only `warn-scraper` (an external pip package) is used, via CI | Low | Keep `ingest_warn_layoffs.py` as the alias reference; document the rest as unused | P2 |
| **Monetization: affiliates** | 16 partners, `rel="sponsored"`, "Partner" label, `/disclosure` page, `?subid=` attribution | ✅ Built, **not activated** | `partners.ts`, `MONETIZATION.md` | Med — an affiliate-heavy public surface sits in tension with "trusted neutral public data destination" positioning | Founder decision required (see Q3 below) | P1 |
| **Monetization: AdSense** | Slot components + `ads.txt` route; falls back to newsletter signup when unset | ✅ Built, not activated | `AdSlot.tsx`, `ads.txt/route.ts` | Med — same tension as above | Founder decision | P1 |
| **Monetization: B2B** | ❌ **Nothing exists.** No `/intelligence` route, no lead form, no report generator, no pricing, no sales assets | ❌ Absent | Route inventory | — | This is the entire Phase 12/13/15 build | P1 |
| **Payments** | None. No Stripe, no checkout | ❌ Absent | `package.json` | Low — correct for pre-validation | Do not build (Principle 13) | — |
| **Auth / accounts** | None | ❌ Absent | — | Low — correct | Do not build | — |
| **Tests** | None at all | ❌ Absent | No test files, no runner in `package.json` | **High** — Phase 13 requires regression tests on employer matching before any paid output ships | Add Vitest + the Phase-specified suites | **P0** |
| **Accessibility** | Semantic headings, `aria-label` on inputs, `aria-hidden` on decorative glyphs, `overflow-x-auto` on tables, `scroll-thin` | ✅ Reasonable baseline | Component reads | Med — dark-only palette (`text-slate-500` on `#05070d`) needs contrast verification; focus states not audited; no skip-link | Run an axe pass; verify contrast ratios | P1 |
| **Mobile** | Tailwind responsive throughout; tables wrapped in horizontal-scroll containers | ✅ Appears sound | Component reads | Low | Verify on a real viewport during Phase 2 | P2 |
| **Legal pages** | `/privacy`, `/terms`, `/disclosure`, `/about` all exist; footer disclaimer disclaims legal/immigration/financial advice | ✅ Present | Route inventory | Med — `hello@immigrationclock.com` must actually receive mail; no correction process; no data-retention policy | Phase 17 | P1 |
| **Dead / stale artifacts** | `.netlify/`, `out/`, `tsconfig.tsbuildinfo` (113 KB, tracked?), `council/` (untracked, 4 files, unrelated to the product) | ⚠️ | `ls`, `.gitignore` | Low | Clean up | P2 |

---

## 3. What already supports the public vision

These are real assets. Building on them beats rebuilding.

1. **`src/lib/changes.ts`** — a working, deterministic, threshold-gated change-detection engine with provenance on every item. This *is* the Phase 3 foundation.
2. **The provenance/completeness type system** (`types.ts`) — a genuinely well-designed data-integrity model. Most data sites do not have this.
3. **2,614 real employer pages** with USCIS figures, national share, rank, and FAQ schema. Real programmatic SEO value.
4. **6,527 real WARN notices across 5 states** with per-notice source URLs back to state portals.
5. **The WARN × H-1B cross-link** with correct non-causal language already written and shipped.
6. **The refresh CI** — change-signature gating so builds only fire on real data movement.
7. **Grouped navigation and hub pages** (`/enforcement`, `/work-visas`) — the topic-hub architecture is half-built already.
8. **`/methodology`, `/data`, `/sources`, `/data-manifest`** — the transparency layer exists.
9. **A calm, neutral dark design system** that already reads as an information product, not a political site.

## 4. What already supports monetization

1. **The WARN × H-1B join** — the exact first commercial use case, already computed (`warnH1bCrossLink()`).
2. **Employer normalization** — the join key already exists.
3. **`DownloadCsvButton`** — CSV export component already built.
4. **The free public API** — a credible top-of-funnel for a paid tier.
5. **Affiliate + AdSense infrastructure** — fully built, one env var from activation.

## 5. What is missing

| Missing | Needed for |
| --- | --- |
| Any working email capture | Everything. Highest-leverage gap. |
| Active analytics | Measuring anything at all |
| `/what-changed` route | Phase 3 — the daily return reason |
| `/news-and-data` + content schema | Phase 4 |
| `/topics/*` hub architecture | Phase 5 |
| `/intelligence` + lead form + sample report | Phases 12–13 |
| Match confidence / review status on employer joins | Phase 13 (blocking for paid output) |
| Any test suite | Phases 13 + testing requirements |
| Broadened historical archive | Phase 3 revision history |
| Unified search | Discovery |

## 6. Highest-risk technical issues

1. **No tests** — paid output cannot ship responsibly without regression tests on the matching logic.
2. **Static export blocks runtime features** — lead form, keyed API, and preference storage all need a third-party endpoint or a hosting-model change. Decide before Phase 7/12.
3. **Employer directory version drift** — the FY2023/FY2024 mismatch is visible to users today.
4. **2.7 MB uncached API dump** — will not scale if the API gains traction.
5. **`build-employers.ts` fails silently** (`process.exit(0)` on error) — a broken scrape looks like a successful build.

## 7. Highest-risk data and wording issues

Ranked by severity:

1. **Fabricated WARN notices attributed to named companies and to dol.gov** (C-2). Must be removed before anything else ships.
2. **Unlabeled modeled per-state ICE arrests** (C-3).
3. **Two conflicting national H-1B approval denominators** (176,949 FY2023 vs 399,395 FY2024) on the same site.
4. **"Historical archive" overclaim** — one 9-point CBP series.
5. **Fake FAILED status** on the refresh page.
6. **False newsletter confirmation** ("✓ You're on the list" when nothing was stored).
7. **`sameAs` Twitter claim** for a possibly non-existent account.
8. **`DETENTION_NOW`** hardcoded to 73,000 as of `2026-01-15` with tooltip "Among the highest levels in the system's history" — a superlative claim on a hardcoded number that is now ~6 months stale.

## 8. SEO and indexation concerns

- GSC verification tag is present, but indexation status is unknown (founder must check GSC).
- Sitemap omits `/developers`, `/layoffs`, `/search`, `/migration-map`, `/insights`, `/pulse` and others.
- `lastModified: now` on every sitemap entry destroys the freshness signal.
- Long-tail employer pages risk thin-content classification.
- `robots.txt` disallows `/api/` while `/developers` markets it.
- No `Dataset` structured data despite the site being fundamentally a dataset publisher.
- OG image is a single static `og.svg` — SVG OG images render inconsistently across platforms.

## 9. Analytics gaps

Nothing is measurable today. No provider is configured; only `partner_click` exists in code. The entire Phase 11 funnel — homepage → what-changed → topic → explainer → source-click → signup → intelligence → demo request — is uninstrumented.

---

## 10. Priority summary

| Priority | Item |
| --- | --- |
| **P0** | Rotate committed credentials (C-1) |
| **P0** | Remove fabricated WARN notice records (C-2) |
| **P0** | Fix or honestly disable newsletter capture |
| **P0** | Turn on analytics |
| **P0** | Fix employer-directory FY drift |
| **P0** | Introduce a test framework |
| **P1** | Provenance labels on all modeled figures (C-3) |
| **P1** | `/what-changed` built on `changes.ts` |
| **P1** | Sitemap completeness + real `lastModified` |
| **P1** | Match confidence before any paid output |
| **P1** | `/intelligence` + sample report |
| **P2** | Remove dead Prisma/Python paths, unify search, clean stale artifacts |
