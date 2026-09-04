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
| `draft` | Held back. Something is wrong or unresolved. | **No** — filtered out everywhere |
| `approved` | A person read this record against its source and stands behind it. | Yes |

`draft` is filtered once, in `event-store.ts`, so a drafted record disappears
from the site, the API, the RSS feed and the newsletter together. It is what to
reach for when something is wrong and you cannot fix it immediately.

Nothing sets `approved` automatically, and nothing ever should. An approval a
script can grant is not an approval.

## The three commands

```bash
npm run review:queue
```

Ranks every record and prints the highest-value ones first. The score is spelled
out in each entry's `why:` line, so the ranking can be argued with rather than
trusted.

```bash
npm run review:record -- <record-id>
```

Prints the review sheet for one record: title, summary, the dates and instrument
type it claims, and every classification with the evidence quote and the method
beside it. Read-only. It ends by printing the exact command for each possible
decision.

```bash
npm run review:set -- <record-id> --status approved --verified 2026-09-03
```

Records the decision. One record at a time — there is no `--all` and no file of
ids, because approving is a person saying they read it, and that cannot be said
in bulk. It refuses to write if the record fails the store's own validation,
since a human approval on top of malformed data launders the defect.

## Reviewing one record

The sheet is organised around the four things that can be wrong.

1. **Dates.** Open the source URL. Does the document state the effective date
   the record claims? If the document states none, the record must say `null`.
2. **Instrument.** Is it a final rule, a proposal, a notice, a court decision? A
   proposal recorded as a final rule tells a reader they have an obligation they
   do not have.
3. **Classifications.** For each one, read the quote and ask a single question:
   *is the document about this, or does it merely mention it?* A quote that
   names the value inside a citation, a parenthetical, an agreement's title or a
   sentence about older law is a mention. Entries marked `weak` are the ones
   most worth your attention — the classifier is telling you it found the value
   somewhere it does not fully trust.
4. **Limitations.** Does the record say what it does not cover?

Then choose:

- Everything checks out → `--status approved --verified <today>`
- Wrong, and you can fix it → fix the data, then approve
- Wrong, and the fix is not obvious → `--status draft --note "what is wrong"`
- You looked but will not stand behind it → `--status auto --verified <today>`

The last one is a real option and an underused one. It records that a person
looked without claiming they endorsed it.

After a decision, confirm you have not broken the store:

```bash
npx vitest run tests/classification.test.ts
```

That run includes whole-store validation, so a malformed edit fails there rather
than at the next build.

### A caution about regeneration

`events.json` is written by `scripts/build-events.ts`, which fetches the
government sources. A rebuild can overwrite a decision recorded here — the
command prints this reminder itself. Until review state lives outside the
generated file, re-check approvals after any pipeline run.

## A first batch, from the queue

These are the six highest-priority records as of 2026-09-03. Each takes a few
minutes: open the source, check four things, run one command.

| # | Record | Why it is near the top |
|---|---|---|
| 1 | `federal_register:2026-17146` | Takes effect 2026-10-01, major, six weak form tags |
| 2 | `federal_register:2026-16231` | Takes effect 2026-09-09 — five days — major, H-1B and L-1 fee |
| 3 | `federal_register:2026-14539` | Takes effect 2026-09-18, major, weak country and form tags |
| 4 | `federal_register:2026-14439` | Takes effect 2026-09-15, major, four weak tags |
| 5 | `federal_register:2026-17726` | Takes effect 2026-09-30, major, published four days ago |
| 6 | `federal_register:2026-16290` | Takes effect 2026-09-10, major |

Start with number 2. It has the nearest effective date, it is about H-1B and
L-1 fees, and it is exactly the kind of record a paying customer would expect a
person to have read.

## Fixing a classification properly

If review turns up a wrong tag, ask whether it is one record's problem or a
rule's problem.

- **One record.** Edit its entry in `events.json`.
- **A rule.** Fix the extractor, then re-run the offline passes and re-measure:

  ```bash
  npm run intelligence:reclassify -- --write
  npm run intelligence:benchmarks
  ```

If the fix concerns a benchmarked dimension, add the record to the matching
fixture with the reason you judged it as you did, and give any new false
positive a failure class. Do not remove records from a ground truth to make a
number look better — the pools are deliberately larger than the classifier's own
output, and shrinking one is the single change that would make the benchmark
meaningless.

## What approval does not mean

Approving a record says a person read it against its source and the record
describes the document correctly. It does not say the document has been
interpreted, that its effect on any person has been assessed, or that anything
here is legal advice. Those remain outside what this platform does.
