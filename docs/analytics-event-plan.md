# Analytics Event Plan

**Directive basis (Part 4):** *"Measure what users search for. Which questions
remain unanswered. Which pages build trust. Which features increase return visits.
Do not optimize only for clicks. Optimize for successful understanding."*

That instruction sets the shape of this plan. The events are grouped by the
question they answer about **understanding**, not by position in a revenue funnel.

**Implementation:** `src/lib/analytics.ts` — a single typed `track()` entry point.
Adding an event means adding it to the `AnalyticsEvent` union first, so the
taxonomy cannot drift.

**Provider:** Plausible (cookieless). GA4 is optional and, if configured, is gated
behind consent. Do Not Track and Global Privacy Control are honoured for both.
With no provider configured every call is a silent no-op.

---

## Understanding — did the reader get an answer?

| Event | Trigger | Properties | Business question |
| --- | --- | --- | --- |
| `source_link_click` | Reader clicks a `SourceBadge` through to the agency | `source`, `surface` | **Is the trust layer working?** A reader who verifies a figure against the agency is the exact behaviour the Directive exists to produce. This is our primary trust metric. |
| `methodology_open` | Methodology note, provenance tooltip, or limitations block opened | `surface`, `provenance` | Do people check how a number was made — and does that differ for `modeled` vs `reported` figures? |
| `chart_interact` | Series, sector, or timeframe changed on a chart | `chart`, `control` | Are charts explored or just scrolled past? Unused controls are complexity we should remove. |
| `explainer_open` | FAQ or explainer expanded | `page`, `question` | Which questions do readers actually have on each page? Feeds the topic hubs. |
| `data_export` | CSV downloaded | `dataset`, `rows` | Who is doing their own analysis? Strong signal of researcher and journalist use, and a leading indicator for the API and professional tiers. |

## Unanswered — what should we build next?

The most valuable group. These are a direct, unfiltered list of gaps.

| Event | Trigger | Properties | Business question |
| --- | --- | --- | --- |
| `search_no_results` | A search returns nothing (debounced 900ms) | `term` | **What did someone come here for and not find?** Read this weekly; it is the roadmap input the Directive explicitly asks for. |
| `search_results` | A search returns something | `term`, `results` | What is the platform actually used to look up? Reveals which entity types deserve hub pages. |
| `coverage_gap_shown` | A disclosed gap is rendered (e.g. a state with no WARN feed) | `dataset`, `scope` | Which gaps do readers hit most? Prioritises which state feed to add next. |

## Return — is this becoming a habit?

| Event | Trigger | Properties | Business question |
| --- | --- | --- | --- |
| `newsletter_signup_started` | Reader focuses the email field | `surface` | Where does intent form? |
| `newsletter_signup_submitted` | Form submitted to the provider | `surface` | Real conversion. Never fired unless a provider actually received it. |
| `what_changed_view` | `/what-changed` viewed | `entry` | Is the daily entry point working? (Phase 2) |
| `topic_view` | Topic hub viewed | `topic` | Which subjects sustain attention? (Phase 3) |
| `entity_follow` | Reader follows a country/visa/employer/agency/topic | `entity_type`, `entity` | What do people want ongoing? Direct input to alerting. (Phase 4) |

## Editorial — does the social publication bring readers?

The social engine (docs/social.md) attributes every post it publishes: the
link it posts carries `utm_source`, `utm_medium=social`, `utm_campaign=<content
type>` and `utm_content=<story key>`, and the landing page fires one event on
arrival. Read together with the ledger's `contentType`, `structure` and
`storyKey` columns, this is what lets the eight content types — breaking
change, what changed, why it matters, effective date, key date, data signal,
explainer, data discovery — be compared for the readers they actually bring.
Nothing here optimises automatically; the point is to collect trustworthy data
first.

| Event | Trigger | Properties | Business question |
| --- | --- | --- | --- |
| `social_post_click` | A visit arrives from a social post (utm parameters present), once per story per session | `platform`, `content_type`, `story`, `path` | **Which kind of post brings readers?** Joined to the ledger on `story`. |
| `share_click` | Reader uses the share button on a record, explainer or signal page | `surface`, `story` | Which records do readers pass on? |
| `what_changed_view` | A change's own page is viewed (`entry: "story"`) | `entry`, `story`, `category` | Do story pages hold attention beyond the click? |

Plausible also records the UTM parameters on the pageview itself, so
`utm_campaign` (the content type) is available as a source breakdown without
any custom goal. The three events above need goals created in the Plausible
dashboard before they show in its Goals report.

## Professional — deliberately separate

Kept apart from the public funnel so public-mission metrics are never distorted by
commercial ones (Directive Part 5).

| Event | Trigger | Properties |
| --- | --- | --- |
| `intelligence_page_view` | `/intelligence` viewed | `referrer_surface` |
| `sample_report_view` | Sample report opened | `report` |
| `briefing_request_submitted` | Briefing request submitted | `org_type` |

## Commercial — `/resources` only

| Event | Trigger | Properties |
| --- | --- | --- |
| `partner_click` | A **commercial** partner card is clicked | `partner`, `placement` |

Cards marked `official` (free government/nonprofit resources) are **never**
tracked as commercial events, never carry a tracking parameter, and are never
`rel="sponsored"`.

---

## Privacy rules

These are constraints, not preferences.

1. **No personal data leaves the browser.** Ever.
2. **Search terms are the only free-text field.** They are lowercased, whitespace-collapsed, truncated to 60 characters, and **dropped entirely** if they contain an `@` or a run of 6+ digits — an accidentally pasted email or case number must never be recorded. See `sanitizeSearchTerm()`.
3. **No session recording, heatmaps, fingerprinting, or cross-site tracking.** The Directive forbids it and so does the privacy policy.
4. **DNT and GPC are honoured** for both providers, including cookieless Plausible.
5. **Source clicks record the agency, not a clickstream.** We want to know which agencies people verify against, not what any individual did.
6. **No provider configured ⇒ no network calls.** The default state of the platform is measuring nothing.

## What we deliberately do NOT measure

- Time on page as a success metric — it rewards confusion.
- Scroll depth — it rewards long pages, not clear ones.
- Individual user journeys.
- Anything that would make a "most viewed enforcement statistic" leaderboard tempting. The Directive is explicit: truth before traffic.

## Reading this weekly

1. **`search_no_results`** — the build-next list. Anything appearing repeatedly is a real gap.
2. **`source_link_click` rate per page** — a page with figures and no source clicks is one people are not scrutinising. That is either very high trust or very low engagement; check against return visits before concluding.
3. **`coverage_gap_shown` by scope** — which state feed to add next.
4. **`data_export`** — the leading indicator for professional demand.

## Founder setup

1. Create a Plausible site for the production domain.
2. Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` in Vercel (production only).
3. In Plausible, register the goal names listed in `PLAUSIBLE_NAME` (`src/lib/analytics.ts`).
4. Leave `NEXT_PUBLIC_GA_ID` empty unless GA4 is genuinely needed — setting it makes the site cookie-setting and brings back the consent banner.
