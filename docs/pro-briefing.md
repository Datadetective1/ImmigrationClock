# Pro Briefing

The first Pro release built on the Monitor. One page, `/briefing`, for a
signed-in Pro subscriber:

| Part | What it does | Built from |
|---|---|---|
| Feed | Followed or saved changes in three sections: **Coming up** (a stated effective date ahead), **Current** (published or took effect in the last 30 days) and **Historical research** (older, collapsed). Each card leads with what changed (the document's own summary), why it matches, its documented status and dates; evidence quotes, source and limitations are one tap away | `src/lib/pro/assess.ts` over the full event store and the synced watchlist |
| Urgency | Only from stated dates: "Takes effect in N days" is highlighted when a followed record is named (not merely mentioned) and takes effect within 30 days. Severity is shown as history ("recorded as major when published"), never as urgency. Proposals are never dated | `assessChange` |
| Relevance | Each match says where the document names the followed item: title, summary or structured data (named), issuing agency, topic (classifier), or only the body ("may be incidental", with the quote). Body-only matches never drive urgency, reminders or the calendar | `explainMatches` |
| Coming into effect | Stated effective dates ahead for primary (named, agency, topic or saved) matches; proposals excluded | `buildBriefing().timeline` |
| Saved research | Save any change from its page; download a brief of saved changes or the feed as Markdown or a printable page (browser "Save as PDF") | `src/lib/pro/export.ts` |
| Calendar feed | Private `.ics` URL with those effective dates; reset revokes old copies; re-checks the subscription on every fetch | `src/lib/pro/calendar.ts` |
| Alert settings | Daily or weekly (Monday) digest; every match or priority only (major, or effective within 30 days); reminders 7 days before a followed change's stated effective date | `src/lib/pro/prefs.ts`, `buildAlertBatch` options |
| Alert history | Every alert email Resend accepted, newest first, last 50 | `src/lib/pro/history.ts` |
| Erase | Removes saved changes, history and settings and revokes the calendar link; keeps the watchlist and subscription | `DELETE /api/pro/data` |

## What is stored, per subscriber (keyed by an HMAC of the email)

- `pro:prefs:<key>` — frequency, relevance, reminders on/off, calendar link version
- `pro:saved:<key>` — change ids and when they were saved
- `pro:history:<key>` — titles and links of alerts sent

No immigration status, case data, personal dates or free text. Notes on saved
items were left out on purpose: a free-text box on an immigration site is
where a case number ends up.

## Defaults keep production unchanged

With the flag off, every `/api/pro/*` route and `/briefing` answer 404, the
Save button never appears, and the alert job ignores preferences and writes no
history. With the flag on and no settings saved, a subscriber gets what they
get today: daily, every match, no reminders.

## Rollout

1. Merge. Nothing changes in production while `FEATURE_PRO_BRIEFING` is unset.
2. In Vercel, set `FEATURE_PRO_BRIEFING=true` for **Preview** only, open a
   preview deployment signed in as a Pro subscriber, and check: the feed lists
   followed changes; Save on a change page works; both brief downloads open;
   the calendar URL subscribes in a calendar app; Reset link makes the old URL
   404; Erase clears saved and history.
3. Set it for **Production** and redeploy. Re-check the same list once.
4. Only then add Briefing to `CAPABILITY_SPECS` in `src/lib/billing/plans.ts`
   so `/pricing` sells it.

## Known limits

- Effective dates and classifications come from automatic extraction; no record
  has been reviewed by a person yet, and every surface says so.
- The feed is a filter over recorded changes. Recall is not high enough on any
  dimension for an empty feed to mean nothing happened; the page says this.
- Before/after comparison of source documents is not possible yet: the source
  text store overwrites in place. Keeping prior versions is the next step.

## Intelligence: the landscape (`FEATURE_PRO_INTELLIGENCE`)

At the top of `/briefing`, one collapsed card per follow showing what the
archive holds for it (`src/lib/pro/landscape.ts`): final rules and executive
actions whose stated effective date has passed ("took effect", never "in
force"), stated dates ahead, proposals with no later amending record ("no final
rule in our archive", never "pending"), and a count of final rules with no
stated date. Only primary matches count. A "What this covers" note lists the
sources in the latest refresh, the ones that returned nothing, and the ones we
cannot ingest (Visa Bulletin, State Department). No AI is involved.
