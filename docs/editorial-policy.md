# Editorial policy

What ImmigrationClock publishes, what it excludes, and why. Every rule here is
enforced in code and covered by tests, so it can be audited rather than assumed.

**Directive basis:** Part 1 (trust principles, political neutrality), Part 2
(official sources first, explain don't amplify), Part 7 (neutral language,
visible trust).

---

## 1. Individual criminal cases are not published

**Rule:** The platform does not republish law-enforcement press releases about
individual criminal prosecutions, arrests, convictions, sentencings, or
denaturalization actions against named people.

**Where this bites:** The USCIS "All News" RSS feed — the fastest official signal
of policy change — carries both. Of 250 recent items, **roughly a quarter were
individual criminal cases**, with headlines like *"Illegal Alien Child Rapist
Sentenced for Immigration Fraud"* and *"Cuban Alien Sentenced for Role in
International Alien Smuggling."*

**Why they are excluded:**

1. **They name private individuals.** `src/domains/graph/entities.ts` restricts
   the `person` entity type to public officials in their official capacity, and
   `/methodology` already promises "no individual immigrant profiles, tracking,
   or identifying personal data." Ingesting these would break both commitments.

2. **The framing is not neutral.** `/methodology` promises "no dehumanizing
   language, slurs, or inflammatory framing." These headlines are written as
   advocacy. Republishing them verbatim would import that framing wholesale into
   a platform whose entire value is being the calm, sourced place to check facts.

3. **They are not policy change.** A single sentencing answers none of the three
   questions every event must answer — what changed, who is affected, what to do
   next. It is crime news. This is not a crime-news site.

4. **The audience.** Directive Part 2 lists "individuals navigating immigration"
   and "families supporting loved ones" first. A feed interleaving "the H-1B cap
   was reached" with individual prosecutions is not a neutral information
   platform to those readers.

**What this is not:** it is not the platform hiding enforcement. Aggregate
enforcement data — ICE arrests, removals, detention population — is tracked and
published as statistics, with sources and provenance labels. The distinction is
between **reporting the system and reporting on people.**

**Implementation:** `isIndividualCriminalCase()` in
`src/domains/graph/adapters/uscis-newsroom.ts`. Tuned asymmetrically on purpose:
a false exclusion loses one press release, a false inclusion publishes a named
private individual on a platform that promised not to. Every excluded item is
counted and reported in the adapter's warnings, so the exclusion is visible in
the build log rather than silent.

**Current effect:** 22 of 46 policy-relevant-looking items excluded on the last
run; zero leakage verified.

---

## 2. Proposed is never presented as final

A proposed rule is not in force. `validateEvent()` rejects any `proposed_rule`
carrying an effective date, and every proposed rule renders a mandatory
limitation saying it may change or may never be finalised.

---

## 3. Scope claims require evidence

Anything the platform says about **who is affected** must quote the document that
says it. `basis: "stated"` without a verbatim `evidence` quote fails validation.
See [who-is-affected.md](who-is-affected.md).

---

## 4. No advice, ever

`validateImpact()` rejects any action summary matching
`/you (should|must|need to|have to)/`. The platform describes what a document
requires; it never tells an individual what to do. That line is enforced in code
because it is the one most likely to erode under pressure to be "helpful".

---

## 5. No superlatives without the series to support them

`tests/trust-claims.test.ts` fails the build if a headline or tooltip contains
"record", "highest ever", "unprecedented", or similar. A superlative is a claim
about a whole history; we only make it if we hold that history.

---

## 6. No language model in the facts

No LLM produces, summarizes, ranks, or classifies anything a reader sees. Every
event field is copied verbatim from the government document or derived by an
explicit rule in the adapter. Where a document published no abstract, the event
says so rather than generating one.

A future LLM-assisted summary path exists in the schema (`reviewStatus: "draft"`)
and drafts never render publicly — but it is not built, and it will not be built
without a human approval gate.

---

## 7. Coverage gaps are stated, not implied

Every source in the registry is listed publicly with its status, including the
ones we cannot yet ingest and why (`blocked` adapters carry a `blockedReason`).
A quiet feed should never be mistaken for a quiet month, so
`eventCoverageNote()` names how many sources are actually running.

---

## Changing any of this

These rules are load-bearing for trust, and several are enforced by tests that
will fail the build. Changing one is a founder decision, not an implementation
detail — document the change here and in
[data-corrections.md](data-corrections.md) if it affects anything already
published.
