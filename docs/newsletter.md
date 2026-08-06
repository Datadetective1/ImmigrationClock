# Immigration Pulse — newsletter system

Weekly, multi-language, fully automated. Built to be the same code whether it is
sending one global issue or a personalized H-1B digest in Arabic.

---

## 1. Folder structure

```
src/lib/newsletter/
  types.ts              Issue, IssueItem, Segment, Locale, Cadence
  select.ts             archive -> Issue   (the only place that decides content)
  render.ts             Issue -> { subject, html, text }   (pure, one template)
  validate.ts           pre-send gates
  locales/
    strings.ts          the LocaleStrings contract
    en.ts es.ts fr.ts ar.ts
    index.ts            registry + fallback

scripts/
  build-newsletter.ts   generate, validate, render every locale, archive
  send-newsletter.ts    broadcast (dry run by default)

public/newsletter/<issueId>/<locale>.html|.txt     permanent web archive
src/lib/generated/newsletter-latest.json           manifest the send step reads

.github/workflows/newsletter.yml                   the schedule
```

---

## 2. Architecture

Three pure stages with one job each:

```
EVENTS ──select(segment)──> Issue ──render(locale)──> { subject, html, text } ──> broadcast
            ↑ filters               ↑ localizes            ↑ validated here
```

**Selection is the only thing that varies between editions.** A `Segment`
carries a locale, a cadence, an optional entity filter and a minimum severity.
Everything else in the pipeline is indifferent to which edition it is handling:

| Edition | Segment |
|---|---|
| Weekly digest | `{ cadence: "weekly" }` |
| Daily digest | `{ cadence: "daily" }` |
| Breaking alert | `{ cadence: "breaking", minSeverity: "major", excludeIds }` |
| H-1B edition | `{ entityIds: ["visa:h-1b"] }` |
| India edition | `{ entityIds: ["country:india"] }` |
| Personalized | `{ entityIds: [...subscriber follows] }` |

None of those require touching the renderer, the validator, or the workflow.
That is the whole design: **new edition types are configuration, new languages
are data, and neither is code.**

**Rendering is pure.** `renderIssue(issue, baseUrl, contact)` does no I/O and
reads no clock, so the entire system is testable without a network and
previewable without a key.

**Sending is separate and idempotent.** `build-newsletter` is safe to run in CI
on every pull request — it mails nobody. `send-newsletter` refuses to run
without `--send`, reads only what was already validated, and names each
broadcast after the issue id so a re-run of a failed job cannot double-send.

---

## 3. Localization strategy

`LocaleStrings` is a TypeScript interface, so **a half-translated language is a
compile error**, not an English sentence appearing mid-paragraph in someone's
Spanish issue. A test additionally asserts that every locale differs from
English on the strings that matter, catching a file that was copied but never
translated.

Plural-sensitive strings are **functions, not templates**. `${n} changes` cannot
express Arabic's six plural categories; giving each locale the number and
letting it build its own sentence can.

### The rule that matters most: we translate the chrome, not the news

Every event title and summary is quoted from a U.S. government publication
written in English. **We do not machine-translate them.** A mistranslated "may"
versus "must" changes what someone believes about their own immigration status,
and this platform's rule is that AI may never invent facts — a translated quote
is an invented quote.

So source text passes through verbatim, and the template says so *in the
reader's own language* (`trust.sourceLanguageNote`). A Spanish subscriber gets
Spanish navigation, Spanish explanations and Spanish trust copy around English
government text they can verify against the source.

### Right-to-left

Arabic is `dir="rtl"` plus mirrored padding, driven by `isRtl(locale)` — not a
second template. Validation fails an Arabic issue that is missing `dir="rtl"`.

---

## 4. Adding a language

Two steps.

1. Create `src/lib/newsletter/locales/<code>.ts` exporting a `LocaleStrings`.
   TypeScript will not let you omit a key.
2. Add the code to `Locale` in `types.ts` and to the `STRINGS` map in
   `locales/index.ts`. Add it to `RTL_LOCALES` if the script is right-to-left.

Then set `RESEND_AUDIENCE_<CODE>` to enable delivery.

A test enumerates the locales directory and asserts it matches the `Locale`
union exactly, so adding a file without registering it (or the reverse) fails
CI rather than shipping a language nobody can receive.

---

## 5. Configuration

| Variable | Where | Purpose |
|---|---|---|
| `RESEND_API_KEY` | secret | Sending. Needs **Full Access**, not sending-only. |
| `RESEND_AUDIENCE_EN` / `_ES` / `_FR` / `_AR` | secret | The audience each edition broadcasts to. **Absent means build-and-archive but do not send** — a known gap, not a failure. |
| `RESEND_FROM_EMAIL` | var | Defaults to `Immigration Clock <noreply@immigrationclock.com>`. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | var | Reply-To. **Not** the unsubscribe route — see §5.1. |
| `PULSE_SEND_ENABLED` | var | **Master switch. Unset = never broadcast.** Set to `true` only after a dry run against the live account. |
| `NEWSLETTER_DATE` | local | Build a specific issue date. |
| `NEWSLETTER_CADENCE` | local | `weekly` (default), `daily`, `monthly`, `breaking`. |
| `NEWSLETTER_MANIFEST` | test seam | Point the send script at a fixture manifest. Must stay unset in production. |

