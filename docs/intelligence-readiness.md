# Is this ready to push to another company's software?

Assessed 2026-09-03, against the committed data, by dimension rather than as a
single yes or no. The earlier assessment answered **NOT READY** for everything.
That was right then and it is too coarse now: one dimension has become
defensible and the others have not, and shipping them under one promise would
hide that.

The standard being applied: **if ImmigrationClock tells another company's
software that a change affects H-1B, Form I-129, a country, an employer or any
other monitored dimension, we must be able to explain why, from evidence, on
demand.**

Reproduce every number below with:

```bash
npm run intelligence:quality
```

## The verdict, by dimension

| Dimension | Ready to push? | Measured against | Result |
|---|---|---|---|
| **visa:h-1b** | **Yes** | 21 hand-labelled records | precision 100%, recall 100% |
| Other visa categories | No | nothing | unmeasured |
| Effective dates | Qualified yes | the store's own validation | never guessed; only 6 records have a future date |
| Processes | No | nothing | 64 records, precision spot-checked only |
| Forms | No | nothing | 23 records, precision untested |
| Countries | No | 31 hand-labelled pairs | precision 74%, recall not measured |
| Employer signals | No | the join is now self-describing | 3 of 162 rows ambiguous, 38 understate a group |

### visa:h-1b — ready

This is the one dimension a monitoring promise could be built on today.

- Precision 100% and recall 100% on strong evidence, against 21 records
  labelled by hand at `fixtures/h1b-ground-truth.json`. Before this work:
  precision 82%, recall 47%.
- Both original false positives are named failure classes with regression
  tests: `historical_statutory_reference` and `footnote_citation`.
- Every match carries the verbatim quote and the method that produced it.
- The benchmark is enforced in CI, so a regression is a red build.

**The caveat that must ship with it.** Recall is recall against what is
knowable from the archive. The store does not keep document bodies, so a record
that concerns H-1B without naming it in its title, summary or stored evidence
quote is invisible to the ground truth and to us. That class cannot be measured
here, and a subscriber must be told the promise is "we will not send you
rubbish" rather than "we will send you everything".

### Effective dates — qualified yes

An effective date is either what the document states or `null`. It is never
inferred, and validation rejects a proposed rule carrying one. That is a
defensible push signal.

The qualification is volume, not quality: 126 records carry an effective date
and only 6 are in the future. A product promising "we will tell you before it
takes effect" would have delivered six notifications over the whole archive.

### Processes and forms — not ready, and the reason is the same for both

Both are precise by construction: a match requires the document to name the
value in its own title or summary, and both refuse the inferences that would
inflate them. Two real false-positive classes were found and fixed in the
process matcher while building it — an agency's own name being read as a
subject, and "registration" matching Temporary Protected Status re-registration
periods.

The process dimension does the retrieval job it was added for. Of the USCIS
records whose text concerns employment, a visa-or-form filter reached 21 of 25;
adding processes reaches 24. The one that remains says "temporary agricultural
worker petitions" and never says H-2A, and it stays unclassified on purpose.

Neither dimension has a hand-labelled ground truth. Spot-checking is not
measurement, and until each has its own labelled set with published precision,
they should be offered for retrieval and not for push.

### Countries — not ready, and now with a number

Every record-and-country pair the classifier emits has been labelled by hand at
`fixtures/country-ground-truth.json`. **Precision is 74%.** Recall is not
measured and is reported as not measured: finding the false negatives would
mean reading 544 documents for unstated country scope, and there is no honest
shortcut.

74% is well under any bar worth pushing on. Roughly one country notification in
four would be about a document that merely mentions the country.

Three defects were found and fixed on the way to that number, each with a
regression test:

- **A country's name inside another country's.** A rule terminating Temporary
  Protected Status for South Sudan was also classified as Sudan. Sudan holds
  its own separate designation, so a subscriber monitoring Sudan would have
  received a rule about a different country.
- **A United States territory read as a foreign state.** A passage about who is
  a U.S. national by birth in American Samoa was classified as Samoa.
- **A claim its own quote does not support.** Five stored pairs had evidence
  quotes that did not contain the country. A stated claim whose quote does not
  show it cannot be defended to anyone who reads it, so they were removed and
  the invariant is now a test over the whole store.

Three classes remain, and they are the hard ones, because each needs to know
what a sentence is doing rather than what words it contains:

| Class | Example |
|---|---|
| `document_list_entry` | Canada, from a list describing Form I-185, the Canadian border crossing card, in a rule about alien registration generally |
| `agreement_title_cited` | Guatemala, from the quoted title of a US-Guatemala transfer agreement, in a rule about appellate procedure |
| `scope_defined_elsewhere` | Canada and Mexico on the visa bond pilot, whose country list the document explicitly delegates to the State Department |

The last is the structural problem rather than a matcher bug. Rules routinely
define their scope by reference to a list held elsewhere. The record already
says so, and a country classification sitting beside that statement contradicts
it. A country-based push cannot be honest until those references are resolved
to the designations that actually name the countries.

### Employer signals — not ready, but no longer opaque

The join is the asset nobody else publishes, and it is now the honest version
of itself. Every overlap row says how it was made:

| Match kind | Rows |
|---|---|
| exact_normalized | 154 |
| possible_corporate_family | 5 |
| ambiguous_normalization | 3 |

The three ambiguous rows are named in the scorecard output rather than hidden
in an average. Two further facts now travel with each row:

- 38 rows understate a corporate group, because filers sharing a first word
  normalize to different keys and were never candidates for the join. Those
  filers hold 5,033 H-1B approvals the matched row does not count.
- The sponsorship figures are the FY2023 export, about three years old, and 65%
  of the WARN filings in the overlap are more than two years old.

What blocks a push promise is recency, not honesty. A monitoring product
implies "something just happened". The median newest filing in the overlap is
1,136 days old, and WARN coverage is five states. A webhook firing on this data
would mostly be reporting history.

## What is missing across every dimension

**Nobody has read any of it.** All 544 records are `reviewStatus: "auto"`.
Human review exists as a workflow (`npm run review:queue`, and
[the review guide](intelligence-review.md)) and has not been exercised. A push
product should not send an unreviewed record as though a person stood behind
it, and the API is explicit that `verification: "auto"` means exactly that.

**There is no delivery ledger.** Nothing records what was sent, to whom, or
whether it arrived. That is a webhook concern rather than a classification one,
and it does not exist yet.

## What would change the answer

For a dimension to move to ready:

1. A hand-labelled ground truth for it, committed, with a reason on every
   label and a `failureClass` on every negative.
2. Published precision and recall against that set, reproduced by
   `npm run intelligence:quality`.
3. A regression test per failure class found.
4. A CI gate on the measured floor.

That is the path H-1B took, and it took hand-labelling 21 records to walk it.
Countries took the same path and came out at 74%, which is the point: the
method does not flatter the data, it just tells you where you are.
