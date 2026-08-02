# Knowledge Graph Architecture

**Directive basis:** Part 3 ("Knowledge Graph"), Part 4 ("Event-Driven
Architecture"), Part 6 ("The true product is not pages. The true product is the
network of relationships between immigration entities").

**Status:** core built and tested. One adapter implemented (Federal Register).
Fifteen more registered and specified.

---

## The one decision everything else follows from

The Federal Register is **not** the design center. It is the first of sixteen
adapters, and the architecture was written so that adding the sixteenth requires
no schema change.

Concretely: every source — Federal Register, Executive Orders, Presidential
Proclamations, USCIS, State, the Visa Bulletin, CBP, ICE, Labor, Congress,
federal courts, state governments, WARN, H-1B employer data, PERM, and labour
statistics — implements the same `SourceAdapter` contract and emits the same
`ImmigrationEvent`. That is the difference between a knowledge graph and sixteen
parallel dashboards.

```
        ┌──────────────── SourceAdapter (one contract) ────────────────┐
        │  Federal Register · Executive Actions · USCIS · Visa Bulletin │
        │  Courts · Congress · CBP · ICE · DOL PERM/LCA · WARN · SEVIS  │
        │  State agencies · BLS · H-1B Data Hub · DOS statistics        │
        └───────────────────────────┬─────────────────────────────────┘
                                    │  emits
                          ┌─────────▼──────────┐
                          │ ImmigrationEvent   │  stable id, agency, dates,
                          │                    │  classification, severity,
                          └─────────┬──────────┘  source URL, verification
                                    │  typed edges
                          ┌─────────▼──────────┐
                          │   Entity graph     │  agency · visa · country ·
                          │                    │  state · employer · industry ·
                          │                    │  university · law · regulation ·
                          │                    │  executive_action · court_case ·
                          │                    │  legislation · policy · dataset ·
                          └─────────┬──────────┘  topic · person
                                    │  consumed by
     ┌──────────┬──────────┬────────┴────────┬──────────┬──────────────┐
  What Changed  Timelines  Entity pages   Alerts   Newsletter   API / AI
```

## Modules

| Module | Responsibility |
| --- | --- |
| `src/domains/graph/entities.ts` | The nodes. Stable `type:slug` ids, alias index, coverage map. |
| `src/domains/graph/events.ts` | The spine. `ImmigrationEvent`, classification, severity, validation. |
| `src/domains/graph/resolve.ts` | Text → entity edges. Shared by every adapter. |
| `src/domains/graph/adapters.ts` | The adapter contract and the full registry of sixteen sources. |
| `src/domains/graph/adapters/federal-register.ts` | First implementation. |

This is also the first module organised by **domain** rather than by page, per
Directive Part 4. It is greenfield, so it establishes that structure at zero
migration cost. Existing modules migrate as they are touched, not in a big-bang
refactor.

---

## Design decisions, and why

### Entity ids are source-independent
`country:india` means the same node whether it came from a Federal Register rule,
a State Department table, or a court decision. If ids were derived from a
source's internal keys, the graph would silently fork into one island per source
— which is exactly the "collection of dashboards" the Directive rejects.

### Explicit links and matched links are never conflated
Every edge records its `basis`:

- **`explicit`** — the source itself named the entity in a structured field. The
  Federal Register's `agencies[]` array gives us this. Confidence is always 1,
  and the validator enforces it.
- **`matched`** — we inferred it from text. Confidence is always below 1.

A reader must be able to tell "USCIS issued this" (a fact from the publisher)
from "this document appears to mention H-1B" (our inference). Collapsing them
would be a quiet form of the same failure as the fabricated WARN records.

### A wrong edge is worse than a missing one
The resolver is deliberately conservative: whole-word matching only, aliases
under three characters excluded, and an explicit `AMBIGUOUS_ALIASES` blocklist
("ICE", "TN", "asylum", "parole" — all of which appear constantly in ordinary
prose). Matches below `PUBLIC_CONFIDENCE_FLOOR` (0.75) are recorded for internal
review but never asserted publicly.

We accept losing recall. We do not accept losing precision — if a reader opens
the India page and finds an unrelated rule, we have misinformed them at scale.

### Severity is rule-based, never model-based and never engagement-based
`major` = in force or executive. `notable` = proposed. `routine` = everything
else, including the very large volume of Paperwork Reduction Act notices that
would otherwise flood the feed. The rules live in the adapter, in code, and are
covered by tests — auditable, not editorial.

### Proposed rules can never carry an effective date
`validateEvent()` rejects it. A proposed rule is not in force; giving it an
effective date would tell a reader something false about their legal obligations.
Every proposed rule also renders a mandatory limitation saying so.

### Scheduled publication is modelled, not hidden
The Federal Register places documents on public inspection days before their
official publication date. Live testing surfaced five such documents immediately.
Rather than discard them (they are real and citable) or show them as published
(false), events carry a `scheduled` flag; the validator requires it whenever
`publishedAt` is in the future, and caps that at 30 days.

### No language model touches the numbers or the facts
Every field is copied verbatim from the government document or derived by an
explicit rule. Where an abstract does not exist, the event says so rather than
inventing prose — the same discipline applied when the synthetic layoff records
were removed. `reviewStatus: "draft"` exists for future LLM-assisted summaries,
and drafts never render publicly.

### Failure is contained
An adapter returns `{ failed, warnings }` and never throws. One broken source
cannot take down an ingestion run — the same resilience the WARN pipeline
already has.

---

## Verified against the live API

Run against the Federal Register on 2026-08-01, `since: 2026-06-01`:

- 40 documents fetched from tracked agencies → **12 immigration-relevant events**
  (28 correctly filtered out as customs, labour, or unrelated).
- **0 validation errors.**
- Classification: 2 final rules, 2 proposed rules, 8 announcements.
- Severity: 2 major, 2 notable, 8 routine.
- Correctly identified *"Visas: Visa Bond Program"* (State, final rule, effective
  2026-08-03) as major, flagged as scheduled for publication.
- Correctly gave both proposed rules `effectiveAt: null` plus the "not in force"
  limitation.
- The J-1 exchange-visitor proposal correctly resolved `agency:dos` (explicit),
  `topic:international-students`, and `visa:j-1` (matched).

Two defects were found by this run and fixed:
1. Future publication dates failed validation → `scheduled` modelling added.
2. `"petition"` as a topic keyword mis-categorised *"Petitions for Rulemaking"* as
   employer sponsorship → removed in favour of specific phrases.

---

## Adapter roadmap

Ordered by whether the source produces genuine **change** (the flagship feature)
rather than periodic statistics.

| Adapter | Status | Note |
| --- | --- | --- |
| Federal Register | **ready** | Implemented and verified. |
| Executive Orders / Proclamations | planned | Same API, different document-type filter and severity rules. Cheapest next win. |
| USCIS newsroom & policy alerts | planned | Stable RSS. |
| Federal courts | planned | CourtListener API. Needs tight relevance filtering. |
| Congress | planned | Congress.gov API. Introduction ≠ change; severity rules must reflect that. |
| DOL PERM | planned | Quarterly bulk files. Unlocks real employer intelligence. |
| DOL LCA | planned | Would replace today's *modeled* wage figures with real ones. |
| SEVIS / SEVP | planned | Unlocks the `university` entity type. |
| State agencies | planned | No national feed; per-state effort. Least tractable. |
| WARN, H-1B Data Hub, CBP, BLS | **live** | Already ingested; emit events once the store is wired. |
| Visa Bulletin | blocked | HTML tables, no API. Consequential enough to need verification before trust. |
| ICE detention | blocked | XLSX with drifting layouts. |
| DOS visa statistics | blocked | PDF only. Hand-transcribed today. |

Blocked adapters are documented with their reason and shown publicly. We would
rather state a gap than parse an unstable source blindly and publish the result.

---

## Next in Phase 2

1. **Event store** — build-time generation into `src/lib/generated/events.json`,
   with the same last-good resilience as the WARN pipeline.
2. **Executive Orders adapter** — reuses the Federal Register transport.
3. **`/what-changed`** — the public route, plus
   `docs/change-detection-methodology.md`.
4. **Entity pages read the graph** — employer, country, visa, and agency pages
   gain a "related events" section, which is the first place the graph becomes
   visible to a reader.
5. **Homepage restructure** — only once there is a real feed to lead with.
