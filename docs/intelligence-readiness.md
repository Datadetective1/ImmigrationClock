# Is this ready to push to another company's software?

Assessed 2026-09-04 against the committed data, by dimension. Reproduce every
number with:

```bash
npm run intelligence:benchmarks    # the detailed report
npm run intelligence:quality       # the scorecard and readiness matrix
```

The standard being applied: **if ImmigrationClock tells another company's
software that a change affects H-1B, Form I-129, a country, an employer or any
other monitored dimension, we must be able to explain why, from evidence, on
demand.**

## The matrix

| Dimension | Precision | Recall | F1 | Benchmark N | Human review | Readiness |
|---|---|---|---|---|---|---|
| H-1B (original 21) | 100% | 100% | 1.00 | 21 | none | Human-assisted monitoring |
| H-1B (expanded) | 100% | 83% | 0.90 | 33 | none | Human-assisted monitoring |
| Country | 98% | 61% | 0.75 | 249 | none | Human-assisted monitoring |
| Forms | 93% | 58% | 0.71 | 185 | none | Human-assisted monitoring |
| Employment / process | 100% | 64% | 0.78 | 72 | none | Human-assisted monitoring |
| Employer signals | NOT MEASURED | NOT MEASURED | — | — | none | Pull API only |

Holdout figures, which are the ones to believe where they differ:

| Dimension | Holdout precision | Holdout recall | n |
|---|---|---|---|
| H-1B (expanded) | 100% | 92% | 15 |
| Country | 93% | 39% | 118 |
| Forms | 95% | 49% | 61 |
| Employment / process | 100% | 71% | 27 |

**Nothing is ready for push delivery.** Every dimension clears the 90% precision
bar and none clears the 85% recall bar. That is a coherent shape rather than a
disappointment: this classifier is built to refuse what it cannot defend, so
what it returns is dependable and what it omits is not.

Forms and employment labels were **not independently reviewed** — the second
reader did not run to completion — so those two rows rest on one judgement each
rather than two.

## How the benchmarks were built

Candidates come from the **documents**, not from the classifier's output. Full
Federal Register text was fetched for all 348 records that have one, and every
record whose title, abstract or body names the value became a candidate. Scoring
against your own output can only measure precision, and it measures it against
the thing being tested.

Each record carries a `holdout` flag derived from a hash of its id, so the split
is stable and independent of both content and classifier answer. **The H-1B
classifier was not changed after this measurement.** The country and form
classifiers were rebuilt, using the development half only; their holdout numbers
above are genuinely out of sample, and the gap between development and holdout
recall on country (82% against 39%) is the honest cost of that rebuild being
fitted to cases it could see.

## H-1B

The original 21-record benchmark still scores 100%/100% and is still run. The
expanded set is the complete population of records in the archive whose text
names H-1B anywhere: 33 records, every label independently reviewed, none
overturned.

- **Precision 100%.** No false positives at all, including on the two records
  that started this work: an H-2A wage rule whose body says a statute "was
  enacted in the context of the H-1B classification", and a signatures rule that
  cites a 2011 H-1B notice.
- **Recall 83%.** Four false negatives, all the same shape: a document changing
  several programmes at once that names H-1B only in the body. They are returned
  under `?include=weak`.

The 100%/100% on 21 records was not wrong, it was small. Twenty-one judgements
cannot distinguish 100% recall from 83% recall, and the larger set can.

## Country

Rebuilt around what a country is **doing** in a document rather than whether it
appears. Every mention gets one relation:

| Relation | Scope? | Example |
|---|---|---|
| `title_subject` | yes | "DHS Terminates Temporary Protected Status for Yemen" |
| `nationals_of` | yes | "nationals of South Sudan" |
| `present_in` | yes | "aliens arriving from Mexico" |
| `designated_list` | yes | "The following countries are designated: …" |
| `post_location` | no | "the U.S. Embassy in Nigeria" |
| `document_population` | no | "I-185, … Border Crossing Card — Citizens of Canada" |
| `agreement_party` | no | "Agreement Between … Guatemala, 90 FR 31670" |
| `contextual` | no | history, comparison, statistics |

Two further guards sit above the relations: a country name inside a larger place
is not a country reference at all (`Mexico Boulevard`, `New Mexico`, `American
Samoa`, `Colombia Solidarity Bridge`), and a document that states universal
application keeps no country it did not explicitly designate.

Precision went 74% → 98%. Recall went 26% → 61%.

The remaining recall gap is a deliberate policy. A scope-bearing designation
found **only** deep in a document body is returned as weak, not strong, because
rules routinely recite another programme's country scope in their background.
Promoting those was measured: recall rose 3 points and holdout precision fell 13.
That is the wrong trade for a filter someone builds a monitoring promise on.

One false positive survives: a notice imposing duties on products of Canada. The
title names Canada and the document is about Canada, but it is a trade action
rather than an immigration one — a document-relevance question the country model
cannot answer.

## Forms

Precision 93%, recall 58% — up from 90% and 30% once the pipeline began
retaining document text. The recall figure had a structural cause worth stating
plainly, and it is now half solved.

**Of the 121 documents in the sample that are genuinely about a form — revising
it, changing its fee or edition, changing how it is filed — 82 name that form
only in the document body.** Most are Paperwork Reduction Act notices whose
titles say nothing but "Agency Information Collection Activities; Extension,
Without Change, of a Currently Approved Collection".