### 5.1 Unsubscribe

Every edition carries the literal string `{{{RESEND_UNSUBSCRIBE_URL}}}` as its
unsubscribe link target, in the HTML and in the plain-text part. Resend
substitutes a per-contact opt-out link at send time and records the unsubscribe
against the contact. Triple braces are Resend's *unescaped* interpolation —
two braces would be HTML-escaped and arrive as visible text.

The link text is localized (`Unsubscribe` / `Cancelar suscripción` /
`Se désabonner` / `إلغاء الاشتراك`) and sits on its own footer line in `#334155`,
which is 9.9:1 against the `#f8fafc` footer.

**Two earlier targets were removed, and `preflight.ts` now blocks both:**

- `/pulse` — the **signup** page. An opt-out that opens a sign-up form is a dark
  pattern, and it left the reader subscribed.
- `mailto:` the contact address — reaches a human inbox, not the contact record.
  It satisfies neither one-click nor the 48-hour rule Gmail and Yahoo enforce.

**There is no `List-Unsubscribe` header on the broadcast, and this is correct.**
`POST /broadcasts` accepts `segment_id`, `from`, `subject`, `reply_to`, `html`,
`text`, `react`, `name`, `topic_id`, `send`, `scheduled_at` — and no `headers`
field, unlike `POST /emails`. Resend owns the List-Unsubscribe headers for
broadcasts, driven by the token above. Fabricating a header pointing at a URL
that cannot unsubscribe anyone would be worse than omitting it: RFC 8058
requires that URL to accept a POST and take effect within 48 hours.

Confirm the headers on the first real send by viewing the raw source of a
received copy. That is the only place they are observable.

#### The gate

`src/lib/newsletter/preflight.ts` decides whether an edition may send. Every
unsubscribe finding is **blocking** — missing, not-a-link, unlocalized, hidden,
below 4.5:1 contrast, absent from the text part, or pointing at a signup page.
Deliverability heuristics (thin text, long subject, link count) stay advisory.

It runs three times, and `--send` overrides none of them:

1. `build:newsletter` — blocking findings become validation errors, so the
   build exits non-zero and the manifest records `safeToSend: false`.
2. the workflow's *Verify every edition can be unsubscribed from* step.
3. `send:newsletter`, against the **exact bytes it is about to POST** — not
   what the manifest claims, because the manifest and the archived HTML are
   separate files that a partial commit can put out of step.

### ⚠️ Verify the broadcast API shape before enabling the schedule

Resend contacts are **account-level** (`POST /contacts`, no audience id), but
broadcasts have historically targeted an **audience**. Those two facts are in
tension and I could not resolve it without a live key.

The audience id is therefore **configuration**, the request body is built in one
place, and a dry run prints the exact payload. Run:

```bash
npm run send:newsletter
```

Confirm the printed `POST /broadcasts` body matches what your Resend account
expects. If the shape differs, `scripts/send-newsletter.ts` has one `payload`
object to adjust.

Two things to check specifically:

- **`audience_id` vs `segment_id`.** Resend has renamed Audiences to Segments
  and the current Create Broadcast reference documents `segment_id`. Existing
  audience ids still resolve, so the payload keeps `audience_id`; if your
  account rejects it, change that one key. Sending both risks a 422 on an
  unknown field.
- **The unsubscribe token survives.** The dry run prints
  `unsubscribe token present: true` for the HTML and the text part.

**The schedule cannot fire until `PULSE_SEND_ENABLED` is set to `true`**, which
is deliberate: a Thursday 14:00 UTC cron is the worst possible place to discover
a payload mismatch.

---

## 6. Verification steps

```bash
npm run build:newsletter     # generate + validate all locales
npm run send:newsletter      # dry run — prints payloads, contacts nobody
npm test                     # newsletter + unsubscribe-gate suites
open public/newsletter/weekly-en-<date>/en.html
```

Check by eye: the Arabic issue reads right-to-left, the language selector shows
all four, every card's button reaches a `.gov` URL, and no card renders a
proposal without its "not in force" badge.

To confirm the gate still bites, delete the unsubscribe line from one archived
edition and run the dry run — it must exit 1 with `UNSUBSCRIBE GATE FAILED`,
then restore it with `npm run build:newsletter`.

---

## 7. Accessibility review

- **Semantic heading order** — `h1` masthead, `h2` per story. Screen readers can
  navigate story to story.
