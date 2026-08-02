# LLM Council — ImmigrationClock, the 10-stage company sequence

**Date:** 2026-08-01
**Counciled:** Whether to run ImmigrationClock through a 10-stage company-building sequence (Problem → Mission → Principles → Never-Dos → Moat → Roadmap → Product → Brand → Culture → Founder Book), and what to actually do at each stage.

---

## The original question

> Every company I build would go through the same stages:
> 1. The Problem — Why must this company exist?
> 2. The Mission — What future are we trying to create?
> 3. The Principles — What beliefs guide every decision?
> 4. The Things We'll Never Do — The lines we won't cross.
> 5. The Competitive Moat — Why can't competitors easily copy us?
> 6. The Roadmap — How the vision expands over the next decade.
> 7. The Product — Only now do we design the software.
> 8. The Brand — Name, identity, messaging, and story.
> 9. The Culture — How the team operates.
> 10. The Founder Book — A lasting document that keeps the company aligned.
>
> Please go through the questionnaire and advise on what I should do.

## The framed question (given to all five advisors)

A solo founder has built ImmigrationClock (immigrationclock.com) — a free, static, mobile-first U.S. immigration data dashboard modeled on usdebtclock.org. It's live, built in roughly two months of solo work, currently ~zero revenue and low traffic. It displays sourced U.S. government numbers (USCIS, ICE, CBP, State Dept, BLS) on enforcement, removals, detention, border encounters, H-1B approvals/denials across 2,600+ sponsors, F-1 visas, WARN layoffs, and wages — every figure labelled "reported / projected / estimated," with a public methodology page. Some fine-grained state/country splits are openly labelled as modeled estimates derived from real totals.

Positioning is deliberately neutral ("Facts first. Freshness labelled. Sources included."), and the site explicitly refuses to assert causation between immigration and layoffs, avoids inflammatory framing, and shows no individual-level data.

Monetization is fully built but switched OFF: contextual affiliate partner modules (Wise, Remitly, Sprintax, Boundless, immigration-lawyer lead-gen, Airalo, WES, insurance), AdSense slots, a weekly "Immigration Pulse" newsletter, and a tip jar. A free public WARN-layoffs API was just shipped. Tech: Next.js static export on Vercel free tier, GitHub Action refreshes data daily, near-zero operating cost.

The founder wants to run this through the 10-stage sequence above and asks what to actually DO at each stage.

What's at stake: the difference between a portfolio site earning $40/month in affiliate change and a real company. Also at stake: a solo founder with scarce time is about to spend it on a doctrine-writing exercise before having any proof that anyone wants this.

---

## Advisor responses

### The Contrarian (anonymized as Response B)

**The modeled estimates are a loaded gun pointed at the only asset you have.**

You built a trust brand and then filled it with numbers you invented. "Openly labelled" doesn't survive a screenshot. The first time a state-level "estimated removals" figure gets quoted in a political fight and someone traces it back to your interpolation, "Facts first" becomes the headline of your obituary. TRAC Syracuse spent 30 years and actual FOIA litigation earning the credibility you're synthesizing in a GitHub Action. Kill every derived split or move it behind a separate, uglier label. This is stage 4 and it's the only stage that matters right now.

**The moat question answers itself: there is none.** Public data, public methodology, static site, near-zero cost. Any competent dev clones this in a weekend. Your daily refresh is a cron job, not a defense. And the usdebtclock analogy is broken — the debt is one number nobody disputes. Immigration numbers are contested by construction, so "neutral" means both audiences pass you over for a source that flatters them. That's not a positioning virtue, it's why traffic is low.

**Monetization is off because turning it on would produce a number you don't want to see.** The doctrine exercise is the same avoidance in a nicer outfit. A Founder Book for a company of one is a diary.

**Also unexamined:** immigration-lawyer lead-gen has bar-referral and UPL exposure in several states — that's a legal review, not an affiliate signup. And monetizing anxiety (Remitly, Boundless, lawyers) while claiming neutrality is a contradiction your critics will find before you do.

