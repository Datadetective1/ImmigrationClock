# ImmigrationClock — Route Inventory (Phase 0)

**Audit date:** 2026-08-01 · **Commit:** `0cc1099` · **Total built pages:** ~2,660 (static export)

Traffic and conversion roles are marked **(unmeasured)** wherever no analytics data exists — which is currently every route. They are stated as *intent*, not observed behavior.

Legend for recommendation: **Keep** · **Improve** · **Merge** · **Redirect** · **Retire**

---

## Core public routes

| Route | Audience | Purpose | Data source | Traffic role | Conversion role | SEO value | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | General public | Dashboard entry: origin map, 13 counters, personas, key dates, explore grid | `buildMetrics()` — mixed real (CBP, BLS) + modeled (ICE, DOS, wages, layoffs) | Primary entry (unmeasured) | Search bar, persona → partner, explore links | High (brand + "immigration statistics") | **Improve** — Phase 2. Lead with *what changed*, not static totals. Currently 6 sections; map-first delays the value proposition |
| `/search` | All | Cross-entity search incl. 2,614 employers | `data.search()` + `employers.ts` | Internal navigation | Routes to employer/state/country | Low (noindex-worthy) | **Improve** — unify with global SearchBar; add WARN employers. **Missing from sitemap** |
| `/for-you` | Immigrants, students, employers | Persona-based reading of the data | `relevance.ts`, `partners.ts` | Medium | Persona → partner links | Medium | **Improve** — repoint at topic hubs + follow/alerts before partners |
| `/insights` | General, journalists | Auto-generated plain-language takeaways | `insights.ts` | Medium | Deep links to trackers | Medium ("what the numbers say") | **Improve** — natural feeder for `/news-and-data` |
| `/pulse` | Returning visitors | "What changed this month" + newsletter | `changes.ts`, `pulse-email.json` | Return-visit driver | **Newsletter signup** | Medium | **Merge** into `/what-changed` (Phase 3), redirect `/pulse` → `/what-changed` |
| `/timeline` | General, researchers | Policy events overlaid on data | `events.ts` | Low | Context | Medium | **Keep** — feeds Phase 4 explainers |
| `/key-dates` | Immigrants, employers, students | Deadline countdowns | `key-dates.ts` (hardcoded, client-side countdown) | Medium, seasonal spikes | Date → partner ("get help") | High ("H-1B deadline", "DV lottery dates") | **Improve** — Phase 2 §5 / Phase 7 follow target. Verify every date annually |
| `/explained` | New visitors | Plain-English definitions | `explainers.ts` | Low | Comprehension | Medium (definitional queries) | **Keep** — reuse as the glossary layer inside topic hubs |
| `/resources` | Immigrants | Partner/service directory | `partners.ts` | Low | **Primary affiliate surface** | Low | **Keep**, pending the affiliate positioning decision (Q3) |

## Section hubs (proto topic hubs)

| Route | Audience | Purpose | Data source | Traffic role | Conversion role | SEO value | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/enforcement` | General, journalists | Enforcement & border overview | ICE + CBP selectors | Nav hub | Routes deeper | Medium | **Improve** → becomes `/topics/enforcement` pattern (Phase 5) |
| `/work-visas` | Workers, employers, students | Visas & workforce overview | H-1B + DOS + wages | Nav hub | Routes deeper | Medium | **Improve** → `/topics/h1b` pattern |
| `/immigration/enforcement-trends` | Journalists, researchers | ICE arrests / removals / detention | `enforcementYearly()` — **modeled** | Medium | Source clicks | **High** ("immigration enforcement statistics", "deportation statistics") | **Improve** — add provenance labels; strong hub candidate |
| `/border/encounters` | Journalists, general | CBP encounters by year/month/country | `cbpRows` (FY totals **real**; monthly + by-country **modeled**) | Medium | Source clicks | **High** ("border encounter data") | **Improve** — separate real from modeled visually |
| `/visa/f1-student-visas` | Students, universities | F-1 issuances by year & country | `visaRows` — modeled from DOS totals | Medium | Source clicks | High ("international student visa data") | **Improve** — a top Phase 5 hub candidate |
| `/layoffs-vs-h1b` | Workers, journalists, **prospects** | Layoffs beside sponsorship | ⚠️ **Modeled** `layoffsVsSponsorship()`, not the real WARN feed | Medium | **Closest thing to a B2B teaser** | High (contested query) | **Improve — urgent.** Repoint at real `warnH1bCrossLink()`; retire modeled backing |
| `/migration-map` | General | Interactive visa-origin map | `migration-map.ts` | Engagement / share | Routes to country pages | Low-Medium | **Keep** — strong engagement asset. **Missing from sitemap** |

## Employer, sponsor, and layoff routes

| Route | Audience | Purpose | Data source | Traffic role | Conversion role | SEO value | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/employer/[slug]` **× 2,614** | Job seekers, workers, attorneys | Real USCIS H-1B record + WARN cross-link + FAQ | ✅ `employers.json` (**real**, FY2023) + `warn.json` (**real**) | **Primary long-tail SEO engine** | Source clicks; partner panel | **Very high** ("does X sponsor H-1B") | **Keep + Improve.** Best asset on the site. Fix FY drift; consider `noindex` for the thinnest tail |
| `/company/[slug]` **× 10** | General | Curated sponsor profiles with multi-year trend, wages, worksites | ⚠️ **Modeled** around a real FY2024 anchor | Low | Partner panel | Medium — **duplicate intent with `/employer/`** | **Merge or Redirect.** Two employer page types confuse users and split link equity. Recommend folding the richer template into `/employer/` and redirecting |
| `/h1b/employers` | Job seekers | Searchable 2,614-employer directory | ✅ `employers.json` | Medium | Employer pages | High ("H-1B sponsor list") | **Keep** |
| `/h1b/top-sponsors` | General, journalists | Ranked sponsors, approvals, wages | Mixed: 10 modeled companies | Medium | Employer pages | **High** ("top H-1B sponsors") | **Improve** — back with the real 2,614-employer set |
| `/h1b/salaries/[jobTitle]` **× 8** | Job seekers | Wage data by title + FAQ | ⚠️ Modeled from LCA averages | Medium | Partner panel | **High** ("H-1B salary software engineer") | **Improve** — high-intent queries deserve real DOL LCA data |
| `/h1b/state/[stateCode]` **× 10** | Job seekers, employers | H-1B by state | Modeled apportionment | Low-Medium | Employer pages | Medium | **Improve** — real Data Hub state column already exists (`topState`) |
| `/layoffs` | Workers, journalists, **prospects** | Live WARN feed | ✅ **Real** `warn.json` (6,527 notices) | Medium | API + cross-link | **High** ("WARN notices") | **Keep + Improve.** Real data, under-promoted. **Missing from sitemap** |
| `/developers` | Developers, researchers, journalists | Free WARN API docs | ✅ Real | Low | Credibility / backlinks | Medium ("WARN API") | **Keep + Improve.** Backlink magnet. **Missing from sitemap**; `/api/` is robots-disallowed |

