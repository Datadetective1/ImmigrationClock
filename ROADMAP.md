# Roadmap — post-beta

Items deliberately **not** built for the public beta.

Each one was considered during the August 2026 launch-readiness pass and
consciously deferred, either because it changes the architecture (and the
architecture is currently fit for purpose) or because it is an optimisation for
a scale this product has not reached. Nothing here affects correctness today.
Where an item has a **trigger**, that is the measurable condition under which it
stops being optional.

The current design is statically generated pages over a committed data layer,
plus one serverless function for newsletter signup. That choice buys enormous
reliability — a source outage cannot take a page down — and its limits are known
rather than discovered. These items are the limits.

---

## 1. Search index: paginated archive tail

**Today.** `events-index.json` ships the newest events that fit inside a 400KB
payload budget. At 859 events that is 523 shipped and 336 held back. The store
keeps everything; entity pages render everything; only the free-text search box
is bounded, and it says so.

**Later.** Serve the older tail as date-sharded JSON fetched on demand, or move
search server-side. Either restores whole-archive search without putting the
whole archive in a page bundle.

**Trigger.** When the unindexed remainder exceeds roughly a third of the archive,
or readers report not finding events they can see on entity pages.

**Explicitly not doing now:** replacing client-side search with a hosted search
service. It would add a runtime third-party dependency between a reader and a
government document, which the platform has avoided everywhere else.

---

## 2. Archive storage optimisation

**Today.** `events.json` is a single committed file — 859 events, ~2MB, growing
monotonically. Every build parses all of it. Every clone carries its full
history.

**Later.** Shard by year, or move the cold tail out of the bundle. Storage is not
the problem; git history weight and build-time parse cost are.

**Trigger.** Build time materially degrading, or the file passing ~10MB.

---

## 3. Observability

**Today.** None. No error tracking, no uptime monitoring, no alerting. The only
health signals are `refresh.json`, the per-adapter report inside `events.json`,
and the GitHub Actions run log. A human has to look.

**Later.** Error tracking on the client (Sentry or equivalent), an uptime check
on `/` and `/what-changed`, and a build-failure notification that reaches a
person rather than an inbox nobody opens.

**Trigger.** Before any paid tier, any SLA, or any second maintainer. This is the
largest operational gap remaining, and it is deferred only because a static site
with committed data has very few ways to fail at runtime.

---

## 4. Adapter health alerting

**Today.** `build-events.ts` records per-adapter `ok` / `eventCount` / warnings,
and `/what-changed` distinguishes *failed* from *connected but silent* from
*contributing*. Truthful, but passive.

**Later.** Alert when an adapter that normally contributes returns zero for N
consecutive runs. That is the signature of a government site quietly changing its
HTML — the failure mode the regex-based adapters are most exposed to, and the one
least visible, because a source that stops reporting looks exactly like a quiet
month.

**Trigger.** First time a source breaks silently and is noticed late. Pair with
item 3.

---

## 5. Time-relative statements computed at read time

**Today.** `explainEvent()` defaults `today` to build time, so "this rule does
not take effect until 1 September" is frozen into static HTML at build. Since
the daily refresh now commits `events.json` and event changes trigger a deploy,
staleness is bounded at roughly one day.

**Later.** Compute the force clause client-side, or render both branches and
select in the browser.

**Trigger.** If deploy cadence ever drops below daily. The bound is what makes
this acceptable, so if the bound goes, this becomes a correctness bug rather than
a roadmap item.

---

## 6. Store-age display

**Today.** `/what-changed` prints the build date. It does not say "3 days ago",
because computing that at build time would permanently render "0 days ago" —
the same class of frozen-clock error as item 5.

**Later.** A small client component for relative age. Deferred as not worth a
hydration boundary while the daily refresh holds.

---

## 6b. Newsletter: double opt-in

**Today.** Single opt-in. `POST /api/subscribe` stores the contact in the Resend
audience on submit and sends a welcome email. Nobody is added silently, which is
what makes single opt-in defensible, and it is standard practice.

**Later.** Double opt-in — store nothing until the recipient clicks a
confirmation link. Two reasons it is better: someone can currently subscribe an
address they do not own (a harassment vector, mitigated but not removed by the
welcome email), and GDPR consent is far easier to evidence with a confirmation
click than with a server log.

It can be done statelessly with an HMAC-signed token and a second route, so it
does not require a database. Deferred because it is more surface than the launch
should add and it doubles the failure modes of the one flow that must work.

**Trigger.** First sign of list poisoning, first complaint from someone who did
not subscribe, or any EU-targeted marketing.

---

## 6c. Rate limiting at the edge

**Today.** `/api/subscribe` rate-limits per IP in an in-memory Map: 5 requests a
minute. Serverless instances are ephemeral and horizontally scaled, so this is
per-instance and resets on cold start. It raises the cost of casual abuse and
will not stop a distributed attacker.

**Later.** Vercel WAF or Cloudflare rate limiting in front of the route, which is
where this belongs — shared state, and it never runs our code or bills our
function invocations for traffic we are going to reject anyway.

**Trigger.** Any abuse of the endpoint, or the first time function invocations
look wrong on the Vercel dashboard.

---

## 6d. CSP nonces

**Today.** `script-src` carries `'unsafe-inline'` because Next inlines its
hydration payload into every page.

**Later.** Per-request nonces. Note the constraint has changed but not gone: the
site now has a server for `/api/subscribe`, but every *page* is still statically
generated at build, so there is no per-request moment at which a nonce could be
issued. Adopting nonces means making pages dynamic — trading the reliability the
architecture is built on for hardening this threat model barely needs.

**Trigger.** Pages becoming dynamic for some other reason, or the site beginning
to render user-supplied content.

---

## 7. Blocked sources

**Today.** Four sources are `blocked` and say so publicly with specific,
dated reasons: the **Visa Bulletin** and **DOS announcements** (travel.state.gov
returns HTTP 403 from Cloudflare bot protection; verified 2026-08-01), **ICE
detention statistics** (XLSX with drifting sheet layouts), and **DOS visa
statistics** (monthly PDFs).

**Later.** The Visa Bulletin is the single highest-demand immigration dataset and
the most valuable unbuilt thing here. It needs a *parse-then-verify* workflow
with a human gate, not a blind parse: a mis-read priority date is not a degraded
event, it is a confidently wrong fact a reader will act on.

**Explicitly not doing:** circumventing bot protection. Not now, not later.

---

## 8. Planned adapters

`dol-perm`, `dol-lca`, `state-agencies`, and `sevis` are specified in the
registry with no implementation. `dol-lca` would replace today's modeled wage
figures with real ones, which is the most substantive accuracy upgrade available.

---

## 9. Deferred hygiene

- **Adapter registry counts.** `adapterCoverageSummary()` counts `live` + `ready`
  as "ingested automatically", which includes three entries (`warn`,
  `uscis-h1b-datahub`, `bls`) ingested by separate scripts that emit no events.
  Defensible, slightly generous, worth tightening.
- **Doc drift.** Several adapter headers say "sixteen sources"; the registry has
  nineteen.
- **`tsconfig.json`** still excludes `prisma` and `data_pipeline`, both long
  removed.
- **Tap targets.** The tooltip control was enlarged to a 24×24 hit area for WCAG
  2.5.8. Assorted inline text links remain under 24px; most fall under the
  inline-in-prose exemption, but a systematic pass would settle it rather than
  leaving it argued case by case.
- **`/search` heading order** jumps h1 → h3.