**Do this instead of stages 1–10:** switch everything on for 30 days. Then email twenty immigration law firms and relocation vendors offering the H-1B sponsor dataset as a paid feed. If nobody pays, the doctrine was never the bottleneck.

### The First Principles Thinker (anonymized as Response D)

You're asking "how do I turn my site into a company." Wrong question. The right one: **what do I own that nobody else can regenerate?**

Strip it down. A dashboard of public government numbers is not an asset — anyone with a scraper and two months can rebuild it. The mission statement won't stop them. The moat you actually have is sitting in `data_pipeline/` and your `chore(data): refresh snapshot + archive` commits: **point-in-time captures of federal data that gets silently revised, retroactively restated, and deleted.** USCIS pulls quarterly reports. ICE changes definitions mid-year. Nobody can go back and recreate what the numbers said on a Tuesday in March. You can, from day one, forever. That compounds whether or not a single person visits the site.

So the honest reframe of your ten stages: stages 1–6 are not inputs, they're *outputs*. You cannot know why the company must exist before you know who bleeds without it. Writing doctrine now is autobiography, not strategy.

Second reframe: the site is not the product, it's the demo. The affiliate stack assumes your visitor is the customer. Your visitor is an anxious visa holder worth $0.40 a session — that's why it structurally caps at $40/month. The people who pay for immigration data are law firms, corporate mobility teams, policy shops, and funds trading labor-market signals. You already shipped a free WARN API — that's the real business leaking out sideways.

Do this instead of stage 1: email 30 immigration attorneys and mobility leads. Ask what number they had to reconstruct by hand last quarter. If three say the same thing, *that's* your problem statement — and it will be narrower and stranger than anything you'd have written from a blank page.

Also: kill the modeled state/country splits before selling to institutions. Estimates are fine for a public dashboard, fatal for a data product.

### The Expansionist (anonymized as Response A)

The WARN API is the company. The dashboard is the demo.

You shipped a free public API for multi-state layoff data and buried it as a feature. Layoff data is bought today by recruiters, PE diligence teams, commercial real estate analysts, journalists, and short sellers — none of whom care about immigration. Cross-referenced with 2,600 H-1B sponsors, you have something nobody has: a company-level signal of which employers are both laying off and sponsoring. That's an alert product with a real buyer.

What that does to the ten stages: collapse 1–6 into one weekend. They're a positioning exercise, not a discovery exercise, and your positioning is already correct. Neutrality plus labelled methodology is a licensable asset — it's why a newsroom can cite you and a compliance team can cite you. Write it once, cheaply.

Then spend the recovered time on the three expansions hiding in what you already built:

