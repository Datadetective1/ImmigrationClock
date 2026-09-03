# Social publishing

One editorial engine, three windows a day, on X (LinkedIn is wired but not
enabled). An LLM writes the wording; deterministic code decides everything
else, and a validator refuses anything the fact set does not support.

**Status: live.** `SOCIAL_POST_ENABLED` is `true` in the repository's
variables and the schedule below is armed. See [Stopping it](#stopping-it).

---

## The governing principle

> ImmigrationClock never posts because the clock says it is time to post. It
> posts because it has something useful, factual, timely or genuinely
> interesting to tell someone.
>
> The schedule creates opportunities. The content earns publication.

A run that produces nothing is the system working. What changed in the second
design is what "something useful" can be: not only a government document
restated, but a development explained, its significance stated where the
record supports it, a figure from the site's own data, a distinction readers
get wrong, or a tool the site already holds.

---

## What the first design did, measured

The account published from 2026-08-10. The ledger and the GitHub Actions run
log for the three weeks to 2026-09-01 show:

| | |
|---|---|
| X posts | 22 (4, 11, 5 and 2 by week) |
| Windows evaluated | 47 |
| Windows spent on a subject that could not post on X | 17 — "This subject and angle are not available on x" |
| Model calls those windows burned | 14 ($0.77 of $1.83 total) |
| Days with no morning run at all after 08-26 | 6 — the 14:07Z cron fired hours late or not at all and the exact-hour gate discarded it |
| Posts carrying the generic brand card | all of them — every deep link was a hub page |
| Posts opening `[Subject]: [agency] [verb]…` | 9 of 22 |
| Posts carrying "no implementation date is recorded/set/posted" | 8 of 22 |
| Posts writing an agency in lowercase ("dhs's final rule") | 5 of 22 |
| A major court order (2026-08-28) that never entered any pool | 1 — the ranking floor keyed on an obligation keyword its summary lacked |

Four causes, none of them the model's taste: the schedule's gate, a platform
ghost in eligibility, one destination per hub page, and a prompt whose
mandatory elements plus a literal URL count left one shape and ~150 characters
of prose.

---

## The editorial model

### Content types

| Type | Tier | What it is | Fact source |
|---|---|---|---|
| `breaking_change` | news | A material official change ≤ 2 days old: a rule, a court order, a policy reversal | the archive record |
| `what_changed` | news (≤ 2 days) / follow-up | A recent development explained in plain English: what changed, what we are watching | the archive record |
| `why_it_matters` | follow-up | A verified development and its significance, drawn only from implications derived from the record's fields | the record + `implications.ts` |
| `effective_date` | follow-up | A rule's start date in the next 30 days: what starts, what stays true until then | the archive record |
| `key_date` | follow-up | A recurring window at a milestone (60/45/30/14/7/3/1 days) | `key-dates.ts` |
| `data_signal` | evergreen | A factual observation computed from reported data or exact counts of the archive | `src/lib/editorial/signals.ts` |
| `explainer` | evergreen | A source-backed explanation of a distinction readers get wrong | `src/lib/editorial/explainers.ts` |
| `data_discovery` | evergreen | A verified capability of ImmigrationClock, offered to the reader who needs it | `src/lib/editorial/discovery.ts` |

Every type is a closed fact set (`facts.ts`) and every post is validated
against it. A model never decides a fact.

### Cadence (`cadence.ts`)

| Target | Rule |
|---|---|
| Normal day | about one post |
| Consequential day | two, occasionally three, when they are distinct developments |
| Quiet day | one evergreen post, in the afternoon or evening |
| Nothing worth saying | nothing |

Enforced as ceilings, never floors: at most 3 posts a day, at least 3 hours
apart; the news tier may publish in any window; follow-ups at most one a day
and three a week; the evergreen tier only when the day has been quiet, only in
the afternoon or evening, and at most five a week. Nothing here can promote a
candidate or lower a quality gate.

### Shapes (`content-types.ts`)

Sixteen shapes — news, direct, address, date-first, what-changed, before/after,
why-it-matters, context-first, the figure, question-then-figure, two figures,
the distinction, short list, question-and-answer, need-first, the tool plainly.
Each content type is offered the shapes that fit its facts; the writer is told
which shapes the account used most recently, chooses one, and reports it. The
ledger records it, and a third consecutive use of one shape is refused
(`checkStructureVariety`). Chosen, never rotated.

### Voice (`prompt.ts`, v9)

Clear, curious, precise, calm, useful, human, data-literate. Not bureaucratic,
sensational, political, salesy or a press release. Dates as words, agencies as
a person writes them, two or three short paragraphs, "USCIS just changed…"
over "USCIS announces the rescission and reinstatement of…". The mandatory
"no implementation date" sentence is gone; the absence of a date may be
mentioned, plainly, or left out.

### Windows (`slots.ts`)

| Window | Chicago hours | Cron (UTC, both offsets) |
|---|---|---|
| morning | 08:00–12:59 | 13–18 |
| afternoon | 13:00–16:59 | 18–22 |
| evening | 17:00–20:59 | 22–02 |

The workflow fires at :07 every hour from 13:07 to 02:07 UTC. A firing that
arrives two hours late still lands inside its window. `scripts/social-gate.ts`
runs before `npm ci` and exits in seconds when no window is open or the open
window already published today, so the no-op firings cost almost nothing.

---

## The pipeline

```
gate → cadence → candidates (one queue) → queue refresh → rotation → subject/URL
cooldown → stored ready copy, or LLM → validate → opening + shape variety →
wording dedupe → publish → commit the ledger and the queue
```

Each stage can end the run, and each refusal is a named row in the ledger:
`SKIPPED_CADENCE` · `SKIPPED_NO_QUALIFYING_CONTENT` · `SKIPPED_DUPLICATE` ·
`SKIPPED_COOLDOWN` · `SKIPPED_VALIDATION_FAILED` · `SKIPPED_ENGINE_UNAVAILABLE`
· `SKIPPED_ENGINE_MISCONFIGURED` · `SKIPPED_CREDENTIAL_EXPIRED` ·
`SKIPPED_PUBLISH_FAILED` · `SKIPPED_NOT_ENABLED` · `POSTED` · `DRY_RUN`.

### Selection (`select.ts`)

One ranked queue. A recorded change may become up to four candidates
(breaking, what-changed, why-it-matters, effective-date), keyed by its own
fields; recurring dates enter at milestones; every explainer, every signal
today's snapshots support, and every discovery item enter as evergreen.
Scoring is the category ladder (`categories.ts`) plus the ranking model plus
reader value (`reader-value.ts`), minus recency inside the news tier. A court
decision, an executive action or a major final rule qualifies as news on its
kind, so a terse summary can no longer keep an injunction out of the queue.

Records whose summary is the Federal Register's "No abstract was published"
placeholder carry only a dated reminder; there is nothing to explain.

### Eligibility is per platform this run can publish to (`run.ts`)

Live, that means platforms with a credential. A platform with no history
cannot make a subject eligible that X cannot post — the ghost that spent
seventeen windows. Dry runs and the simulator evaluate `["x"]`.

### The queue (`queue.ts`)

`src/lib/generated/social-queue.json`, committed by the workflow beside the
ledger. Every candidate the selector produces is remembered with a status:

`candidate → verified → ready → scheduled → published`, or `rejected` (with
the reason: expired, validation, cooldown) or `superseded` (a newer record
with the same title stem — a final rule after its proposal).

A `ready` item holds validated copy. A run that fails to publish it — X
returned 503, or 402 credits depleted — leaves it ready, and the next window
publishes the stored copy without a second model call, provided the fact set
has not moved (the hash is checked). The queue is a memory, not a lock: every
rerun guard and cooldown reads the ledger, and a corrupt queue is rebuilt
while a corrupt ledger halts everything.

`npm run social:queue` prints it.

### Rotation and dedupe (`rotation.ts`, `dedupe.ts`)

Unchanged in spirit: subject × treatment × platform × cooldown, topic-family
and destination penalties, the same-day topic rule, opening-construction
variety, and word-trigram wording similarity. Changed in numbers: an event's
subject cooldown is 7 days (a breaking post, a why-it-matters a week later, a
reminder as the date nears); a follow-up after a follow-up is penalised two
tier steps; the evergreen kinds rotate (a signal, then an explainer, then a
tool) by a one-step penalty on the kind used last; the content mix is counted
by content type.

### The fact set and the validator (`facts.ts`, `validate.ts` v8)

The closed world is unchanged: title, summary, source, dates, entities, the
figures the source used, the notes. Added: `implications` — lines derived from
the record's fields (a proposal is a proposal; a final rule with a future date
does not apply until then and the current rules stay in force; a rescission
removes the rule it names and not the statute; what ImmigrationClock is
watching) — as the only significance the writer may state. The validator
grounds figures and quotations against them like any other field.

