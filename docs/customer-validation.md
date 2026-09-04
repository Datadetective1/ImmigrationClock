# Customer validation: who to talk to first, and what to ask

Written 2026-09-04. **Nothing here has been sent to anyone.** These are drafts
for the founder to use, edit or discard.

Everything below is a hypothesis. Where I am guessing, I say so — a validation
plan that presents its assumptions as findings is a plan that cannot learn
anything.

---

## The ideal first customer

**A mid-size US immigration law firm, roughly 15–60 people, with a
knowledge-management or operations person whose job already includes watching
for policy changes.**

Why that shape, and why I believe it:

- **Somebody is already doing this job manually.** That is the strongest signal
  in any first-customer search. You are not creating a behaviour; you are
  replacing a spreadsheet, a Federal Register email digest, and somebody's
  Monday morning.
- **Big enough to have the role, small enough to decide quickly.** Under ~15
  people the partner does it themselves between client work and will not pay
  for it. Over ~100 they have a vendor relationship, a procurement process and
  possibly an internal tool.
- **The failure mode is expensive and legible.** Missing an effective date is a
  malpractice-adjacent problem, not an inconvenience. That is a budget line.
- **They can evaluate the product without integrating anything.** `/monitor` is
  free and needs no account, so a first conversation can end with "look at this
  and tell me if it is wrong" rather than a pilot agreement.

**The second-best shape, and possibly the better business:** an immigration
technology or global mobility *vendor* — a case-preparation platform, a filing
platform, a mobility management product. One integration reaches all of their
customers, the API already exists, and they have engineers who can evaluate it
in an afternoon. The reason it is second for a *first* conversation is that
their sales cycle is longer and they will ask about SLAs, uptime and a roadmap
that does not exist yet.

**Where I am least confident:** whether firms of this size buy tools at all, or
whether their budget only moves for practice-management software. That is
question 8 below and it is the one that could invalidate the whole hypothesis.

## Buyer roles — hypotheses, not findings

| Role | Why they might care | Why they might not |
|---|---|---|
| Knowledge-management lead / professional support lawyer | This is literally their remit. Most likely to feel the pain daily. | May not control budget; may see a tool as a threat to their value |
| Immigration operations / practice manager | Owns "did we miss anything" risk and process | May treat it as a lawyer's problem |
| Managing partner / practice group head | Signs the cheque; feels the malpractice risk | Too far from the daily work to feel the pain |
| Global mobility leader (corporate, not firm) | Responsible for a population of employees across visa types | Often outsources monitoring to their law firm |
| Product leader at an immigration software vendor | Wants differentiating content without building a data team | Will ask about reliability guarantees that do not exist yet |

I would start with the **knowledge-management lead or operations manager**, and
ask them who else would need to be in the room. Do not start with the managing
partner: they will delegate the evaluation to exactly the person you skipped.

## The problem interview

Eight questions. **Do not pitch.** The goal is to learn whether this job exists,
who does it, what it costs, and what happens when it goes wrong. If you find
yourself explaining ImmigrationClock in the first twenty minutes, the interview
has failed.

1. **Walk me through how you found out about the last immigration rule change
   that actually affected your work.** (Start concrete and backwards-looking.
   You learn the real channel, not the idealised one.)

2. **Who on the team is responsible for noticing that something changed? Is that
   written down anywhere, or is it just understood?** (Finds the buyer, and
   whether the role is formal enough to have a budget.)

3. **Which sources do you actually watch — and which do you subscribe to but
   never read?** (The gap between the two is the product opportunity. Everyone
   subscribes to more than they read.)

4. **When something changes, how does it get from the person who noticed it to
   the people preparing cases?** (This is the workflow ImmigrationClock would
   sit beside. If the answer is "Slack" or "a Friday email", that is the shape
   of the integration.)

5. **Roughly how much time a week goes into this, across everyone?** (Do not ask
   "how much is it worth". Ask for the input; you can price the output.)

6. **Has anything ever been missed, or caught late? What happened?** (The single
   most important question. If they cannot think of an example, either the pain
   is not real or they do not know what they missed — and the second is worth
   probing.)

7. **How do you decide whether a change is relevant to your caseload?** (Tells
   you which dimensions matter — visa, form, country, process — and whether the
   classification model matches how they actually think.)

8. **If you were going to pay for something to help with this, what would it
   have to do — and who would have to approve it?** (Willingness to pay AND the
   buying process, without asking "would you pay $19".)

**What to listen for:** a named person doing this weekly, a specific miss with a
consequence, and an existing tool they pay for. Two of those three and the
hypothesis is alive.

**What would falsify it:** "our AILA membership covers this", "our associates
just read the Federal Register", or an inability to name a single instance where
a missed change caused a problem.

## Outreach drafts

Not sent. Edit freely — they should sound like the founder, not like this.

### LinkedIn message (short, no pitch)

> Hi [Name] — I'm building a small tool that tracks U.S. immigration changes
> from the Federal Register and USCIS and links each one to the visas, forms and
> countries it actually names, with the source quote attached.
>
> Before I build any more of it, I'm trying to understand how firms like
> [Firm] actually keep up today. Would you be open to 15 minutes? I'm not
> selling anything — I genuinely want to know whether this is a real problem or
> one I invented.

### Cold email

> **Subject:** How does [Firm] keep up with USCIS changes?
>
> Hi [Name],
>
> I'm [Founder], and I built ImmigrationClock — it reads the Federal Register,
> USCIS newsroom and the Policy Manual daily and records each change with its
> source, its effective date, and the visas, forms and countries the document
> itself names. Every classification carries the quote it came from, so you can
> check it rather than trust it.
>
> It's free and public: immigrationclock.com/monitor
>
> I'm not writing to sell you anything. I'm trying to find out whether the
> problem I think I'm solving is one you actually have. Specifically: who at
> [Firm] is responsible for noticing when something changes, and how does that
> reach the people preparing cases?
>
> If you have 15 minutes in the next couple of weeks I'd value your view — and
> I'd be glad to hear that I've got it wrong, which is genuinely useful too.
>
> [Founder]

### Follow-up, one week later

> Hi [Name] — just floating this back up in case it got buried.
>
> If a call isn't useful, one line would still help me a lot: is keeping up with
> immigration changes something anyone at [Firm] actively works at, or does it
> mostly take care of itself?
>
> Either answer is useful. Thanks either way.

### Discovery-call request (when they've replied warmly)

> Thanks [Name]. 15 minutes, whenever suits — here's my calendar: [link]
>
> To be clear about what it is: I'll ask how you keep up today, what's gone
> wrong, and how information reaches your case teams. I won't demo anything
> unless you ask. If you'd rather just look first, it's at
> immigrationclock.com/monitor — no account, nothing to sign up for.

## What to show, if they ask

**Show `/monitor`.** Pick their practice area's visa and form, and let the page
do the work. The thing to point at is not the list — it is the evidence quote
under each item, and the fact that the page tells them what it cannot see.

**Say the honest thing early.** Precision is 93–100% depending on dimension;
recall is 58–83%; no record has been reviewed by a person; there is no push
alert yet. Saying that first is the strongest possible move with this buyer,
because they will find it out anyway and everything else you said gets re-rated
when they do.

## What not to do

- Do not promise alerts. Email alerts are not built.
- Do not claim completeness. Recall is not high enough for that word.
- Do not name a customer or an integration. There are none.
- Do not present $19/month as validated. It is a hypothesis and this document
  exists to test it.
- Do not paywall anything that is free today to make Pro look better.
