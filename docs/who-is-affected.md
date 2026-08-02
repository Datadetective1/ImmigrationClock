# "Who Is Affected?" — design and honest limits

**Founder direction:** every event automatically answers three questions.

1. **What changed?** → `ImmigrationEvent.title` / `summary`
2. **Who is affected?** → `EventImpact` (`src/domains/graph/impact.ts`)
3. **What should they do next?** → `EventImpact.actionRequired`

**Status:** built, tested against live Federal Register documents, wired into both
adapters and the event store.

---

## Why this needed more care than anything else so far

Every other number on this platform is something a reader *looks at*. This is
something a reader **acts on**. Someone reads an affected-countries list and
decides whether to book a flight, file early, or stop worrying.

Getting it wrong does not produce a slightly inaccurate chart. It tells a real
person that a rule affecting their travel does not concern them — or frightens
someone it never touched. Both are worse than showing nothing.

So the extractor is deliberately unambitious. It finds what the document *itself*
says about its scope, quotes it, and stops. It does not reason about immigration
law, does not fill gaps, and does not guess at implications.

---

## The three rules

### 1. Stated and inferred are never merged

Every impacted entity carries a `basis`:

| Basis | Meaning | Evidence required | Confidence |
| --- | --- | --- | --- |
| `stated` | The document names it | **Yes — verbatim quote, enforced in validation** | exactly 1 |
| `derived` | Follows necessarily (an agency implements its own rule) | No — structural fact | <1 |
| `inferred` | Our inference from context | No | <1, and suppressible |

A `stated` claim with no quote fails the build. There is currently **no
`inferred` path in production** — adding one needs a review workflow first,
because an inferred scope claim is exactly the kind of assertion that should not
ship unreviewed.

### 2. Completeness is part of the answer

"These 12 countries" and "at least these 12 — the document may name more" are
different claims. `completeness` is `exhaustive` / `partial` / `unspecified`, and
`exhaustive` is deliberately hard to earn: it requires a closed list published in
text we actually read, and it fails validation if any entry is inferred.

### 3. "What to do next" is quoted, not authored

ImmigrationClock does not give legal advice. `actionRequired` therefore:

- paraphrases what **the document** requires, always conditionally
- carries the verbatim sentence as `evidence`
- fails validation if the summary matches `/you (should|must|need to|have to)/`

That last check is a hard guard in `validateImpact()`. Advice-shaped copy cannot
reach production even by accident.

---

## Worked example: the Visa Bond Program

A real final rule from the State Department, effective 2026-08-03. Here is what
the platform actually produces:

| Field | Value |
| --- | --- |
| **What changed** | Visas: Visa Bond Program — final rule |
| **Visa types** | `visa:b-1-b-2` — **stated** |
| **Evidence** | *"An alien applying for a visa as a temporary visitor for business or pleasure (B-1/B-2) may be required to submit a bond…"* |
| **Agencies** | Department of State — derived |
| **Effective** | 2026-08-03 |
| **Status** | Final rule |
| **Action required** | The document states a requirement for those it covers — with the verbatim passage quoted |
| **Countries** | *Not listed in this document* |

### Why the country list is empty — and why that is the right answer

Your example listed Nigeria, Algeria, Benin, Zambia. Those are real, but **they
are not in this rule.** The rule says:

> *"visa bonds may be required from certain business/pleasure (B-1/B-2) visa
> applicants who are nationals of countries with high overstay rates, deficient
> information sharing, insufficient identity verification…"*

The country list is maintained separately by the State Department. So the
platform sets `scopeDefinedElsewhere` and tells the reader exactly that, quoting
the delegating passage, rather than inventing a list.

**This is the single strongest argument for the knowledge graph.** Fully
answering "who is affected" here requires linking two events — the rule, and the
State Department designation that names the countries. One feed cannot do it.
Connected events can. That link becomes possible when the DOS adapter lands.

---

## Two precision failures caught by live data, and fixed

Both were found by running against real documents rather than fixtures. Both are
now pinned by regression tests.

**1. Canada and Mexico attributed to the Visa Bond rule.**
A general "scope sentence" filter matched a background passage about a DHS
overstay report that mentioned land arrivals from Canada and Mexico. The
extractor concluded the rule covered Canadian and Mexican travellers. It does
not.

*Fix:* countries are now extracted **only** from sentences using explicit
designation language (`nationals of`, `designated countries`, `country of
chargeability`, …). Background prose that merely names a country never
qualifies. We accept missing real lists as the price of not inventing false ones.

**2. Wrong evidence quote for delegated scope.**
Unweighted phrase matching quoted a sentence about a legislative effort from
2000. *Fix:* delegation phrases are weighted, the strongest wins, and evidence is
now a window around the matched phrase rather than whatever span it landed in —
sentence segmentation is unreliable on government text full of footnote markers.

---

## What this cannot do

Stated plainly, because the limits are part of the product:

- **It only sees what the document says.** A rule that delegates its scope
  produces no country list here until the companion designation is also ingested.
- **It reads the preamble, not the full regulatory text.** Full text is fetched
  for non-routine events and capped at 200KB.
- **It cannot tell an individual whether a rule applies to them.** That depends
  on facts the platform does not have and never will.
- **Universities, employers, and industries are declared but not yet populated.**
  They arrive with the SEVIS and PERM adapters.
- **No language model is involved.** Every field is copied from the document or
  produced by an explicit rule in `extract-impact.ts`.

The disclaimer rendered beneath every impact block says the first and third of
these in plain language.

---

## Files

| File | Role |
| --- | --- |
| `src/domains/graph/impact.ts` | Schema, validation, disclaimers |
| `src/domains/graph/extract-impact.ts` | Extraction rules, scope and requirement phrases |
| `src/domains/graph/countries.ts` | 190+ countries with aliases and ambiguity handling |
| `tests/impact.test.ts` | 30 tests, including both regressions above |
