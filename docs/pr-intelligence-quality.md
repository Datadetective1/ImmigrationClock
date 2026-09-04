# PR description — paste this into GitHub

**Title:**

```
Measured intelligence: retain source documents, rebuild classification, and ship the professional inbox
```

**Body:** everything below the line.

---

Six commits taking the intelligence layer from asserted quality to measured
quality, fixing the structural information loss underneath it, and turning the
result into a professional surface.

## The structural fix

The pipeline fetched Federal Register full text, handed it to the impact
extractor once, and dropped it. Nothing afterwards could re-read it — not a
better classifier, not a reviewer checking a claim, not a customer asking why a
record says what it says.

It was worse than it looked. Body text was fetched **only** for documents
provisionally scored above "routine", and **245 of the 348 Federal Register
records are routine** — including every Paperwork Reduction Act notice, which
are precisely the documents that *are* about a form. The pipeline was skipping
the text of the documents whose text mattered most.

`data/source-text/` now holds the normalized text, one file per document, with a
provenance index. 348 documents, 15.6M characters, backfilled from the
government's own canonical text URLs. 196 records legitimately have none: their
sources publish a headline and a paragraph and no more.

Three layers, kept apart on purpose:

| Layer | Where | Who sees it |
|---|---|---|
| Raw source evidence | `data/source-text/` | Nobody. Classifiers and reviewers read it |
| Normalized intelligence | `events.json` | The site and the API |
| Public evidence excerpts | the quote on each classification | Everyone |

Each record carries the receipt, not the document: file, text URL, sha256 of the
**normalized** text (what was classified, not what arrived), character count,
retrieval date, adapter version. The API serves that receipt. It does not serve
the document — the government publishes it in full at the URL every record
already carries, and republishing it would make this a document host.

The store lives outside `src/` deliberately: Next.js traces imports to decide
what ships, and a stray import of a 15MB directory ends up inside a serverless
bundle. One file per document rather than one bundle, because federal documents
are immutable once published — a refresh writes only what it added, so git stores
each blob once instead of a fresh 15MB blob per run.

## The evidence architecture

Strength used to be "title beats summary beats body", which is a claim about
*position*. What matters is what the sentence is *doing*:

> "USCIS is revising Form I-129 to add a new certification."
> "A commenter requested that DHS revise Form I-129."

Both sit in a body. `evidence-strength.ts` separates the document **acting** from
the document **reporting**: `operative_language`, `explicit_scope`,
`designation`, `structured_source`, `title`, `summary` are strong;
`body_scope_sentence`, `contextual_mention`, `historical_mention`,
`citation_reference` are not. Comment-response sections — the largest source of
operative-looking prose about things a rule is not doing — are caught explicitly.

Country classification was rebuilt around what a country is **doing** in a
document. Eight relations, four scope-bearing (`title_subject`, `nationals_of`,
`present_in`, `designated_list`) and four not (`post_location`,
`document_population`, `agreement_party`, `contextual`). Two guards sit above
them: a country name inside a larger place is not a country reference at all
(`Mexico Boulevard`, `New Mexico`, `American Samoa`, `Colombia Solidarity
Bridge`), and a rule stating universal application keeps no country it did not
designate.

## Benchmarks, before and after

Ground truth comes from the **documents**, not from the classifier's output —
scoring against your own output can only measure precision, and it measures it
against the thing being tested. 539 hand judgements, each carrying the span that
decided it, committed in `fixtures/`. Every record has a `holdout` flag derived
from a hash of its id, so the split is stable and independent of content.

| Dimension | Precision | Recall | F1 | n |
|---|---|---|---|---|
| H-1B (original 21) | 100% | 100% | 1.00 | 21 |
| H-1B (expanded) | 100% (was 82%) | 83% (was 47%) | 0.90 | 33 |
| Country | 98% (was 74%) | 61% (was 26%) | 0.75 | 249 |
| Forms | 93% (was 90%) | 58% (was 30%) | 0.71 | 185 |
| Employment / process | 100% | 64% (was 60%) | 0.78 | 72 |

### Holdout — the numbers to believe where they differ

| Dimension | Precision | Recall | n |
|---|---|---|---|
| H-1B (expanded) | 100% | 92% | 15 |
| Country | 93% | 39% | 118 |
| Forms | 95% | 49% | 61 |
| Employment / process | 100% | 71% | 27 |

**Every dimension clears 90% precision. None clears 85% recall.** That is
coherent rather than disappointing: this classifier refuses what it cannot
defend, so what it returns is dependable and what it omits is not. All five sit
at READY FOR HUMAN-ASSISTED MONITORING.

### Two experiments that failed, and were reverted

Recorded because a measurement saying "this does not work" is the thing that
stops it shipping.

- **Re-extracting visas from retained text.** Rebuilding the list took precision
  100% → 85% and recall 83% → 74%; the rewrite discarded classifications the
  original ingestion had found. Made additive instead: precision 91%, recall
  87%, and **holdout unchanged** at 100%/92% — the entire apparent gain was two
  false positives on the development half. Reverted; H-1B keeps 100% precision.
