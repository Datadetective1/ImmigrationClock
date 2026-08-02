# ImmigrationClock — Implementation Roadmap

Derived from **Founder Directive v1.0**, Part 8 "Implementation Priority". The
Directive's priority order is the roadmap's phase order; nothing here reorders the
founder's stated priorities.

Companion: [founder-directive-gap-analysis.md](founder-directive-gap-analysis.md).

**Governing test for every item** (Directive Part 1): *"Will this make
ImmigrationClock the world's most trusted immigration intelligence platform?"* If
no, it is not on this roadmap.

---

## Phase 0 — Trust corrections ✅ COMPLETE (2026-08-01)

Recorded in [data-corrections.md](data-corrections.md).

- Synthetic WARN layoff records removed; every layoff figure now traces to a real
  state filing with its own portal URL.
- Employer fiscal-year drift corrected; the claimed year now derives from the
  ingested file.
- Newsletter no longer discards signups while claiming success.
- Fourth provenance label `modeled` introduced and applied.
- Sitemap gaps closed; per-source `lastModified` dates.
- Vitest introduced: 52 tests, including regression guards that fail the build if
  fabricated records return.
- `pass.txt` removed from the working tree; history-cleanup plan drafted for
  approval.

---

## Phase 1 — Finish trust and data integrity
**Directive Priority 1.** Nothing else starts until the platform is honest about
itself, and until we can measure whether any of it works.

### 1.1 Remove remaining unverified and fabricated claims
- Replace the hardcoded `FAILED` status and hardcoded periods in `refresh.ts` with
  values read from the actual pipeline output.
- Add a real `lastVerifiedAt` per source, distinct from `sourceUpdatedAt`
  (when the agency published) and `lastRefreshAt` (when we fetched).
- Verify or remove the `sameAs` social claim and the public contact address.
- Re-source or retire the hardcoded, stale `DETENTION_NOW` superlative.

**Directive:** Part 7 "Every page should answer: Can I trust this?"

### 1.2 Source registry — the foundation for events
A single typed registry of every official source: agency, official URL, dataset
URL, cadence, what it covers, its known lag, and its verification timestamp. Every
figure and every future event resolves its provenance through this registry rather
than through per-file constants.

This is deliberately built in Phase 1 rather than Phase 2: it is a trust artifact
first and an architectural enabler second.

**Directive:** Part 2 Pillar 1, Part 4 "Data Freshness".

### 1.3 Data-freshness contract on every major page
Directive Part 4 requires every major page to communicate: Source · Last refreshed ·
Data-through · Published · Methodology. Today this is inconsistent. One reusable
component, applied everywhere, reading from the source registry.

### 1.4 Reduce affiliate surface to a trust-safe subset
Per founder decision and Directive Part 5. Affiliate content moves behind
`/resources`. Data pages, `/what-changed`, topic hubs, methodology, employer pages,
and explainers stay editorially clean. AdSense stays off.

### 1.5 Turn on measurement
Plausible, env-gated, plus the event taxonomy from the analytics plan. The Directive
asks specifically for *"what users search for"* and *"which questions remain
unanswered"* — so search queries and zero-result searches are first-class events,
not an afterthought.

**Directive:** Part 4 "Analytics — optimize for successful understanding."

### 1.6 Remove dead subsystems
Prisma and the unused Python ingestors. Reduces dependency surface and the
`postinstall` hook.

### 1.7 Accessibility baseline
Contrast audit of the dark palette, focus states, skip link, keyboard traversal of
the nav and data tables.

**Exit criteria:** no unverified claim anywhere in the product; every major page
carries the full freshness contract; analytics reporting real sessions; tests and
build green.

---

## Phase 2 — The "What Changed" platform
**Directive Priority 2.** The flagship feature.

**Founder-set order (2026-08-01):** 2A event store → 2B all major government
adapters → 2C What Changed Today → 2D entity pages → 2E homepage redesign. The
homepage is deliberately last: once events drive it, it writes itself.

**Adapter priority within 2B:** Executive Orders · Presidential Proclamations ·
USCIS Newsroom · USCIS Policy Manual · Department of State · Visa Bulletin ·
Federal Courts · Congress · Department of Labor · CBP · ICE.

