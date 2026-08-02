# Data corrections

A public, dated record of every occasion where ImmigrationClock published something
incorrect and then fixed it. Entries are appended, never edited or removed.

The site links here from `/methodology`.

---

## 2026-08-01 — Synthetic WARN layoff records removed

**Severity:** High. Named real companies were shown next to filing dates that no
government agency ever published.

### What was wrong

`src/lib/source-data.ts` generated individual "WARN notices" rather than ingesting
them. Two mechanisms produced them:

1. Annual layoff totals reported in the press were divided into a fixed number of
   synthetic "events". Each event received a computed month and a day hardcoded to
   the 15th, producing filing dates that never existed.
2. A hardcoded list assigned specific dates and headcounts to eight named
   employers.

Every generated row was stamped with the source name **"State WARN Act Layoff
Notices"** and a **dol.gov** URL, then rendered on `/state/[stateCode]` under the
heading **"Recent layoff notices (WARN)"** with a government source badge. The same
rows fed the homepage layoff counter, `/layoffs-vs-h1b`, `/company/[slug]`, the
`/insights` cards, and the weekly Pulse email.

The effect was that a visitor reading a state page saw what looked like government
filing records, attributed to a federal agency, for named real companies — and none
of those individual records existed.

Separately, a real multi-state WARN feed (thousands of genuine notices, each with
its own state-portal URL) already existed in the codebase and powered `/layoffs`.
The site was running two parallel layoff systems and showing the synthetic one on
its higher-traffic pages.

### What changed

- All generated layoff records were deleted. `layoffRows` is now a frozen empty
  array retained only so nothing can silently reintroduce data through that path.
- `Company.layoffs` was removed from the domain type entirely.
- Layoff figures on every surface now derive from real state filings:
  - `src/lib/generated/warn.json` — individual notices, each with a source URL.
  - `src/lib/generated/warn-summary.json` — a compact rollup emitted from those
    same notices, so totals and detail cannot drift apart.
- Surfaces repointed: homepage counter, `/state/[stateCode]`, `/layoffs-vs-h1b`,
  `/company/[slug]`, `/insights`, `/pulse`, the Pulse email generator, the change
  feed, the refresh table, and the personal-relevance engine.
- `WARN_LIVE` (a Texas-only live feed) was retired; the multi-state feed supersedes
  it, so there is now exactly one source of layoff truth.

### Effect on published figures

| Surface | Before | After |
| --- | --- | --- |
| Homepage "Layoffs tracked" (2026) | ~3,700 (synthetic) | **41,283** employees / 348 notices (real) |
| `/state/TX` layoffs | a handful of synthetic rows | **216,368** employees / 2,358 real notices |
| `/state/NJ` layoffs | a handful of synthetic rows | **368,890** employees / 2,289 real notices |
| `/layoffs-vs-h1b` chart | modeled per-company totals | real WARN × USCIS join, **143** matched employers |
| States with no feed (e.g. IL, NY, GA, MA, VA, FL) | synthetic notices shown | **nothing shown**, with an explicit "this state has no machine-readable feed" message |

Most totals rose, because real WARN coverage is far larger than the synthetic set
was. Some pages now show *less*: states without a machine-readable feed correctly
display nothing at all rather than invented records.

### Known limitations that remain, now stated on-page

- Coverage is **5 states** (CA, NJ, OR, TX, WA), not national. Most states publish
  WARN notices only as HTML, Excel, or PDF.
- New Jersey publishes only the **layoff effective date**, not the filing date, so
  its dates can fall in the future. Pages that show NJ dates say so explicitly, and
  no future date is ever presented as a "last updated" date.
- Yearly totals date a notice by its filing date where published and fall back to
  the effective date otherwise. Counts for each basis are published in the summary.
- Employer matching between WARN and USCIS is a best-effort normalized-name join.
  It has no confidence score yet. **It is not yet fit for paid output** — that work
  is Phase C.

### Guardrails added

`tests/data-integrity.test.ts` fails the build if any of the following returns:

- a non-empty `layoffRows`, or a layoff export reachable from the app-facing module
- `EXTRA_LAYOFFS`, `layoffYears`, or any constructed `noticeDate` in the build-time
  source module
- any of the previously hardcoded employer names in a layoff context
- a WARN notice without a source URL, or with an implausible date
- more than 25% of notice dates falling on a single day of the month (the
  signature of the old generator, which put nearly everything on the 15th)
- a summary total that disagrees with the notices it was derived from
- any figure presented with a future "last updated" date

---

## 2026-08-01 — Employer fiscal-year drift corrected

**Severity:** Medium. The same source was cited for two different years.

### What was wrong

The USCIS H-1B Employer Data Hub's latest published export is **FY2023**, and the
employer directory correctly ingested it. But `EMPLOYER_LATEST_FY` was hardcoded to
`2024`, so the homepage and `/h1b/top-sponsors` announced FY2024 employer figures
citing the Data Hub. A visitor could see the homepage claim "Top H-1B sponsoring
employer: Amazon, 9,265 approvals, FY2024, source: USCIS Employer Data Hub", then
open the linked employer page and read "4,576 approvals, FY2023" from the same
cited source.

Two different national denominators were also in circulation — 176,949 (Data Hub
FY2023) and 399,395 (USCIS national petition statistics FY2024) — with no
explanation of why they differ.

Compounding this, `scripts/build-employers.ts` exited **0** on failure, so a broken
fetch looked like a successful build. That is how the directory sat on an older
export without anyone noticing.

### What changed

- `DATAHUB_LATEST_FY` is now read from the ingested file itself, so the year the
  site claims always equals the year it read.
- The prebuild order was changed so the directory is built *before* the snapshot
  that reads it.
- The homepage "top sponsoring employer" and "top state" metrics now read the real
  Data Hub directory instead of the curated profile set, removing the contradiction.
- The curated large-sponsor profiles are now labelled **Modeled** wherever they
  appear, and `/h1b/top-sponsors` carries a note explaining that it and the
  employer directory are different USCIS releases covering different years, which
  will not add up to each other.
- `build-employers.ts` now exits non-zero on failure. `ALLOW_STALE_EMPLOYERS=1`
  downgrades it to a warning for deliberate offline builds.

---

## 2026-08-01 — Newsletter signups were being discarded

**Severity:** High for audience trust.

### What was wrong

With no newsletter provider configured, submitting the signup form set the UI to a
success state and displayed **"✓ You're on the list."** No provider received the
address and nothing was stored. Every person who signed up was told they had
subscribed, and none had.

### What changed

- The signup decision logic moved to `src/lib/newsletter.ts` and is unit-tested.
- With no provider configured, the form **does not render an email field at all**
  and states plainly that signups are not open yet.
- When configured, the form is a native POST to the provider (Buttondown), so the
  visitor sees the provider's own confirmation. The page never asserts success on
  the provider's behalf.
- A `dev` mode disables submission on local and preview builds so test addresses
  cannot reach the live audience.
- Explicit consent is now required before the submit button enables.

---

## 2026-08-01 — Unlabelled modeled figures

**Severity:** Medium.

### What was wrong

Several figures apportioned from national totals using ImmigrationClock's own
assumed weights were displayed as bare numbers with a government source badge and
no integrity label — implying the agency had published that breakdown. Affected:
ICE arrests by state, removals by nationality, border encounters by citizenship,
and the curated employer/wage views on state and sponsor pages.

### What changed

- A fourth provenance value, **`modeled`**, was added and is documented on
  `/methodology`. It is distinct from `estimated`: `estimated` apportions using a
  share the agency published, `modeled` apportions using weights we assumed.
- `Stat` and `ChartCard` now accept a `provenance` prop and render the tag inline.
- Every affected surface carries the tag plus a tooltip naming what was apportioned
  and from what.
- Where a curated subset has no data for a state, pages now render "—" rather than
  `0` or `$0`, which would read as a factual claim about the state.