The X length is now measured the way X measures it: every URL counts as 23
characters. The hard limit (275) is unchanged; the prose budget went from
about 150 characters to about 240.

### Share pages and cards

Every post links a record's own page, with its own card:

| Record | Page | Card |
|---|---|---|
| a change | `/what-changed/<slug>` | `/og/change/<slug>.png` |
| an explainer | `/explained/<slug>` | `/og/explainer/<slug>.png` |
| a data signal | `/insights/<slug>` | `/og/signal/<slug>.png` |
| a tool | its hub page | `/og/page/<key>.png` |

Slugs are `<title-slug>-<6-char hash of the id>` (`src/lib/share.ts`); the
hash is the key, so a title correction never breaks a link: a change page
answers an older slug for the same record with a permanent redirect to the
current one, rendered once on demand and cached. Cards are static PNGs
rendered at build time from the record's own fields — no runtime dependency
for a crawler to hit; a crawler that follows an old link reads the redirected
page's tags, which name the current card. Posted links carry `utm_source=x`,
`utm_medium=social`, `utm_campaign=<content type>` and `utm_content=<story
key>`; the landing page fires `social_post_click` once per story per session.
See `docs/analytics-event-plan.md`.

`npm run social:verify-og -- --base=https://immigrationclock.com` fetches a
share page as X's crawler does and checks the tags and the image. Pointed at
a local `next start`, it fetches the card from that origin at the tag's
path, so the build in front of it is what gets checked, not production.

