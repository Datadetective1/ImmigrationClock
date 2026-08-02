# Founder Directive v1.0 — Gap Analysis

**Directive read in full:** `ImmigrationClock_Founder_Directive_v1.0.md` (Parts 1–8)
**Repository audited at:** 2026-08-01, after the Phase A trust corrections
**Status of this document:** analysis and recommendation only. No vision has been changed.

The Directive is now treated as the project's constitution. Where the current
implementation conflicts with it, the conflict is documented below with tradeoffs
and a recommendation — not resolved unilaterally.

---

## 1. Scorecard against the Directive's own priority order

The Directive (Part 8) sets the implementation priority. This is the honest state
of each level.

| Directive priority | State | Evidence |
| --- | --- | --- |
| **P1 — Trust and data integrity** | 🟡 **~70%** | Fabricated WARN records removed, provenance labels landed, FY drift fixed, newsletter no longer discards signups, 52 regression tests. Remaining: a hardcoded fake FAILED status, an unverified social claim, a stale superlative, affiliate density, analytics still off. |
| **P2 — "What Changed" platform** | 🔴 **~15%** | `src/lib/changes.ts` produces 5 deterministic items with source + provenance. But there is no event model: no stable IDs, no effective dates, no severity, no classification, no related entities, no verification timestamp, no `/what-changed` route, and no coverage of the Directive's named sources (Federal Register, Executive Orders, courts, Congress). |
| **P3 — Knowledge graph and navigation** | 🔴 **~10%** | Entities exist as page types (employer, country, state, visa) but there is no relationship model. Cross-links are hardcoded per page. The WARN × H-1B join is the only real edge in the system. |
| **P4 — Search and personalization** | 🔴 **~20%** | Search covers employers, states, countries, visa classes, job titles. It does not cover news, policies, agencies, or court cases. No personalization, no following, no accounts. |
| **P5 — Professional intelligence** | 🔴 **0%** | No route, no sample report, no lead capture. Correctly not built yet. |
| **P6 — AI experiences** | ⚪ **0%** | Correctly not built. No AI is in the data path anywhere, which is the right starting position. |

**Read:** the platform is roughly a strong Stage-0. It is a well-built data site
with a genuine trust layer. It is not yet an event-driven knowledge platform, which
is what the Directive describes.

---

## 2. Conflicts between the current implementation and the Directive

These are places where the code as written contradicts a stated principle. Each
needs a decision.

### C-1 — Modeled data exists at all
**Directive:** "Official Sources First… information should originate from official
government sources." "Every statistic must have a traceable source." (Parts 1, 2)

**Reality:** ICE arrests by state, removals by nationality, border encounters by
citizenship, per-state wages, and the ten curated employer profiles are all
apportioned from national totals using **weights ImmigrationClock invented**. No
agency publishes these breakdowns. Phase A labelled them `Modeled` and added
tooltips naming what was apportioned. They are now honest, but they are still not
official.

**Tradeoff:**
- *Keep, labelled* (current): state pages, country pages, and the enforcement page
  keep their charts. Users get scale intuition. But the platform publishes numbers
  no government produced, which is exactly the thing the Directive says it is not.
- *Remove entirely*: `/state/[stateCode]`, `/country/[countrySlug]`, and parts of
  `/immigration/enforcement-trends` lose most of their content. ~20 programmatic
  pages become thin. Real SEO loss.
- *Replace with real data*: ICE publishes some AOR-level (field-office) data; DHS
  publishes country-of-nationality removal tables. Real, but coarser and more work.

**Recommendation:** third option, staged. Keep the labelled modeled figures for now
(removal today would gut real pages for no user benefit), but treat every modeled
figure as **technical debt with a replacement ticket**, and set a rule: *no new
modeled data may be added, ever.* Track the count down to zero. I would not build
the professional product on top of any modeled figure.

**Needs your decision.**