**Every event answers three questions**, not one:
1. What changed?  2. Who is affected?  3. What should they do next?
See [who-is-affected.md](who-is-affected.md).

### Progress
- ✅ **2A** — event model, impact model, country registry, event store, reader.
- 🟡 **2B** — 8 of 11 adapters built: Federal Register, Executive Actions,
  USCIS Newsroom, USCIS Policy Manual, Federal Courts, Congress, CBP, DOL/OFLC.
- ✅ **2C** — `/what-changed` shipped 2026-08-02. First consumer of the event
  store; `EventCard` is reusable for 2D entity pages.
- ⬜ **2D / 2E** — not started.

**Action required:** Congress is built and tested but ingests nothing until a
free key from https://api.congress.gov is set as `CONGRESS_API_KEY`. It reports
itself as unconfigured rather than failing, so this is silent unless checked.

### Founder decisions on Phase 2

**2026-08-02 — next phase.** After CBP and DOL, work shifts from adding sources
to the product itself: search, filtering, personalized tracking, alerts,
explanations of policy changes, and usability. The remaining low-value adapters
(ICE, state agencies, SEVIS, PERM/LCA bulk files) wait behind that.

**2026-08-02 — court coverage.** Federal courts are ingested for decisions that
establish or change immigration law, and not for the people in a case. Routine
individual petitions, asylum appeals, visa denials, and detainee habeas cases
are excluded, because a feed of "Liu v. Noem", "Hernandez v. Noem",
"Prado-Majano v. Blanche" is the individual-immigrant profiling `/methodology`
promises not to do. The accepted cost: a landmark decision captioned with an
individual's name is excluded along with the routine ones, since the filter
reads parties from the caption. Surfacing those needs an editorial review step
rather than an automatic rule.

**2026-08-02 — Department of State.** Externally blocked rather than unbuilt
(see the adapter table), so 2C shipped on the four working sources instead of
waiting. Blocked adapters stay documented in the registry and are revisited only
if the publisher exposes a supported machine-readable source.

**Why 2C landed before adapters 5–9.** The event pipeline was write-only for its
first four adapters: nothing under `src/app` read `@/lib/event-store`, so no
human had ever looked at the output. Rendering it exposed four defects that had
passed every test — evidence quotes cut mid-word, markup leaking into quotes,
rulemaking boilerplate presented as an obligation, and a non-immigration DOJ
notice leading the page. Each later adapter can now be validated against a real
surface instead of tests alone.

#### Adapter status within 2B

| # | Adapter | Status | Note |
|---|---------|--------|------|
| 1 | USCIS Newsroom | ✅ built | RSS. Individual criminal cases excluded by editorial policy. |
| 2 | USCIS Policy Manual | ✅ built | HTML scrape; severity from USCIS's own Policy Alert / Technical Update labels. |
| 3 | Department of State | 🚫 blocked | Verified 2026-08-01: state.gov site-wide errors; travel.state.gov behind Cloudflare bot protection, which we do not circumvent. DOS rulemaking already arrives via the Federal Register adapter — guarded by test. |
| 4 | Visa Bulletin | 🚫 blocked | Same Cloudflare barrier (hosted on travel.state.gov), plus its own risk: a table of dates where a mis-parse is a confidently wrong fact rather than a missing event. |
| 5 | Federal Courts | ✅ built | CourtListener, keyless. Policy-impact only: institutional litigation and published appellate rulings. Individual petitions, asylum appeals, visa denials, and detainee cases excluded by editorial policy — ~9 in 10 decisions filtered out. |
| 6 | Congress | ✅ built | Official Congress.gov API. Introduced and referred bills excluded — ~2% become law, so introduction is not change. **Needs `CONGRESS_API_KEY`**; reports as unconfigured until set. |
| 7 | Department of Labor | ✅ built | OFLC announcements (PERM, H-2A, H-2B, prevailing wage, FLAG). Date taken from the machine-generated URL path, not display prose; conflicting dates are skipped. Filing-software release notes are routine. DOL rulemaking arrives via Federal Register, not duplicated. |
| 8 | CBP | ✅ built | Projects the existing pipeline into events rather than re-fetching — one dataset, one reading. Works offline. Each monthly release is routine regardless of magnitude. |
| 9 | ICE | ⬜ | `blocked` — XLSX with drifting sheet layouts. |