**Data-as-product.** Free tier stays free forever (that's the moat and the top of funnel). Paid tier is history, webhooks, bulk export, SLA. $99–499/month, sold to ten customers, beats every affiliate module combined.

**B2B mirror.** Same data, inverted audience. "Which of my competitors sponsor H-1Bs, at what wage, with what denial rate" is a sales-intel query. Immigration law firms will pay for sponsor-level denial benchmarking they currently reconstruct by hand.

**Embeddable widgets.** Give away branded charts that news sites and university international-student offices paste into pages. Every embed is a backlink and a permanent traffic source. This is how usdebtclock became a reference.

Turn monetization on now — not for the $40, but because live conversion data is the only input that makes stages 7–10 worth writing.

### The Outsider (anonymized as Response E)

**I have no idea what this is for, and that's the whole problem.**

"The Immigration Clock. Facts first. Freshness labelled. Sources included." That's not a promise to me — it's a description of your internal hygiene. Nobody has ever gone to bed wanting labelled freshness. usdebtclock.org works because everyone already carries the anxiety ("we owe *how much*?"). "Immigration" isn't one number. I don't know what I'm supposed to feel when the counters spin, and I don't know what I'm supposed to do next.

Second: I don't know who I am on this site. The homepage offers me Enforcement, Work & Visas, Jobs & Wages, Insights, Pulse, Resources — six doors, no signal about which one is mine. An H-1B holder, a journalist, an anxious American, and an immigration lawyer are four different products. You built one thing wearing four hats.

The one place I actually leaned forward: **layoffs-vs-h1b**. "Did my employer lay people off while sponsoring visas?" is a question a real human already has, in their own words, before they meet you. That's not a chart — that's a search someone types at 11pm. Everything else on the site is a chart.

Also, as a stranger: "modeled estimates derived from real totals" reads as *you made the number up*. Your honesty labelling is admirable and it will be quoted against you.

**What to do:** skip stages 1–6. Send the site to 20 strangers, watch them for 90 seconds, and write down the first question each one asks out loud. If the same question appears five times, you have a company. Your doctrine is currently a constitution for a country with no citizens.

### The Executor (anonymized as Response C)

Stages 1–6 and 8–10 are a weekend of writing that produces zero evidence. Do them later, in an afternoon, once you know who shows up. Here's what Monday actually looks like.

**Monday:** Turn monetization ON. All of it. Not to make money — to measure intent. Affiliate clicks are the cheapest demand signal you'll ever get. Zero traffic × zero monetization = zero information. Zero traffic × live modules = a click-through rate you can reason about.

**Tuesday:** Install Plausible (free tier or $9). You cannot say "low traffic" as a strategy input until you know which three pages get 90% of it. Bet: the H-1B sponsor pages, not the homepage. If so, that's your product, and the clock is the marketing.

**Wednesday:** Ship the newsletter signup above the fold on those three pages only. One question in the confirmation email: "What were you trying to find out?" Fifty replies beats a founder book.

**Thursday:** Post the free WARN API to Hacker News, r/h1b, r/immigration, and email ten immigration reporters with a link and a one-line "here's a dataset nobody else publishes daily." That API is your only genuinely defensible asset — moat (stage 5) is a distribution question, not a doc.

**Friday:** Write down one number — pick H-1B sponsor page sessions/week — and a target for 90 days.

The dangerous part of the ten-stage sequence is stage 4. "The Things We'll Never Do" written before revenue becomes a pre-commitment against every business model you haven't tried yet. Write it after you know what tempts you.

Do the doctrine at stage 90 days, with data in hand. It'll be right instead of aspirational.

---

## Peer review round

**Anonymization mapping:** A = The Expansionist · B = The Contrarian · C = The Executor · D = The First Principles Thinker · E = The Outsider

### Review 1

**1. Strongest: D.** It's the only one that names a genuinely non-regenerable asset — the point-in-time archive of federal data that gets silently revised and deleted. That's a real answer to stage 5, where B says "there is none" and A hand-waves "free tier is the moat." D also reframes stages 1–6 as outputs rather than inputs, and its action (ask 30 attorneys what number they rebuilt by hand) generates the problem statement instead of assuming it. A is a close second but asserts buyers exist without proposing to verify.

**2. Biggest blind spot: E.** Its prescribed test — 20 strangers, 90 seconds — samples exactly the audience D and A correctly identify as worth $0.40 a session. E would discover a better consumer funnel and miss the business entirely. It also never registers that a public API exists.

**3. All five missed:**
- **Founder risk in a politically charged domain.** A solo, named person publishing contested enforcement numbers gets adopted or attacked by one side. Nobody discussed pseudonymity, an entity, or takedown/harassment exposure.
- **Naming employers** who lay off while sponsoring — the most commercial feature — carries defamation and source-ToS exposure beyond B's UPL point.
- **Runway.** Nobody asked whether this is full-time or nights. It determines every recommendation.

### Review 2 (regulated-data-business lens)

**1. Strongest: D.** It's the only response that names an asset that's actually non-regenerable and already accruing: the daily point-in-time snapshots of federal data that gets silently revised and deleted. A, C, and E all correctly say "stop writing doctrine," but only D identifies something that compounds without traffic. Its 30-attorney call is the same test as C's, aimed at people with budgets.

**2. Biggest blind spot: A.** It asserts a $99–499/mo data business exists without a single conversation, calls neutrality "licensable" with zero licensees, and — fatally — never addresses the modeled estimates that B and D both flag. You cannot sell to compliance and diligence teams while shipping interpolated state splits. A is selling the institutional tier that its own product currently disqualifies itself from.

**3. All five missed:** the regulated-business basics. No one asks whether there's an LLC — a solo founder personally publishing contested immigration figures under a real name, in this climate, is exposed on personal assets. No one mentions E&O insurance, state WARN redistribution terms, or an ICE/USCIS-adjacent takedown scenario. And no one flags that a paid SLA tier converts a zero-cost hobby into a permanent one-person on-call obligation the first time USCIS changes a schema at 2am.

### Review 3 (consumer-content + B2B-data go-to-market lens)

**1. Strongest: D.** It's the only one that names an asset that actually compounds — point-in-time snapshots of federal data that gets silently revised or deleted. That's a real moat claim, unlike C's "distribution" or A's "free tier." D also correctly inverts the sequence (stages 1–6 are outputs, not inputs) and pairs it with one falsifiable action: 30 attorney emails. E is the best-written and the most honest about the site itself, but stops at diagnosis.

**2. Biggest blind spot: A.** It asserts a $99–499/mo layoff-data buyer without checking that Layoffs.fyi, state WARN portals, Revelio and Live Data already serve that market — mostly free or far better funded. And A alone waves off the modeled-estimate problem ("positioning is already correct"), which is precisely what disqualifies you from the institutional buyers A wants to sell to. B and D got that right.

**3. All five missed two things.** First: low traffic has a cause. 2,600 sponsor pages is a programmatic-SEO asset that needs months to index and backlinks to rank — nobody diagnosed why it isn't working. Second: a solo founder is a procurement blocker. Legal and mobility teams won't buy a feed with bus-factor one. Both A, B and D's paid-feed plans assume this away.

### Review 4 (audience + distribution lens)

**1. Strongest: A.** It's the only response that names a distribution mechanism rather than a research task. Embeddable widgets → backlinks → permanent referral traffic is precisely how usdebtclock became a citation default, and A correctly identifies that the free tier *is* the top of funnel, not lost revenue. C is the best-sequenced week, but it optimizes measurement of traffic that doesn't exist yet; A creates the traffic.

**2. Biggest blind spot: B.** It declares "there is no moat" while missing that the moat in reference data is never the code — it's being the URL people cite. Clonability is irrelevant if you own the citation graph. B also treats neutrality as a traffic liability when neutrality is the exact property that makes a newsroom, a court filing, or a Wikipedia editor link to you rather than to a partisan source. And its own prescription (switch everything on) contradicts its trust argument two paragraphs earlier.

**3. All five missed discovery.** Nobody mentioned search: "Does [Company] sponsor H-1B?" is a real long-tail query across 2,600 sponsors — that's 2,600 pages of intent traffic, already built. Nobody mentioned seasonality (March lottery, OPT cycles) as a launch calendar. Nobody mentioned attribution terms on the free API, so every redistribution earns a link. And nobody mentioned AI answer engines — labelled, sourced data is what they cite.

### Review 5 (founder psychology + executability lens)

**1. Strongest: C.** It's the only one calibrated to a single person's week. Day-by-day, reversible, each step generates evidence for the next. Its stage-4 point is the sharpest psychological read in the set: "Never Do" written pre-revenue is a pre-commitment against untested models. D has the best single insight — the point-in-time archive (the repo really does commit `refresh snapshot + archive` daily; that data is genuinely unrecreatable) — but D's advice terminates in "email 30 attorneys," which is a wish, not a plan.

**2. Biggest blind spot: B.** It diagnoses avoidance, then prescribes three hard things at once (kill estimates, monetize everything, cold-sell) with no ordering and no branch if the test fails. It also declares no moat while missing the archive D found. Correct on UPL exposure; wrong that shame is a sequencing tool.

**3. All five missed two things.** (a) *Where do the 20 emails come from?* A, B, C, D, E all end in outreach to strangers by a founder with no list and no name. Nobody specified the channel. (b) *On-call.* Multi-state WARN scrapers break weekly; a paid SLA converts a zero-cost hobby into an obligation one person carries alone. That, not doctrine, is the portfolio-to-company threshold.

**Peer-review tally:** D strongest ×3, A ×1, C ×1. Biggest blind spot: A ×2, B ×2, E ×1.

---

## Chairman's synthesis

### Where the council agrees

**1. Do not write stages 1–6 now.** Four of five advisors said it independently, and no reviewer defended writing them first. The phrasings converged: doctrine before evidence is "autobiography, not strategy" (First Principles), "a constitution for a country with no citizens" (Outsider), "a diary" (Contrarian). The sequence isn't wrong — the *ordering assumption* is. Stages 1–6 are outputs of contact with a market, not inputs to it.

**2. Your visitor is not your customer.** Unanimous where it came up. An anxious visa holder is worth cents per session; that is the arithmetic that caps the affiliate stack near $40/month regardless of execution. The people with budgets are immigration law firms, corporate mobility teams, recruiters, PE/diligence, newsrooms, and policy shops.

**3. The modeled state/country splits are a liability, not a feature.** Three advisors flagged it; two reviewers escalated it. Honest labelling protects you ethically and not at all reputationally — a screenshot strips the label. And it is specifically disqualifying for the institutional buyer everyone wants you to pursue.

**4. The WARN API + H-1B sponsor cross-reference is the most commercially interesting thing you own, and you buried it as a footer link.** Both the Expansionist and the Executor called it the only genuinely defensible surface.

**5. Turn analytics and monetization on now — as instrumentation, not income.** You cannot reason about a funnel you refuse to measure.

### Where the council clashes

**Neutrality: moat or millstone?**
The Contrarian argues immigration numbers are contested by construction, so neutrality means both audiences pass you over for a source that flatters them — and that's *why* traffic is low. Reviewer 4 hit back hard: in reference data the moat is never the code, it's being the URL people cite, and neutrality is precisely what lets a newsroom, a court filing, or a Wikipedia editor link to you instead of a partisan source.

Both are right about different phases. Neutrality is a **poor acquisition strategy and an excellent retention-and-citation strategy**. It will not win you your first thousand visitors — nothing about "labelled freshness" makes anyone click. It is what makes visitor number ten thousand cite you. Don't abandon it; stop expecting it to do a job it can't do.

**Is there a moat at all?**
Contrarian: none — a weekend clone. First Principles: the point-in-time archive of federal data that gets silently revised and deleted. Expansionist: the free tier plus embeds. Three of five reviewers sided with the archive, and it's the only claim that compounds whether or not anyone visits.

**Consumer or B2B?**
The Outsider found the single moment a human leans forward — *"did my employer lay people off while sponsoring visas?"* — and it's a consumer 11pm search. First Principles and Expansionist say consumers don't pay. Reviewer 1 correctly noted the Outsider's 20-strangers test would sample exactly the audience that can't fund the business. Resolution: **consumer is the traffic engine, B2B is the revenue.** The failure mode is not choosing one; it's confusing which is which.

**Pace.**
The Contrarian prescribes three hard things at once with no ordering. The Executor gives a day-by-day week. Reviewer 5, judging purely on what one person can actually execute, sided with the Executor. So does the chair.

### Blind spots the council caught

Only in peer review, and several are serious:

- **You have no corporate entity, and nobody mentioned it.** A solo founder publishing contested immigration figures under their own name, in this political climate, is exposed on personal assets. LLC + E&O insurance is not stage-4 philosophy, it's Tuesday.
- **Naming employers who lay off while sponsoring** — the most commercially interesting feature you have — carries defamation and source-ToS exposure well beyond the lawyer-lead-gen UPL problem.
- **Bus-factor one is a procurement blocker.** Legal and mobility teams will not buy a data feed from a single person with no SLA. Every paid-feed plan in this council assumed that away.
- **A paid SLA converts a zero-cost hobby into permanent solo on-call.** Multi-state WARN scrapers break constantly. That obligation, not doctrine, is the real portfolio→company threshold.
- **Nobody diagnosed why traffic is low.** 2,600 programmatic pages need indexation, backlinks, and months. That's a measurable, fixable distribution problem being misread as a strategy problem.
- **The distribution channel was never specified.** Every advisor ended in "email 20–30 strangers" without saying where a founder with no list and no name gets them.
- **Seasonality is a free launch calendar** — March H-1B lottery, OPT cycles, tax season — and nobody used it.
- **AI answer engines cite labelled, sourced data.** That's an emerging distribution surface your methodology discipline is unusually well-suited for.

### The recommendation

**Run the sequence — but not in that order, and not this month.** The framework is sound as a *founder's operating discipline*; it is unsound as a *discovery process*. Stages 1, 2, 5, and 6 are answers you don't have yet. Writing them now guarantees you'll write them from imagination and then defend them for a year.

Here is the reordering the chair recommends, with the actual instruction at each stage:

**Do now, this week (2 hours, not 2 days):**
- **Stage 5 — Moat.** Not an essay. An engineering act: your daily `refresh snapshot + archive` commits are the only asset nobody can regenerate. Federal immigration data gets silently revised and pulled. Make that archive explicit, immutable, and dated — a first-class product surface with its own page, not a build artifact. That is the answer to stage 5, and you already own it.
- **Stage 4 — Never Do, partial only.** Write only the three lines that are legal-and-integrity floors, not strategy pre-commitments: (a) no individual-level data, ever; (b) no unlabelled derived numbers — quarantine or kill the modeled state/country splits before any institutional conversation; (c) no partner whose interest conflicts with the data's neutrality. Leave the rest blank. The Executor's read is right: a full Never-Do list written pre-revenue is a pre-commitment against every model you haven't tried.
- **Form the LLC.** This is the entry the council forgot and the reviewers caught.

**Do over the next 90 days (this is the real work):**
- **Stage 7 — Product, first.** Yes, out of order. Instrument everything, then follow the traffic. Elevate the WARN API and `layoffs-vs-h1b` from footer links to front doors — those are the only two surfaces anyone in this council leaned toward.
- **Stage 1 — Problem, derived not declared.** Interview 30 immigration attorneys and corporate mobility leads with one question: *what number did you reconstruct by hand last quarter?* Get the list from state bar immigration-section directories, AILA chapter pages, and LinkedIn mobility titles — that's the channel every advisor left unspecified. When three say the same thing, you have a problem statement narrower and stranger than anything you'd write from a blank page.
- **Stage 8 — Brand, one sentence only.** The Outsider's critique is the single most actionable line in this transcript: "Facts first. Freshness labelled." describes your internal hygiene, not a promise to anyone. Replace it with the sentence a real person would type at 11pm. You already know what it is — it's on your `/layoffs-vs-h1b` page.

**Do after evidence, at ~90 days:**
Stages 2 (Mission), 3 (Principles), 6 (Roadmap), and the rest of 4. They'll be right instead of aspirational.

**Do differently or not at all:**
- **Stage 9 — Culture.** You have no team. Culture for one person is procrastination in a suit. Replace it with a one-page *contractor brief* for the first person you'll pay.
- **Stage 10 — Founder Book.** Don't write a book. Start a dated running log now — decisions, why, what you expected, what happened. The Founder Book is what that log becomes in year three. Written today it's fiction; written as an append-only log it's the most valuable document you'll own.

The chair sides with the **First Principles Thinker** on what the asset is, the **Executor** on sequencing, and takes the **Expansionist's** embeddable widgets as the distribution mechanism nobody else supplied. The chair explicitly rejects the **Contrarian's** "there is no moat" — clonability is irrelevant if you own the citation graph — while accepting every one of its legal warnings. And the chair rejects the **Outsider's** 20-strangers test as the *primary* instrument, because it samples the audience that cannot fund the company — but its brand critique stands as the sharpest single observation in the session.

### The one thing to do first

**Open Google Search Console and your analytics and answer one question: how many of the 2,600 sponsor pages are actually indexed, and what queries are they getting impressions for?**

You already wired GA4 and added the Search Console verification tag — the data may already be sitting there. This is a 30-minute task, and it decides everything that follows. If those pages are indexed and getting impressions, you have a *conversion* problem and the Executor's week is exactly right. If they aren't indexed at all, every strategic question in this council is premature and you have one job: distribution. Nobody on the council could tell you which, because nobody looked. Look.

---

*Council convened 2026-08-01. Five advisors, one anonymized peer-review round, chairman synthesis. Methodology by Andrej Karpathy.*