## Geographic routes

| Route | Audience | Purpose | Data source | Traffic role | Conversion role | SEO value | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/state/[stateCode]` **× 10** | Local readers, journalists | State H-1B, ICE, layoffs, wages | ⚠️ **Mixed and mislabeled** — real TX WARN, but modeled ICE-by-state unlabeled and **fabricated layoff notices** | Medium | Partner panel | High ("immigration statistics California") | **Improve — urgent (C-2, C-3).** Remove fabricated notices; label modeled ICE; wire real multi-state WARN |
| `/country/[countrySlug]` **× 10** | Diaspora, journalists | Country visa/enforcement view | Modeled apportionment, **honestly labeled in FAQ** | Medium | **Remittance/legal partners** | High ("H-1B visas India") | **Keep + Improve** — extend the FAQ's honest labeling to the visible stats |

## Trust and transparency routes

| Route | Audience | Purpose | Data source | Traffic role | Conversion role | SEO value | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/methodology` | Journalists, researchers, buyers | How figures are produced | Static | Low | **Trust — critical for B2B** | Medium | **Improve** — Phase 9. Must document the modeled/apportioned layer explicitly |
| `/data` | All | Freshness model, why not real-time | `refresh.ts` | Low | Trust | Medium | **Merge** into `/methodology` |
| `/sources` | Journalists, researchers | Source catalog | `sources.ts` | Low | Trust | Medium | **Merge** into `/methodology` |
| `/data-manifest` | Developers, researchers | Machine-readable manifest | `public/data-manifest.json` | Very low | Credibility | Low | **Keep** |
| `/about` | All | Who runs this, contact | Static | Low | Trust; contact email | Low | **Improve** — the contact address must actually work before B2B outreach |
| `/privacy`, `/terms`, `/disclosure` | All, AdSense | Policy pages | Static | Very low | Compliance | Low | **Keep** — required. Review under Phase 17 |

## Non-public / operational routes

| Route | Audience | Purpose | Data source | Traffic role | Conversion role | SEO value | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/admin/refresh-status` | Founder | Pipeline status | `refresh.ts` — ⚠️ **hardcoded periods + one fabricated FAILED row** | None | None | None (noindex + disallowed) | **Improve or Retire** — wire to real `refresh.json` or remove |
| `/admin/pulse-email` | Founder | Newsletter draft preview | `pulse-email.json` | None | None | None | **Keep** — Phase 8 review surface |
| `/ads.txt` | AdSense | Publisher verification | Env var | None | Ad revenue | None | **Keep** |
| `/robots.txt`, `/sitemap.xml`, `/icon.svg` | Crawlers | Infrastructure | Generated | — | — | Infrastructure | **Improve** — sitemap gaps noted above |
| `/api/warn.json`, `/api/warn.csv` | Developers | Free WARN feed (static files) | ✅ Real | Low | Credibility, backlinks | Blocked by robots | **Keep + Improve** — version the path (Phase 14) |
| `/not-found` | All | 404 | Static | — | — | — | **Keep** |

---

## Proposed new routes (Phases 3–5, 12 — not built)

| Route | Purpose | Phase |
| --- | --- | --- |
| `/what-changed` | Recurring public entry point, built on `changes.ts` | 3 |
| `/news-and-data` + `/news-and-data/[slug]` | Data-backed explainers, human-approved | 4 |
| `/topics/[topic]` | Topic hubs (start with h1b, workforce-reductions, enforcement) | 5 |
| `/intelligence` | Professional product landing + demo request | 12 |
| `/intelligence/sample` | Sample WARN × H-1B report | 13 |

## Redirects to plan

| From | To | Reason |
| --- | --- | --- |
| `/pulse` | `/what-changed` | Consolidate the change surface |
| `/data`, `/sources` | `/methodology` | Consolidate the trust surface |
| `/company/[slug]` | `/employer/[slug]` | Eliminate duplicate employer intent (pending Q4) |

⚠️ **Static export note:** `output: "export"` means redirects must be configured at the host (Vercel `redirects` in `vercel.json`), not via `next.config.js` `redirects()`, which is a no-op under static export.

## Sitemap gaps to fix

Currently missing from `sitemap.ts`: `/developers`, `/layoffs`, `/search`, `/migration-map`, `/insights`, `/pulse`, `/for-you`… — verify the full diff against the built route list. Additionally, every entry emits `lastModified: new Date()`, which discards the freshness signal Google would otherwise use.