### 2.1 The Event model
A canonical `ImmigrationEvent` with exactly the fields the Directive specifies
(Part 4): stable identifier, source agency, published date, effective date,
data-through date, classification, severity, summary, related entities, original
source URL, last verification timestamp.

Classification must distinguish, per Directive Part 3: new information · updated
information · corrected information · historical revision · announcement · data
release.

Built as a new `src/domains/events/` module — greenfield, so it establishes the
domain structure the Directive asks for (Part 4) at zero migration cost.

### 2.2 Federal Register ingestion
The largest gap in the repository. Free, keyed-by-nothing JSON API, filterable by
agency and document type. Brings USCIS, DHS, DOS, DOL, and ICE **rule-making** into
the platform — actual policy changes, not just statistical releases.

Then: Executive Orders, then federal court decisions, then Congress. In that order,
by tractability.

### 2.3 `/what-changed`
The recurring entry point. Built on `changes.ts` extended into the event engine —
deterministic calculation first, with per-dataset materiality thresholds documented
in `docs/change-detection-methodology.md`. No LLM in the numeric path, per Directive
Part 4. An LLM may draft plain-English summaries only after the structured
calculation is complete, and every summary must be traceable to its record.

### 2.4 Homepage restructure
Only after 2.1–2.3 exist. Reordered per Directive Part 3 to lead with what changed.
The origin map moves down; it is engagement, not understanding.

---

## Phase 3 — Knowledge graph and navigation
**Directive Priority 3.**

- Entity + relationship model (`Employer ↔ WARN ↔ H-1B ↔ Country ↔ Visa ↔ Agency ↔
  Policy ↔ Event`).
- Visa pages as living hubs (overview, latest changes, guidance, trends, timeline,
  FAQ, related employers/countries/news/policies).
- Country intelligence pages (news, visa info, embassy updates, announcements,
  timeline, FAQ, sources).
- Related-entity navigation surfaced on every page — "navigation should feel like
  exploring knowledge rather than browsing menus" (Part 6).
- Retire the modeled figures replaced by real data along the way.

---

## Phase 4 — Search and personalization
**Directive Priority 4.**

- Search across every entity type including news, policies, agencies, court cases.
- Result grouping that "encourages exploration" rather than returning isolated pages
  (Part 7).
- Following: countries, visa categories, employers, agencies, topics.
- Weekly digest built from followed entities.

---

## Phase 5 — Professional intelligence
**Directive Priority 5.** Not started before Phase 3 gives it a knowledge graph to
sell access to.

- `/intelligence` with its own identity, separate from the public platform.
- WARN × H-1B sample report — **blocked** until employer matching has confidence
  scoring, manual-review status, and weak-match exclusion. The current
  normalized-name join is not fit for paid output.
- Briefing request flow.
- Validation outreach assets.

---

## Phase 6 — Grounded AI
**Directive Priority 6.** Last, deliberately.

AI as interpreter over indexed ImmigrationClock knowledge only. It may summarize,
explain, compare, organize. It may never invent policy, fabricate statistics, hide
uncertainty, or replace citations. Every answer cites its underlying event or
dataset. When evidence is incomplete, it says so.

This phase is only safe once Phases 2 and 3 have produced a corpus worth grounding
in.

---

## Sequencing rationale

Each phase is a prerequisite for the next:

- Phase 1 makes the platform honest → without it, everything built on top inherits
  a credibility problem.
- Phase 2 produces **events** → the knowledge graph needs nodes with stable IDs.
- Phase 3 produces **relationships** → search needs something to traverse, and the
  professional product needs something to sell.
- Phase 4 produces **user intent signal** → tells us which professional features are
  actually wanted.
- Phase 5 monetizes → only after there is something proven worth paying for.
- Phase 6 interprets → only once there is a verified corpus to interpret.

Skipping ahead inverts a dependency every time.
