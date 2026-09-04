# Integrating ImmigrationClock

Written 2026-09-04 from the repository as it stands. Every number here is
reproducible with `npm run intelligence:benchmarks`.

**No integration exists yet, and no company has agreed to one.** This document
describes what a vendor could do today, so that a conversation can start from
something real.

## The position

ImmigrationClock is not case management, filing software, document management or
an HRIS, and it is not becoming any of them. It is the layer underneath:

```
official government sources
        ↓
ImmigrationClock          normalization · classification · evidence ·
        ↓                 provenance · employer signals · monitoring · API
law firms · case-preparation platforms · filing platforms ·
mobility platforms · corporate immigration teams
```

The pitch is not "replace your software". It is:

> Add continuously updated, source-linked U.S. immigration intelligence to the
> workflow your customers already use.

## What exists today

| | |
|---|---|
| Recorded changes | 544, each with source URL, dates, classification, evidence |
| Sources | Federal Register, USCIS newsroom, USCIS Policy Manual, DOL OFLC, CBP, federal courts |
| Retained source documents | 348, hashed, with retrieval provenance |
| H-1B sponsors | 2,614 (USCIS FY2023 export, ≥10 approvals) |
| WARN layoff notices | 7,457 across 5 states |
| Employers in both datasets | 162, each with a per-row description of how the join was made |
| API | Free, no key, no quota, versioned at `/api/v1` |
| Human review | **Zero records reviewed.** Every record says so. |

Classification quality, measured against hand-labelled ground truth committed in
`fixtures/`:

| Dimension | Precision | Recall | Benchmark |
|---|---|---|---|
| visa:h-1b | 100% | 83% | 33 records |
| Countries | 98% | 61% | 249 pairs |
| Forms | 93% | 58% | 185 pairs |
| Employment processes | 100% | 64% | 72 records |

Read that as: **what a filter returns is dependable; what it omits is not.**
Every dimension clears a 90% precision bar and none clears an 85% recall bar.

## Three integration shapes

### 1. Pull API — available today

The vendor polls on whatever schedule suits them.

```bash
curl "https://immigrationclock.com/api/v1/monitor?follow=visa:h-1b&follow=form:i-129&horizonDays=30"
```

Returns the intelligence inbox for that watchlist: what needs attention, what
takes effect soon, what matched only weakly, each with a brief, the evidence
quotes, the effective date, the source URL and the limitations.

Other endpoints:

- `GET /api/v1/changes` — the archive, filterable by visa, form, process,
  country, agency, classification, status, date range
- `GET /api/v1/changes/{id}` — one change, with the weak matches reported
  separately rather than mixed in
- `GET /api/v1/employers/{slug}/signals` — H-1B sponsorship and WARN filings for
  one employer, with a per-row description of how the two were matched
- `GET /api/v1` — what is measured, and how to reproduce it

The watchlist travels in the query string and is never stored. We hold no record
of what any firm is watching, which for an immigration platform is worth keeping
deliberately.

### 2. Embedded intelligence — available today

The vendor renders our change records inside their own workflow. Every record
carries what a professional needs to evaluate it without trusting us:

- the source URL and the retrieval provenance (hash, date, adapter version)
- the effective date, or an explicit statement that the document states none
- every classification with the verbatim quote it came from
- the evidence strength, so a citation-derived match is visibly different from a
  title-derived one
- the record's own limitations
- the review status, which today is `auto` on every record

This is the shape that suits a case-preparation or filing platform: a "what
changed" panel beside the work their customer is already doing.

### 3. Push / webhook — NOT offered

A webhook implies "we will tell you about everything". No dimension's measured
recall supports that claim: the best is 83%, and one in six relevant H-1B
changes would be missed silently. A silent miss in a push product is the failure
a customer never forgives, because they do not know it happened.

This becomes available when a dimension reaches ≥90% precision and ≥85% recall
on a benchmark large enough to mean something. The path is documented in
`docs/intelligence-readiness.md`, and the recall gap is a body-retention problem
that is now half solved.

## What a vendor should ask us, and the honest answers

**How complete is it?** Not complete. Recall is measured and published per
dimension. Treat a filtered result as a floor.

**Has a human checked these?** No. All 544 records are `reviewStatus: "auto"`,
and every record says so in the API. A review workflow exists
(`docs/intelligence-review.md`) and has not been exercised.

**What happens when you are wrong?** Every classification carries the quote it
was made from, so a wrong match is visible rather than mysterious. Known
false-positive and false-negative classes are named in
`docs/intelligence-readiness.md`.

**Can we depend on the API's shape?** It is versioned at `/api/v1` with a schema
version in every response. Additive changes only within a version.

**What does it cost?** The API is free today and there is no plan to put the
public archive behind a key.

**Who else uses it?** Nobody yet. This is the first integration conversation.