---

## Commands

```bash
npm run social:preflight
```

```bash
npm run social:preview -- --windows=6
```

```bash
npm run social:simulate -- --days=7 --engine=stub --ledger=src/lib/generated/social-posted.json
```

```bash
npm run social:simulate -- --days=7 --engine=openai --ledger=src/lib/generated/social-posted.json
```

```bash
npm run social:queue -- --refresh
```

```bash
npm run social:post -- --slot=afternoon
```

```bash
npm run social:verify-og -- --base=https://immigrationclock.com
```

```bash
npm run social:examples
```

`social:examples` runs the seven example posts in
`fixtures/social-examples-v9.json` — one per content type, written to the v9
brief against records in the archive — through the validator, the opening and
shape checks and the wording-similarity check against the committed ledger. It
is how a reader can see what the brief asks for without an API key, and how the
examples in the launch report were verified. The entries are authored, not
model-generated, and nothing in that file is ever published.

The stub engine (`providers/stub.ts`) writes copy from the fact set in the
shape it is offered. It is a planning tool for exercising the deterministic
layers on a machine with no API key — not the voice, and unreachable from the
production entry point. The `openai` simulation is the real voice, with no
publisher attached.

---

## The exact-copy approval path

Unchanged: `propose → show → approve → post --approved`, no model call at
publication, the digest binds the approval to the bytes that were read, and
every gate is re-run against today's data. Envelopes now carry the content
type and the shape.

---

## Configuration

| Name | Kind | Notes |
|---|---|---|
| `OPENAI_API_KEY` | secret | copy engine (production) |
| `ANTHROPIC_API_KEY` | secret | copy engine, only when `SOCIAL_ENGINE=anthropic` |
| `SOCIAL_ENGINE` | variable | optional; the workflow defaults it to `openai` |
| `SOCIAL_MODEL` | variable | optional; defaults to `gpt-5` |
| `X_API_KEY` / `X_API_SECRET` | secret | X app |
| `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | secret | OAuth 1.0a user tokens — do not expire |
| `LINKEDIN_ACCESS_TOKEN` | secret | expires ~60 days; not enabled |
| `LINKEDIN_AUTHOR_URN` | variable | `urn:li:organization:…` |
| `SOCIAL_POST_ENABLED` | variable | must be exactly `true` to publish |
| `SOCIAL_POST_LEDGER` | local only | test seam for the ledger path |
| `SOCIAL_QUEUE_PATH` | local only | test seam for the queue path |

All in **GitHub → Settings → Secrets and variables → Actions**. Vercel
environment variables have no effect on publishing: nothing under `src/app`
imports `src/lib/social`.

**X is pay-per-use.** The API answered HTTP 402 "credits depleted" on
2026-08-10. The publisher now names that case (`code: "credits"`), the ledger
records it, and the validated copy stays in the queue for the next window; the
balance itself has to be topped up in the X developer portal.

---

## Stopping it

1. Set the repository variable `SOCIAL_POST_ENABLED` to anything other than
   `true`. Runs continue, select, generate and validate; they publish nothing.
2. Or comment out the two `- cron:` lines in `.github/workflows/social.yml`.

---

## What this deliberately does not do

- **No template fallback.** If the model is unreachable and the queue holds
  no ready copy, the window is silent.
- **No engagement optimisation.** Nothing in selection reads any metric from
  any platform. The analytics exist to be read by a person first.
- **No touching the newsletter.** Separate workflow, ledger, secrets and
  switch.
- **No filler.** The evergreen tier is finite and cooled down (explainers 120
  days, signals 45, tools 90); a quiet week ends with quiet days.

## Known limitations

- The evergreen registries are hand-written. Adding an explainer means
  writing it from its source and citing it; the tests pin that every one has a
  source and no advisory language, not that it is correct. Fourteen were
  fact-checked against their sources on 2026-09-02.
- The stub engine's copy is a planning artefact. The feed's voice is the
  model's, under the v9 prompt; only a real-model dry run shows it.
- Data signals are recomputed from the committed snapshots at run time, so a
  figure is as fresh as the last refresh. Every signal states its period.
- A share page exists for every recorded change, routine ones included; the
  routine ones are `noindex`, shareable but not submitted for crawling.
