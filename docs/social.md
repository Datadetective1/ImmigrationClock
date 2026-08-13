# Social publishing

Three opportunities a day on X and LinkedIn, unattended, with an LLM writing the
copy and deterministic code deciding everything else.

**Status: dry run.** Everything below is built and tested. Nothing publishes,
because `SOCIAL_POST_ENABLED` is unset. See [Going live](#going-live).

---

## The governing principle

> ImmigrationClock never posts because the clock says it is time to post. It
> posts because it has something useful, factual, timely or genuinely
> interesting to tell someone.
>
> The schedule creates opportunities. The content earns publication.

Every design decision below follows from that. In particular, **skipping is a
normal outcome, not a failure**, and the system is built to skip cheaply — the
gates that can reject a slot without an API call all run before the API call.

---

## The three slots

Three posts a day is not three news stories a day. The archive yields roughly
six qualifying official developments in a *week*; twenty-one news slots a week
would either starve or repeat. So each slot draws on a different pool, and only
the first is news.

| Slot | Local time | Pool | What it is for |
|---|---|---|---|
| Morning | 09:00 CT | `news` | **What changed, and what it now requires.** A genuinely new qualifying development from the last two days, and the obligation it creates where there is one. Skips often, by design. |
| Afternoon | 15:00 CT | `knowledge` | **Explain something.** The teaching slot: who an active rule reaches, what a document changed, what happens on a coming effective date. Written for someone with an application in progress. |
| Evening | 18:00 CT | `standing` | **Look ahead, or hand someone a tool.** A window on the horizon, or a durable resource worth knowing about. Never manufactured urgency. |

The pools do not overlap. The afternoon slot deliberately excludes the last two
days, so it can never "explain" a rule the morning slot broke six hours earlier
— which is the most recognisable tell of an automated account padding a
schedule.

---

## The pipeline

```
window → pool → score → angle → subject dedupe → LLM → validate → wording dedupe → publish
└──────────────── free, deterministic ────────────────┘   └── one API call ──┘
```

Each stage can end the slot, and each refusal is a named outcome in the ledger.

### 1. Window (`slots.ts`)

GitHub Actions cron is always UTC and has no `timezone` key. The workflow
therefore schedules **both** US offsets:

```yaml
- cron: "0 14,20,23 * * *"   # CDT (UTC-5)
- cron: "0 0,15,21 * * *"    # CST (UTC-6)
```

Those hours come from `utcHoursFor()`, and `tests/social-slots.test.ts` parses
the workflow file and asserts every slot has both offsets covered — commented
out or not.

Six firings a day; three are an hour wrong on any date. `currentSlot()` reads
the real America/Chicago wall clock via `Intl.DateTimeFormat` and returns `null`
unless the local hour is 9, 15 or 18. The wrong-offset firings exit in seconds.

Both DST transition days are covered by tests.

### 2. Selection and scoring (`select.ts`, `score.ts`)

Scoring **reuses the newsletter's ranking model** (`newsletter/ranking.ts`)
rather than inventing a second one: breadth → obligation → magnitude →
authority → recency, as positional weights where each strictly dominates the
next. Two consequences, both intended: improving the newsletter's ranking
improves social selection, and the two surfaces can never disagree about which
change matters more.

Thresholds are expressed against those weights:

| Pool | Floor | Means |
|---|---|---|
| news | 2100 | breadth ≥ 2 **and** at least one obligation step |
| knowledge | 2000 | breadth ≥ 2 |

`routine` severity is never posted, whatever it scores — that is form edition
dates and information-collection notices, i.e. the filler the principle forbids.

Scheduled-for-publication documents are excluded. The Federal Register puts
items on public inspection days before publication; posting one forces
"scheduled for publication on…" phrasing that is weaker and easier to get subtly
wrong than simply waiting.

### 3. Angles

An angle must be **earned by the data**, not chosen because the slot needs one:

| Angle | Requires |
|---|---|
| `breaking_change` | published in the last 2 days |
| `effective_date_reminder` | a real future `effectiveAt` within 90 days |
| `who_is_affected` | a linked visa, country, or non-catch-all topic |
| `what_changed_from_previous` | `updated_information`, or an amend/revise/supersede title |
| `historical_context` | ≥ 2 other events sharing a distinctive entity |
| `deadline_approaching` | a key date within 120 days |
| `data_insight` | a standing asset **with a grounded insight** (see 5a) |
| `what_it_requires` | the ranking model scores `obligation` ≥ 2 |
| `preparation_window` | a key date 46–120 days out |

**`what_it_requires` is the "what should I do" angle, reframed.** It states the
requirement as a property of the rule — "the rule requires a fee at filing" —
never as an instruction to the reader. `you should`, `make sure to` and `apply
now` are all rejected by the validator's legal-advice checks, which are
unchanged. The angle is written to live inside that constraint.

**`preparation_window` exists so urgency is never manufactured.** Key dates split
at 45 days: inside it the countdown is the news (`deadline_approaching`);
outside it the honest framing is that a window is coming.

### Same-day variety

Cooldowns work over weeks and key on subject ids. They do not catch three posts
that are one story to a reader: an H-1B fee rule (`event:`), the sponsor
directory (`asset:`) and the registration window (`keydate:`) are three
subjects, three destinations and three angles — every other gate passes them,
and together they are a day of nothing but H-1B.

So every candidate carries a **`topicKey`** (visa → country → non-catch-all
topic → source), recorded in the ledger, and **one topic may be covered once per
day per platform**. It runs first in `chooseCandidate()` because it is the
cheapest check. It counts only `POSTED` rows, so a dry run does not consume the
day's variety, and it **fails open** on an unknown topic rather than silencing a
slot.

### Visuals — `visuals.ts`

Five card kinds, built in TypeScript from the same records the fact set comes
from. No image model is asked to render immigration information and no card text
is generated.

**Most posts get no card.** Four angles are on an explicit deny-list because
their value is prose (`who_is_affected`, `what_changed_from_previous`,
`historical_context`, `effective_date_reminder`); events need `major` severity;
assets need a reported figure. A test asserts fewer than half of all candidates
carry one.

`assertVisualGrounded()` runs every numeral on a card back through the
validator's own `allowedDigitRuns()`, and an approximate date prints its caveat
**on the card** — a card gets screenshotted without the post underneath it.

**Rendering and upload are not built.** A `VisualSpec` is a description. See
"Visuals: what upload would require" below.

An angle the data cannot support is an invitation for the model to invent the
supporting detail.

### 4. Dedupe (`dedupe.ts`)

Uniqueness is **subject × angle × platform × cooldown** — not subject alone. The
same development legitimately supports several treatments over time: a rule when
it lands, its effective date as it approaches, who it reaches.

| Subject kind | Same angle again | Any angle again | Max angles |
|---|---|---|---|
| `event:` | never | after 14 days | 4 |
| `keydate:` | after 300 days | after 21 days | ∞ |
| `asset:` | after 120 days | after 21 days | ∞ |

Plus:

- **URL cooldown**, 7 days per platform. *News is exempt from cooldowns caused by
  other pools* — a breaking rule must not be suppressed because the evening slot
  linked the same page last week. News still cools down against other news.
- **Validation cooldown**, 5 days. A treatment the validator rejected twice
  stands down, so one unpublishable candidate cannot occupy a slot every day
  forever.
- **Wording similarity**, word-trigram Jaccard ≥ 0.55 against the last 60 posts
  on that platform, computed after generation.

### 5. The fact set (`facts.ts`) — the closed world

The copy engine has **no web access, no retrieval and no tools.** Everything it
knows about a subject is assembled deterministically from data the repository
already holds: title, summary, source, dates, classification, linked entities,
the permitted URLs, and the figures the source itself used.

This is the first hallucination control and it is structural rather than
instructional: a model cannot fabricate a statistic about an agency it was never
told about.

### 5a. Standing-asset insights (`asset-facts.ts`)

A page has no "summary as published", so for the first version of this system the
evening slot was given nothing but the page's own description — and produced
exactly what that guarantees: true sentences that described a table of contents.

`asset-facts.ts` computes, per asset, a set of **finished statements of fact**
from datasets the repository already holds, and hands them over as
`facts.dataPoints`. The arithmetic and the attribution both happen in TypeScript.
**The model is never asked to calculate anything**, and the figure-grounding
check is unchanged: a numeral that did not come from here is still unpublishable.

Which assets get numbers follows the site's own provenance labels — `reported`
only:

| Asset | Figures | Source |
|---|---|---|
| `/h1b/employers` | export FY, employers in export, employers listed, approvals, denials, approval rate | USCIS H-1B Employer Data Hub (ingested) |
| `/layoffs` | notices, employees, employers, state coverage, date range, last two complete months | State WARN feeds (ingested) |
| `/layoffs-vs-h1b` | employers in both datasets, WARN employees, H-1B approvals | the join of the two above |
| `/border/encounters` | current-FY YTD + reporting month, last three complete FY totals | CBP nationwide encounters (live file) |
| `/what-changed` | records held, oldest, feeds, final vs proposed rules | our own archive |
| `/sources` | sources registered, government vs third-party, machine-ingested, planned | our own registry |
| `/key-dates` | deadlines tracked, how many have a live countdown | our own registry |

And which assets deliberately get **none**, because their page figures are not
reported:

| Asset | Why not |
|---|---|
| `/h1b/top-sponsors` | ranks a curated sponsor set; the page labels its own totals `modeled` |
| `/immigration/enforcement-trends` | current-year ICE values are curated round numbers; detention is a point-in-time snapshot past its own staleness window |
| `/migration-map` | country splits are apportioned from a national total |
| `/visa/f1-student-visas` | DOS tables are transcribed by hand and the recent years are rounded |
| `/methodology`, `/timeline`, `/work-visas`, `/following` | nothing numeric to state |

Those assets still post, on a **non-numeric insight** — almost always the
methodological point a reader gets wrong (an encounter is an event not a person;
arrests, removals and detention cannot be added; a DOS issuance is not a USCIS
approval). Where there is no such point either, `assetInsights` returns `null`,
the asset leaves the rotation, and the evening goes quiet. `tests/social-asset-facts`
pins that list, so relaxing it is a visible decision rather than a quiet one.

Each entry also carries the source's own `limitations` string from
`src/lib/sources.ts`, which is what lets a WARN post state that WARN never
identifies the immigration status of the workers affected.

### 6. The validator (`validate.ts`)

> **The prompt asks. The validator enforces. Anything only the prompt enforces
> is not enforced.**

| Check | What it stops |
|---|---|
| **URL whitelist** (exact set membership) | a plausible-looking wrong link |
| **Figure grounding** (every digit-run must appear in the fact set) | an invented statistic |
| **Quotation grounding** (double-quoted spans must be verbatim) | an invented quote, including paraphrase-in-quotes |
| Attribution | crediting an agency the source never names |
| Banned constructions | prediction, speculation, legal advice, unsupported superlatives, engagement bait, emoji |
| Proposed-rule framing | a proposal reading as law |
| Effective dates | asserting one the archive does not record |
| Platform shape | length, link count, hashtags, the LinkedIn fold |

Tuned toward rejecting. A false rejection costs one silent slot; a false
publication costs the thing the site is for.

On failure: **one regeneration**, with the specific failures fed back. Two
strikes and the slot is silent.

### 7. Publishing

X and LinkedIn are evaluated independently at every stage after generation.
One engine call produces both variants — they share a subject and angle — but
from there X's outcome never depends on LinkedIn's.

---

## The exact-copy approval path

The unattended path generates and publishes in one process, which is right for a
schedule and wrong for a controlled first post: the copy a human reads in a dry
run is not the copy that ships, because `--live` calls the model again.

`--approved` is the alternative. Three commands, three separate decisions:

```bash
npm run social:propose -- --slot=evening
```

```bash
npm run social:show -- --file=approvals/2026-08-09-evening.json
```

```bash
npm run social:approve -- --file=approvals/2026-08-09-evening.json --by="Name" --digest=<from show> --platforms=x
```

```bash
npm run social:post -- --slot=evening --approved=approvals/2026-08-09-evening.json --live
```

**`propose` makes the only model call.** It runs the real pipeline — selection,
scoring, angle, subject dedupe, generation, validation, wording dedupe — and
writes the result to a file instead of publishing it. It does **not** write the
ledger: proposing is not an attempt to publish, and recording it as one would
burn cooldowns on a post that may never be approved.

**`runApproved()` takes no `CopyEngine`.** Generation on this path is not skipped,
it is unreachable — which is what makes "the text that was read is the text that
ships" a property of the type signature rather than a promise.

### What binds the approval to the copy

`contentDigest` is a SHA-256 over the fields the publisher acts on: slot, date,
subject, angle, destination, fact-set hash, validator version, and both post
strings. `social:show` prints it; `social:approve` requires you to pass it back,
so an approval is bound to a *specific reading of a specific file*. The approved
digest is then stored, and publication requires the recomputed digest to equal it.

This is **tamper evidence, not authentication** — anyone who can write the file
can recompute the digest. What it rules out is the realistic failure: an edit, a
partial write, a stale file, the wrong envelope, or a regeneration quietly
replacing what was read. What it does not rule out is deliberate forgery by
someone with repository write access, and no keyless file scheme can.

The envelope also carries the full fact set, **for reading only**. The publisher
recomputes the fact set from today's data, requires the hash to match, and
validates against the recomputed facts — so editing the stored copy of the facts
cannot make anything pass.

### What is re-checked before sending

Every gate, in this order, and any failure means nothing publishes:

| | Check |
|---|---|
| 1 | envelope digest intact |
| 2 | explicitly approved, by a named approver, at a sane time |
| 3 | approved digest still matches the copy |
| 4 | ≤ 24h old (`MAX_APPROVAL_AGE_HOURS`) |
| 5 | same America/Chicago day it was written for |
| 6 | validator version unchanged since approval |
| 7 | not already published — an approval is single-use, keyed on `approvalId` in the ledger |
| 8 | subject still in today's pool, still supports the angle, same destination |
| 9 | **fact-set hash unchanged** — a refresh between approval and publication refuses rather than shipping stale figures |
| 10 | destination still publishable |
| 11 | full validator re-run, per platform, against the recomputed facts |
| 12 | subject + URL cooldowns re-run against the current ledger |
| 13 | wording similarity re-run against the current ledger |

Platforms stay independent throughout: a cooldown that blocks X does not block
LinkedIn. Both switches still apply — `--live` **and** `SOCIAL_POST_ENABLED=true`.

---

## X and LinkedIn copy

| | X | LinkedIn |
|---|---|---|
| Length | **target 240–260**, hard limit 275 incl. link | 300–1300 chars |
| Critical zone | first ~40 chars | **first 140** — the "see more" fold |
| Headline | must *not* restate the title (the preview shows it) | may restate |
| Audience line | omitted for space | required, drawn from the fact set |
| Hashtags | 0–1 | **0–3, no quota** — none is usually right |
| Link | inline at end | own line at end |
| Register | terse, wire-service | explanatory, still non-advisory |

275 rather than 280: X counts a link as a fixed-width `t.co` token whose length
has changed before, and losing the link off the end is worse than five spare
characters.

The prompt asks for **240–260**, not for "at most 275". A model writing to a
stated maximum treats it as a target and lands past it — the first real proposal
came back at 286 — so the limit is expressed to the model as a band with the
cliff named separately.

The hashtag rule is a floor-and-ceiling, not a target. Padding to three is what
makes an account read like marketing rather than a reference source.

---

## Provider abstraction

`CopyEngine` has one method. Two implementations ship:

| Engine | Use |
|---|---|
| `anthropic` | production. `SOCIAL_MODEL`, default `claude-opus-5` |
| `transcript` | replays copy from a file, for offline dry runs and simulations |

**The transcript engine is not a fallback.** If the real engine is unavailable
during a live run, the slot skips — a second, rarely-exercised voice that ships
only when nobody is watching is worse than silence. It is selected explicitly,
by flag, and stamps its own id into every ledger row.

Model choice: Opus at ~3 calls/day costs a few dollars a month more than a
cheaper tier. The failure this system guards against is a plausible-sounding
sentence that over-claims what a federal agency did, published unattended, on an
account whose only asset is being believed. That is where capability pays.

---

## The ledger

`src/lib/generated/social-posted.json`, committed by the workflow, so git
history is the audit trail.

**It records attempts, not successes.** A system whose whole design is "skip
unless the content earns publication" is one whose skips are the interesting
data — they are how you tell a quiet archive from a selector that broke in March
and nobody noticed because the feed still looked plausible.

Each row: timestamps (UTC and Chicago), slot, pool, platform, decision, reason,
subject, angle, score, the exact published text, destination, the platform's post
id, model, prompt version, validator version, fact-set hash, tokens, cost — and,
on the exact-copy path, the approval id and the name of the approver.

**Never written:** credentials, tokens, or raw authenticated responses.

A corrupt ledger **halts publishing** rather than reading as empty — the same
fail-closed rule as the newsletter send ledger, for the same reason.

### Decision codes

`POSTED` · `DRY_RUN` · `SKIPPED_OUTSIDE_WINDOW` · `SKIPPED_NO_QUALIFYING_CONTENT`
· `SKIPPED_DUPLICATE` · `SKIPPED_COOLDOWN` · `SKIPPED_VALIDATION_FAILED` ·
`SKIPPED_ENGINE_UNAVAILABLE` · `SKIPPED_CREDENTIAL_EXPIRED` ·
`SKIPPED_PUBLISH_FAILED` · `SKIPPED_NOT_ENABLED`

---

## Configuration

### Where the credentials have to live — and where they do nothing

This system does **not** run on Vercel. Vercel builds and serves the site; the
social publisher is a GitHub Actions cron job (`.github/workflows/social.yml`)
plus the CLI scripts in `scripts/`. Nothing under `src/app` or `src/components`
imports `src/lib/social`, and the only serverless route the app ships is
`/api/subscribe`.

So credentials set as **Vercel environment variables have no effect on
publishing.** They are injected into Vercel's builds and functions, and nothing
there reads them.

| Where you need them | For what |
|---|---|
| **GitHub → Settings → Secrets and variables → Actions** | the scheduled workflow, and any manual `workflow_dispatch` |
| **Your local shell**, for one command | a controlled first post via the approval path |

Vercel is the wrong place for all four X values and for `ANTHROPIC_API_KEY`,
`LINKEDIN_ACCESS_TOKEN` and `LINKEDIN_AUTHOR_URN`. Leaving them there is not
harmful — nothing reads them — but it is not configuration either.

All credentials live in **GitHub Secrets**. None is ever printed.

| Name | Kind | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | secret | copy engine |
| `X_API_KEY` / `X_API_SECRET` | secret | X app |
| `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | secret | OAuth 1.0a user tokens — **do not expire** |
| `LINKEDIN_ACCESS_TOKEN` | secret | **expires ~60 days** |
| `LINKEDIN_AUTHOR_URN` | variable | `urn:li:organization:…` |
| `SOCIAL_POST_ENABLED` | variable | must be exactly `true` to publish |
| `SOCIAL_MODEL` | variable | optional; defaults to `claude-opus-5` |

### The LinkedIn token, honestly

LinkedIn access tokens expire on a fixed cycle and programmatic refresh is gated
behind an approved-partner product. Unless the account holds that access,
LinkedIn publishing has a manual touchpoint roughly every two months and no
architecture removes it.

What the system does about it: detects the rejection specifically, records
`SKIPPED_CREDENTIAL_EXPIRED` **for LinkedIn only**, and leaves X entirely
unaffected. X's tokens do not expire, so X genuinely runs unattended, and it
would be a poor trade to couple its reliability to a platform that cannot.

---

## Commands

```bash
npm run social:preflight
```

```bash
npm run social:verify-x
```

```bash
npm run social:simulate -- --days=1 --engine=anthropic
```

```bash
npm run social:post
```

```bash
npm run social:post -- --slot=evening
```

```bash
npm run social:propose -- --slot=evening
```

```bash
npm run social:simulate -- --from=2026-08-04 --days=7 --engine=transcript --transcript=fixtures/social-transcript.json
```

---

## Going live

Nothing publishes until every step below is done deliberately.

1. **Confirm the X API tier** permits ~90 writes a month.
2. **Add the secrets** above. X and LinkedIn are independent; either alone works.
3. **Run the preflight.** It reports credentials, ledger health, what each slot
   would do today, and whether any destination is unpublishable.
4. **Dispatch manually with `live` unchecked.** Read the generated copy for all
   three slots.
5. **First live post should go through the approval path**, not the cron and not
   `runSlot`. `propose` → `show` → `approve` → `post --approved`, so the bytes a
   human read are the bytes that ship. The Anthropic call shape and both platform
   adapters have never made a real request — they are written from current
   documentation and unit-tested, but not verified against a live endpoint.
6. **Set `SOCIAL_POST_ENABLED=true`** only after step 5 posts correctly. Note
   that every scheduled firing passes `--live`, so setting it arms all three
   daily slots at once — comment out the two `schedule:` crons until you want
   that.

To stop everything: unset `SOCIAL_POST_ENABLED`. The workflow keeps running,
selecting and validating; it just publishes nothing.

---

## What this deliberately does not do

- **No template fallback.** If the model is unreachable, the slot is silent.
- **No retry of a failed platform later.** A delayed duplicate is worse than a
  missed post.
- **No engagement optimisation.** Nothing in selection or scoring reads any
  metric from either platform.
- **No touching the newsletter.** Separate workflow, ledger, secrets and enable
  flag. Nothing here reads or writes `PULSE_SEND_ENABLED`.

---

## Visuals: what upload would require

Not built, deliberately. Before any of it is written, three things need
confirming — and the third is the one that decides whether it is possible at all.

1. **A different endpoint.** `/2/tweets` takes JSON. Media upload is a separate
   endpoint that takes `multipart/form-data` and returns a `media_id` you attach
   to a second call. The current X adapter only speaks JSON.
2. **A rasteriser.** A `VisualSpec` is a description, not pixels.
   `scripts/build-brand-assets.mjs` already renders HTML to PNG with headless
   Chrome, which is preinstalled on `ubuntu-latest`, so this needs no new npm
   dependency — just wiring.
3. **An access tier that includes media upload.** This has historically not been
   part of X's free tier. Check the developer portal for the app, and confirm
   the current endpoint and tier requirements against X's live documentation.

The branded OG preview (below) covers much of the same ground for zero API
surface, and is worth evaluating first.

## Known limitations

- **The attribution check is literal about abbreviations.** A fact set whose
  source name reads "U.S. Dept. of State — DV Program" rejects copy that writes
  "State Department", because the check compares against the fact-set text. The
  first real Anthropic proposal failed on exactly this. The check is unchanged —
  it is doing its job — but the prompt now computes and states the permitted
  attributions per subject (`permittedAgencies()`, one list shared with the
  validator), including the "none available, use neutral wording" case, so the
  model is no longer guessing. A source name written in full would still be the
  better fix at the registry level.
- **The evening pool is 15 assets plus up to 6 key dates.** With a 21-day
  subject cooldown that covers most days but not all. Adding assets raises the
  hit rate.
- **The evening pool now depends on the data refresh, not just the catalogue.**
  An asset whose source fails to refresh can lose its insight and leave the
  rotation — `/border/encounters` does exactly that if the live CBP fetch is
  unavailable. That is the correct behaviour (no live figures, no post), but it
  means a broken refresh shows up as quiet evenings. The preflight prints the
  in-rotation count and names anything dropped.
- **Standing-asset figures are only as fresh as the last committed snapshot.**
  `dataPoints` are computed at run time from the generated JSON in the repo, so a
  post says what the repo held when the workflow ran, not what the agency
  published this morning. Every figure is stated with its period for that reason.
- **Neither platform adapter nor the Anthropic call has run against a live
  endpoint.** See step 5 above.