- **`lang` and `dir`** are set from the locale, so a screen reader switches voice
  correctly rather than reading Arabic with an English engine.
- **Real text, no images.** Nothing depends on image loading or alt text, and
  every word is selectable and translatable by the reader's own tools.
- **Colour is never the only signal.** "Not in force" is a word, not a shade —
  the one coloured badge also says what it means.
- **Contrast**: body `#334155` on white is 10.4:1; muted `#64748b` is 5.7:1; the
  accent button is white on `#0ea5e9` at 3.1:1, which passes AA for large/bold
  text at 14px 700 weight.
- **A genuine plain-text alternative**, which is what many screen readers render.
- **Tap targets** — every button and link row is at least 40px tall.

---

## 8. Deliverability

Already implemented:

- **A real `text/plain` part.** Missing or trivial text is a strong spam signal;
  validation rejects a text part under 200 characters.
- **A working, localized, blocking unsubscribe** on every edition — see §5.1.
  Readers who can find the unsubscribe use it instead of hitting "report spam",
  which is the single most damaging signal there is.
- **`List-Unsubscribe` header** on the *welcome* email, which goes through
  `POST /emails` and therefore supports `headers`. It is a `mailto:` value, so
  it is **not** RFC 8058 one-click; `List-Unsubscribe-Post` is deliberately
  absent rather than claiming a capability a mailbox cannot honour. The welcome
  email is transactional and exempt from the bulk rules either way.
- **One sending domain**, already verified in Resend.
- **`noreply@` sends, `hello@` receives replies** via Reply-To, so a reply
  reaches a human.
- **No images**, so no tracking-pixel heuristics and no image-heavy ratio.
- **Stable `from`, subject shape and cadence** — reputation is built on
  predictability.

Still recommended, in order of impact:

1. **SPF, DKIM and DMARC** — Resend sets up SPF/DKIM; add a DMARC record
   (`p=none` first, then `quarantine`). Without DMARC, Gmail and Yahoo bulk-send
   rules increasingly reject outright.
2. **A `List-Unsubscribe: List-Unsubscribe-Post` one-click header** on broadcasts
   once per-recipient tokens exist. This is required by Gmail/Yahoo for senders
   above 5,000 messages a day.
3. **Warm the domain.** Do not go from 0 to 100,000 in one send. Ramp over two
   to three weeks; a sudden volume spike on a new domain looks exactly like a
   compromised account.
4. **Suppress hard bounces immediately** and prune addresses that have not opened
   in ~6 months. A stale list is the most common cause of a slow reputation
   decline.
5. **Double opt-in** (already on the roadmap) — the strongest single defence
   against list poisoning and spam-trap addresses.

### Spam-score notes

- Subject lines carry no `!`, no ALL CAPS, no "FREE" or "ACT NOW".
- Text-to-HTML ratio is healthy; the plain-text part is substantial.
- No URL shorteners — every link is a first-party or `.gov` URL.
- No `<style>` block, no scripts, no forms, no `background-image`.
- The preheader is a real sentence, not padding or whitespace.

---

## 9. Increasing open rate, professionally

The subject line already carries a **number** (`Immigration Pulse — 4 changes`),
which is honest and specific rather than curiosity-baiting. Beyond that:

1. **Put the most important change in the preheader.** A specific fact beats a
   category. This is a one-line change to `preheader()` and the highest-leverage
   item here.
2. **Send at a consistent time.** The workflow uses Thursday 14:00 UTC —
   mid-morning US Eastern. Consistency matters more than the exact hour.
3. **Say "quiet week" in the subject when it is one.** Counterintuitive, and it
   builds the trust that makes the busy weeks get opened.
4. **Never send an empty issue as if it were full.** The template already
   handles this honestly.
5. **Let people choose frequency and topics** (see below). Relevance beats
   subject-line craft by a wide margin, and it is the main lever on unsubscribes.

---

## 10. Personalized subscriptions — what is built and what is not

**Built:** the entire selection and rendering path. A segment carrying
`entityIds` produces a focused issue today, and `selectIssue` is already tested
against it.

**Not built:** the part that collects preferences. The signup form takes an
email address and consent — nothing else. Personalization needs:

1. **Preference capture at signup** — language, visa types, countries, frequency.
   A UI change plus storing the choices on the Resend contact.
2. **Segment resolution** — mapping a subscriber's stored preferences to a
   segment id, and creating the corresponding Resend audience/segment.
3. **A fan-out strategy.** At hundreds of thousands of subscribers, one broadcast
   per segment is the only viable shape; per-recipient sends are not. The
   practical limit is the number of distinct segments, so preferences should be
   coarse (a handful of visa groups, top ~20 countries) rather than free-form.

That sequencing is deliberate: the expensive, irreversible part (content
selection) is done and tested; the remaining work is a form and a mapping.