- **Promoting body designations for countries.** Measured at +3 recall for −13
  holdout precision. A narrower rule was tried and no body designation in the
  corpus qualifies. Kept with a test, because it is the mechanism a future
  operative designation needs.

The H-1B classifier was **not** changed after measurement.

## /monitor — the professional inbox

The archive answers "what happened". A person paid to watch immigration asks:
"of everything that changed, what touches the work I am responsible for, how soon
do I have to care, and can I see why you think so?"

Buckets by urgency: **needs attention**, **effective soon**, **recently
changed**, **potentially relevant**, **reviewed**, **superseded**.

"Potentially relevant" exists because hiding a maybe is its own kind of lying,
and because the bucket a professional acts on first must never contain a match
made from a footnote. A test enforces exactly that.

Every item carries its own case — what changed, why it may matter, the effective
date, the source, the quote behind each classification, how strong that evidence
is, what the record does not cover, and whether a person has reviewed it. None of
it is behind a click.

Free, deliberately. The founder rule is that revenue comes from adding value
rather than restricting information, and a professional cannot evaluate a
monitoring product they cannot use.

## GET /api/v1/monitor

The same inbox as data — the pull half of the integration story. A vendor calls
it on a schedule with the dimensions their customer follows and renders the
result inside their own workflow. No key, no quota, no account.

The watchlist travels in the query string and is **never stored**. For an
immigration platform, not holding a record of what any firm is watching is worth
keeping deliberately.

## Professional briefs

Each item generates a structured brief with two kinds of line kept apart: facts
about the document, and a neutral suggestion to review something internal. Every
generated sentence is conditional and addressed to a process — "teams whose work
involves those areas may want to review it against their own procedures" — never
to a person.

A test greps the generated text of all 544 records for "you should", "your case",
"you may be eligible" and eleven other shapes. That is the line between workflow
intelligence and legal advice, enforced rather than intended.

A record with no classifications gets no relevance sentence. It says the document
did not name a visa, country, form or process in its own words, and stops.

## Human review

Three commands: `review:queue` ranks by value with the score spelled out,
`review:record` prints the sheet (dates, instrument, every classification with
its quote and method), `review:set` records one decision and refuses to write
over data that fails validation. One record at a time — there is no `--all`,
because approving is a person saying they read it.

**All 544 records remain `reviewStatus: "auto"`. This PR approves none of them,
and the API says so on every record.**

## Monetization architecture

Complete and inert: checkout, customer portal, webhook signature verification,
entitlement cookies, subscriber store, pricing page, 103 tests. Five environment
variables are unset and `BILLING_ENABLED` is not `"true"`.

`npm run billing:verify` asks Stripe whether your key works, whether both prices
exist and cost what the pricing page says, and whether anything points at live
mode. Read-only, and it **refuses to run against a live key**.

$19/month and $190/year are an explicitly unvalidated hypothesis.

## Why webhooks were deliberately not built

A webhook implies "we will tell you about everything". The best measured recall
is 83%, so roughly one relevant H-1B change in six would be missed **silently** —
and a silent miss is the failure a customer never forgives, because they never
learn it happened.

`/api/v1/monitor` reports its own readiness: mode `pull`, push "not offered",
with the reason. `/developers` documents all three integration shapes including
the one that does not exist. Push becomes available when a dimension reaches
≥90% precision **and** ≥85% recall on a benchmark large enough to mean something;
the path is in `docs/intelligence-readiness.md`.

## Known limitations

- **No record has been reviewed by a person.** Every record says so.
- **Recall is not high enough on any dimension to be treated as exhaustive.** An
  empty result means nothing matched, never that nothing happened.
- **Forms and employment labels are single-annotator** — the independent
  reviewers hit a session limit. Both are flagged wherever the numbers appear.
- **Remaining false positives:** one trade action naming Canada; four form
  body-mentions.
- **Remaining false negatives:** multi-programme rules naming H-1B only in body
  (4); body-only country designations (29); forms in unretained bodies (51).
- **Country holdout recall is 39%** against 82% on development — the honest cost
  of a rebuild fitted to cases it could see.
- **Email alerts, employer monitoring, bulk export and professional search are
  not built.** The pricing page says so beside each line.
- `events.json` hand-edits are overwritten by `npm run prebuild`.

## Verification

- Typecheck clean, lint clean
- **2,339 tests across 77 files**
- Strict intelligence gate passes (`npm run intelligence:quality -- --strict`)
- Production build green at **7,018 pages**
- All 33 cited sources reachable, **0 broken**
- `/monitor` verified in a browser at 1280px and 375px: renders, watchlist
  round-trips through the API, evidence disclosure opens, no console errors, no
  horizontal overflow

Reproduce the numbers:

```bash
npm run intelligence:benchmarks
npm run intelligence:quality
```

## Not for automatic merge

CI should be green before this lands, and the store adds ~16MB to the repository
— worth a deliberate look before merging.