Two things followed from measuring that:

- The registry of known forms is no longer the limit. When a document writes
  "Form I-352" it has told us the token is a form, which is better evidence than
  our own list membership. A bare `I-352` is still refused.
- Bodies are now read. A form found only in the body is strong **only** where
  the surrounding words show the document acting on it — "revision of", "fee
  for", "is being discontinued" — and weak otherwise.

The pipeline now retains the text (see below), so the body is read properly. Two
general shapes did the work:

- **An enumeration of affected collections covers every form in it.** Fee rules
  and Paperwork Reduction Act notices publish the list of collections they touch
  under a heading that says so — "Programs Affected, OMB Control Numbers  OMB No.
  1615-0052--Form N-400, ...". That is a designation, not a passing mention.
- **A document acting on a form needs the form beside the action.** An operative
  passage is about one thing; a long section can be revising Form A while merely
  naming Form B.

Applying only the first without the second was measured: precision fell to 85%.
Requiring proximity for both cost recall for no precision. The split above is the
version that measured best — precision 93%, recall 58%.

One more thing accounted for most of the remaining gap, and it was embarrassing:
ICE and DOJ write "Form **No.** I-352", and the matcher required "Form" to sit
immediately before the number. That single absent "No." hid most of the 115
Paperwork Reduction Act notices in the archive.

## Employment and processes

Precision 100%, recall 64%. The false negatives are mostly Temporary Protected
Status records, which the annotators judged employment-related because
terminating TPS ends work authorization. That is defensible and arguable; the
reasoning is recorded per record in the fixture so it can be argued with.

Retrieval on the USCIS sample — can a mobility team find what they monitor —
sits at 24 of 25. The one miss says "temporary agricultural worker petitions"
and never says H-2A. Inferring the visa from the description would be
classifying by belief, so it stays unclassified and is reported as a gap.

## Employer signals

Unchanged and deliberately unscored: it is a name-based join, not a classifier,
and no ground truth exists for it. What it does instead is describe itself per
row — 154 exact, 5 possible corporate family, 3 ambiguous — and carry the two
facts that were previously invisible: 38 rows understate a corporate group split
across normalization keys, holding 5,033 uncounted approvals, and the
sponsorship export is three years old.

There is no risk score and there will not be one.

## The source-document architecture

The pipeline had been fetching Federal Register full text, using it once for
impact extraction, and dropping it. Every recall ceiling above traced back to
that, and it was worse than it looked: body text was fetched only for documents
provisionally scored above "routine", and **245 of the 348 Federal Register
records are routine** — including every Paperwork Reduction Act notice, which
are exactly the documents that are about a form.

Three layers, kept apart on purpose:

| Layer | Where it lives | Who sees it |
|---|---|---|
| Raw source evidence | `data/source-text/`, one file per document | Nobody. Classifiers and reviewers read it |
| Normalized intelligence | `events.json` — the ImmigrationEvent records | The site and the API |
| Public evidence excerpts | the quote on each classification | Everyone |

Each record carries the receipt rather than the document: file, text URL, sha256
of the **normalized** text (what was classified, not what arrived), character
count, retrieval date, and the adapter version that read it. The API serves that
receipt. It does not serve the document — the government publishes it in full at
the URL every record already carries, and republishing it would make this a
document host rather than an intelligence layer.

The store lives outside `src/` deliberately: Next.js traces imports to decide
what ships, and a stray import of a 15MB directory ends up inside a serverless
bundle. One file per document rather than one bundle, because federal documents
are immutable once published — a refresh writes only what it added, so git stores
each blob once instead of a fresh 15MB blob per run.

348 documents, 15.6M characters. 196 records legitimately have none: their
sources publish a headline and a paragraph and no more, and the absent field is
the honest record of that.

A test verifies every stored file still hashes to the value the index records.
A store whose contents have drifted from their hashes is worse than no store,
because every quote drawn from it becomes a claim about a document nobody can
identify.

## Two experiments that failed

Recorded because a measurement saying "this does not work" is the thing that
stops it shipping.

**Re-extracting visas from retained text.** Rebuilding the visa list from the
retained body took precision from 100% to 85% and recall from 83% to 74% — the
rewrite discarded classifications the original ingestion had found by reading the
whole body at fetch time. Made additive instead: precision 91%, recall 87%, and
holdout **unchanged** at 100%/92%. The entire apparent gain was two false
positives on the development half. Reverted; H-1B keeps 100% precision.

**Promoting body designations for countries.** Measured earlier at +3 recall for
-13 holdout precision. A narrower rule was tried — promote only when the passage
also reads as the document acting — and no body designation in the corpus
qualifies. The rule was kept anyway, with a test, because it is the mechanism a
future operative designation needs and dead code that is tested is not dead.

## What is missing across every dimension

**Nobody has read any of it.** All 544 records are `reviewStatus: "auto"`. The
review workflow now exists as three commands and is documented in
[the review guide](intelligence-review.md); it has not been exercised.

**There is no delivery ledger.** Nothing records what was sent, to whom, or
whether it arrived. That is a webhook concern and webhooks do not exist.

## What would move a dimension to push-ready

Recall. Every dimension already clears the precision bar; none clears 85%
recall. For H-1B — the closest, at 83% — that means finding the multi-programme
rules that name it only in the body, which is the same body-retention problem
the form dimension has. That is one piece of infrastructure, and it would move
three dimensions at once.
