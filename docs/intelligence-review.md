# Reviewing and approving a record

This is the human step in the intelligence layer. Everything in the archive
arrives as `reviewStatus: "auto"` — extracted by code, verified by nobody. This
document is how one record moves from that to `"approved"`, and what approving
it is actually claiming.

**As of 2026-09-03: 544 records, all `auto`. Nothing here has been read by a
person.** That number is reported by `npm run intelligence:quality` and is the
honest answer to "is this human-verified?" until it changes.

## What the three states mean

| State | Meaning | Visible to the public? |
|---|---|---|
| `auto` | Extracted by the pipeline. No person has checked it. | Yes |
| `draft` | Held back. Something is wrong or unresolved. | **No** — filtered out of every list |
| `approved` | A person read this record against its source and stands behind it. | Yes |

`draft` is the useful one to remember: it is the only state that removes a
record from the site, so it is what to reach for when something is wrong and
you cannot fix it immediately.

Nothing sets `approved` automatically, and nothing ever should. An approval
that a script can grant is not an approval.

## Finding what to review

```bash
npm run review:queue
```

The queue scores every record and prints the highest-value ones first. The
score is stated in the `why:` line of each entry, so you can disagree with the
ranking rather than trust it. Roughly, a record scores for:

- an effective date that has not yet arrived (the highest weight, because a
  wrong record about a rule taking effect next month is the most expensive kind)
- being marked `major`
- being recent
- being a final rule rather than a notice
- carrying a **weak** classification — a tag derived from a citation or an
  aside rather than from the document's own subject

That last one is the direct link between review and classification quality. A
weak tag is the classifier saying "I found this, but only in a footnote". Those
are exactly the rows worth a person's time.

## Reviewing one record

1. **Read the record.** The queue prints its title, source, dates and the
   source URL. Open the source URL.

2. **Check the four things that can be wrong.**

   - **Dates.** Does the document state the effective date the record claims?
     If the document states none, the record must say `null`, never a guess.
   - **Classification.** Is it a final rule, a proposed rule, a notice, a court
     decision? A proposal recorded as a final rule tells a reader they have an
     obligation they do not have.
   - **Tags.** For each visa, country or form on the record, read the evidence
     quote. Ask one question: *is the document about this, or does it merely
     mention it?* A quote that names the value in a citation, a parenthetical
     or a sentence about older law is a mention.
   - **Limitations.** Does the record say what it does not cover?

3. **Decide.** Three outcomes, and the third is common:

   - Everything checks out → approve it.
   - Something is wrong and you can fix it → fix the data, then approve.
   - Something is wrong and the fix is not obvious → set `draft` and leave a
     note. A record nobody can defend should not be in front of a reader while
     it is being worked out.

## Approving one record, exactly

Records live in `src/lib/generated/events.json`. Find the record by its `id`
and change one field:

```json
{
  "id": "federal_register:2026-17324",
  "reviewStatus": "approved",
  "lastVerifiedAt": "2026-09-03"
}
```

Set `lastVerifiedAt` to the date you actually checked it. That field is
published in the API as `lastVerified`, so a stale date is a false claim about
when a person last looked.

Then confirm you have not broken the store:

```bash
npx vitest run tests/classification.test.ts
```

That run includes the whole-store validation, so a malformed edit fails here
rather than at the next build.

To hold a record back instead, set `"reviewStatus": "draft"` and add a line to
`limitations` saying why. Draft records are filtered out by
`publishableEvents()` and will not appear on the site, in the API, in the RSS
feed or in the newsletter.

### A caution about regenerated data

`events.json` is written by `scripts/build-events.ts`, which fetches the
government sources. A rebuild can overwrite a hand edit. Until review status is
stored separately from the generated file, treat an approval as something to
re-check after any run of the build, and prefer fixing a systematic problem in
the extractor over hand-editing many records.

## Fixing a classification properly

If review turns up a wrong tag, the question to ask is whether it is one
record's problem or a rule's problem.

- **One record.** Edit its entry in `events.json`.
- **A rule.** Fix `src/domains/graph/classification.ts` or
  `src/domains/graph/extract-impact.ts`, then re-run the offline pass:

  ```bash
  npm run intelligence:reclassify -- --write
  ```

  and re-measure:

  ```bash
  npm run intelligence:quality
  ```

If the fix concerns H-1B, add the record to
`fixtures/h1b-ground-truth.json` with the reason you judged it as you did, and
give any new false positive a `failureClass`. The two classes found so far are
`historical_statutory_reference` and `footnote_citation`, and both have named
regression tests in `tests/classification.test.ts`.

Do not remove records from the ground truth to make a number look better. The
pool is deliberately larger than the classifier's own output, and shrinking it
is the one change that would make the benchmark meaningless.

## What approval does not mean

Approving a record says a person read it against its source and the record
describes the document correctly. It does not say the document has been
interpreted, that its effect on any person has been assessed, or that anything
here is legal advice. Those remain outside what this platform does.