### C-2 — Affiliate monetization sits inside the data experience
**Directive:** "Not a content farm." "Trust is the product. Revenue is the
consequence of trust." "Whenever there is tension between increasing short-term
revenue and preserving long-term trust: choose trust." (Parts 1, 5)

**Reality:** 16 affiliate partners render inside state pages, country pages,
employer pages, `/for-you`, and Key Dates. AdSense slots exist on the homepage,
`/layoffs-vs-h1b`, `/immigration/enforcement-trends`, and more.

You already decided (decision #3) to reduce this to a trust-safe subset behind
`/resources`. That decision **aligns with the Directive** and is now Phase 1 work.

**Recommendation:** execute your decision. Additionally, keep AdSense off entirely
until the public platform has a reason to exist commercially — a journalist or
researcher who sees ad units next to enforcement statistics discounts the whole
site, and that is the audience the Directive is built to win.

### C-3 — A fabricated operational status
**Directive:** "Every page should answer: Can I trust this?" (Part 7)

**Reality:** `src/lib/refresh.ts:59` hardcodes one data source to `FAILED` "to
exercise the admin UI", and the whole refresh table's periods are hardcoded rather
than read from the actual pipeline. A page whose job is to report system honesty is
itself dishonest.

**Recommendation:** fix in Phase 1. Not negotiable — this is the same class of
error as the fabricated WARN records.

### C-4 — The homepage does not answer "what changed today"
**Directive:** "The homepage exists to answer one question: *What changed today?*"
"closer to Bloomberg or Our World in Data than a traditional dashboard." (Part 3)

**Reality:** the homepage leads with an animated origin map, then a grid of static
counters. The change feed is not on it at all — it lives on `/pulse`.

**Recommendation:** Phase 2 (this is Directive P2 work, and it depends on the event
model). Do not restructure the homepage before there is something real to put at
the top of it.

### C-5 — Repository is organized by page, not by domain
**Directive:** "Organize the repository around domains rather than isolated pages…
events, employers, visas, countries, agencies, datasets, search, alerts,
intelligence, shared UI, shared services." (Part 4)

**Reality:** flat `src/lib/*.ts` (30 modules) and `src/app/*` route folders.
Business logic for employers is spread across `employers.ts`, `warn.ts`, `data.ts`,
and three page files.

**Tradeoff:** a big-bang reorganization is a large diff with real regression risk
and no user-visible benefit. The Directive also says "Reuse before rebuilding" and
"avoid unnecessary complexity."

**Recommendation:** migrate incrementally, domain by domain, as each domain is
touched for feature work. Start with `events/` in Phase 2 (greenfield, no migration
cost), then `employers/` when the professional product needs it. Do not schedule a
standalone refactor sprint.

### C-6 — Unverified claims about ourselves
**Reality:** site-wide JSON-LD asserts `sameAs: twitter.com/immigrationclock`, and
`SITE.contactEmail` is `hello@immigrationclock.com`. If either is unowned, the site
is making an unsourced claim about itself in structured data — a small version of
the exact failure Phase A corrected.

Separately, `DETENTION_NOW` is hardcoded at a value "as of 2026-01-15" with the
tooltip "Among the highest levels in the system's history" — a superlative on a
number that is now ~6 months stale and never re-verified.

**Recommendation:** Phase 1. Verify or remove.

### C-7 — The Directive's core sources are absent
**Directive:** events may originate from "USCIS, Department of State, DHS, CBP, ICE,
Department of Labor, **Federal Register, Executive Orders, Federal Courts,
Congress**." (Part 4)

**Reality:** the last four have **zero** coverage. These are precisely the sources
that produce *changes* — which is what the flagship feature is supposed to detect.
The current pipeline covers statistical releases only, which move monthly at best.

**This is the single largest gap in the entire repository.** The Federal Register
publishes a free, well-documented, no-key JSON API with full-text search by agency
and document type. It is the highest-leverage addition available and directly
enables Directive P2.

**Recommendation:** Phase 2, first work item.

### C-8 — Dead subsystems
Prisma (schema, client, seed, `postinstall`) and the Python `data_pipeline/` are
both unused by the running app. The Directive says "Avoid duplicated business
logic" and "leave the codebase cleaner than you found it."

**Recommendation:** remove Prisma in Phase 1 (it also removes a dependency and a
`postinstall` hook). Keep `data_pipeline/ingest_warn_layoffs.py` as the documented
reference for the WARN header-alias table; delete the rest.

---

## 3. Gaps that are additive, not conflicting

These are things the Directive requires that simply do not exist yet.

| Gap | Directive reference | Phase |
| --- | --- | --- |
| Canonical **Event model** (stable ID, agency, published/effective/data-through dates, classification, severity, related entities, source URL, last-verified timestamp) | Part 4 | 2 |
| `/what-changed` route with new/updated/corrected/revised/announcement/data-release distinction | Part 3 | 2 |
| Federal Register + Executive Order + court + Congress ingestion | Parts 2, 4 | 2 |
| Entity relationship model — the actual knowledge graph | Parts 3, 6 | 3 |
| Visa hub pages as "living knowledge hubs" | Part 3 | 3 |
| Country pages with embassy info, announcements, timeline | Part 3 | 3 |
| Search across news, policies, agencies, court cases | Part 7 | 4 |
| Following countries / visas / employers / agencies / topics | Part 7 | 4 |
| Professional intelligence product | Part 5 | 5 |
| Grounded AI interpreter over indexed knowledge only | Parts 4, 6 | 6 |
| Analytics measuring "what users search for" and "which questions remain unanswered" | Part 4 | 1 |
| Accessibility audit (contrast, keyboard, screen reader, slow connections) | Part 7 | 1–2 |

---

## 4. What the current codebase does *well* against the Directive

Worth stating, because the Directive says to reuse before rebuilding:

- **The provenance type system** (`reported` / `projected` / `estimated` /
  `modeled`) is a genuinely strong implementation of Directive Part 2 Pillar 4. It
  should become the backbone of the event model, not be replaced.
- **The WARN pipeline** is real, sourced, per-notice traceable, and resilient
  (never overwrites last-good). It is the model every future ingestor should copy.
- **`changes.ts`** is deterministic, threshold-gated, and carries provenance. It is
  the correct seed for the event engine — no LLM anywhere near the numbers, which
  is exactly Directive Part 4's AI boundary.
- **The refresh CI** with change-signature gating is well-engineered.
- **The employer pages** already do the Directive's "never imply WARN identifies
  immigration status" rule correctly, in exactly the right words.
- **Static export** keeps the platform fast and cheap on slow connections
  (Directive Part 7 accessibility).

---

## 5. Recommended phase order

Derived from the Directive's own priority list, adjusted for dependencies.

**Phase 1 — Finish trust (Directive P1).** Close every remaining honesty gap, turn
on measurement, and build the source registry that the event model will sit on.

**Phase 2 — The "What Changed" platform (Directive P2).** Event model, Federal
Register ingestion, `/what-changed`, homepage restructure.

**Phase 3 — Knowledge graph and navigation (Directive P3).** Entity + relationship
model, visa hubs, country intelligence.

**Phase 4 — Search and personalization (Directive P4).**

**Phase 5 — Professional intelligence (Directive P5).**

**Phase 6 — Grounded AI (Directive P6).**

Full detail in [implementation-roadmap.md](implementation-roadmap.md).

---

## 6. Decisions I need from you

1. **C-1 modeled data** — accept the "freeze and retire" recommendation (no new
   modeled data; replace existing with real sources over time), or remove it now?
2. **C-2 AdSense** — keep it disabled indefinitely, or is it still intended once
   traffic justifies it?
3. **C-6** — do you own `twitter.com/immigrationclock` and does
   `hello@immigrationclock.com` receive mail? If not, both come out.
4. **C-8** — confirm Prisma and the unused Python ingestors can be deleted.
