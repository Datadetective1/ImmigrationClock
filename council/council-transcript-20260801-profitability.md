# LLM Council — ImmigrationClock: the path to profit

**Date:** 2026-08-01 (session 2)
**Counciled:** Given the current state of ImmigrationClock, how do I turn it into a profitable business?
**Prior session:** `council-transcript-20260801.md` (the 10-stage company sequence)

---

## The original question

> Given the current state of ImmigrationClock, how do I turn it into a profitable business?

## The framed question (given to all five advisors)

**Current state.** Solo founder. ImmigrationClock (immigrationclock.com) is live: a free, static, mobile-first U.S. immigration + workforce data dashboard modeled on usdebtclock.org. Built in ~2 months solo. Next.js static export on Vercel free tier, GitHub Action refreshes data daily, near-zero operating cost. Roughly zero revenue and low traffic today.

**What exists:**
- ~40 route types including 2,600+ programmatic H-1B employer/sponsor pages, plus state, country, salary-by-job-title, and top-sponsor pages
- An animated visa-origin map, a "Key Dates" countdown (H-1B lottery, tax day, OPT, DV lottery), a `/for-you` persona switcher, `/layoffs-vs-h1b`, an Insights section, a policy Timeline, a search page
- A weekly "Immigration Pulse" newsletter (auto-generated, not yet wired to a provider)
- **A free, no-key, no-signup public WARN layoffs API** at `/api/warn.json` and `/api/warn.csv`: 6,527 notices, 5,202 distinct employers, 857,864 affected employees, 5 states with structured feeds, notices dating back to 2004. Every row carries a link to the government source and a `normalized` employer name specifically designed to join against H-1B/LCA data.
- A daily-committed, point-in-time archive of federal data (CBP, BLS, USCIS-derived) that gets silently revised and restated upstream
- Full methodology, sources, data-freshness, and disclosure pages

**Monetization: fully built, switched OFF.** Contextual affiliate modules on the highest-intent pages (Wise, Remitly, Sprintax, Boundless, immigration-lawyer lead-gen, Airalo, WES, translation, banking/insurance) — each link tagged with a per-placement subid; AdSense slots; the Pulse newsletter; a tip jar. Turning any of it on is an environment-variable change, not a code change.

**Constraints.** Strictly neutral positioning; the site explicitly refuses to assert causation between immigration and layoffs. Every figure labelled reported / projected / estimated. Some fine-grained state and country splits are openly labelled *modeled estimates*. No individual-level data, ever. Solo founder, no LLC yet, no email list, no audience, no name recognition in the space.

**Settled by the prior council — not re-litigated:** don't write doctrine before market evidence; the visitor is not the customer; consumer affiliate revenue caps around $40/month; the modeled estimates must be quarantined before institutional sale; the WARN+H-1B join and the point-in-time archive are the most commercial assets; buyers sit in law firms, mobility teams, recruiting, diligence, and newsrooms.

**Asked specifically:** name the buyer, the product, the price, and the sales motion. How long does it take, what does it cost the founder in time and money, and what is the realistic revenue ceiling of each path? Is "profitable business" even the right goal versus a cash-flowing asset or an acquisition target?

---

## Advisor responses

### The Contrarian (anonymized as Response C)

**The fatal flaw isn't monetization. It's that you built two months of supply without a single conversation about demand.** Everything in that brief is inventory. Zero of it is evidence a human will send money.

Attack the assets in order:

**The WARN API.** You gave it away — free, no key, no signup — which means you've already established the price. Five states of fifty is a demo. WARN feeds are public; a competent contractor rebuilds your scraper in a week. Nothing here is defensible except your willingness to maintain it, which is a job, not a moat.

**The point-in-time archive.** Two months deep. Nobody buys a 60-day history. It becomes valuable in year three, if you're still alive, and only with provenance rigor that survives a deposition. You're describing a lottery ticket that pays out after the point you'd have quit.

**2,600 programmatic pages.** MyVisaJobs and h1bdata.info have a decade of links on you. Scaled-content penalties are real. That's a deindexing risk, not an asset.

**The neutrality constraint kills your own thesis.** The buyers you named — law firms, newsrooms, diligence — pay for *conclusions*. You built a site that explicitly refuses to say the interesting thing. Meanwhile, unincorporated, you're personally liable for every modeled estimate someone cites.

**The 30-day falsification test:** email twenty named humans at immigration firms and mobility teams. Not for feedback — quote a price. $1,500/year, data access. If zero say yes in thirty days, you have a portfolio piece, not a business, and the correct move is to say so out loud rather than build route forty-one.

The near-zero operating cost is the trap. It lets this consume weekends for years while technically "profitable" at $40/month.

### The First Principles Thinker (anonymized as Response E)

You're asking how to make it profitable. It costs ~$0/month to run. It is already profitable. The scarce resource here isn't money, it's your next 200 hours — so the real question is: **what's the highest-return use of those hours, and does this project deserve them?**

Second reframe. You think you built a dashboard. You didn't. You built one non-obvious thing: a maintained `normalized` employer key that joins layoff notices to visa sponsorship, refreshed daily, with a point-in-time history. Everything else — 2,600 pages, the animated map, the persona switcher, the countdown — is marketing collateral for that join. Stop evaluating the site. Evaluate the join.

Third, and the one that actually matters. Nobody buys data. Data is a cost center with no deadline attached. People buy **triggers**: an event that starts a clock on someone else's problem. Your join produces exactly one of those, and it's a good one — an H-1B holder laid off has ~60 days before status lapses. That single event simultaneously creates a client for an immigration attorney, a candidate for a recruiter, and a compliance obligation for the employer who filed the LCA. You are sitting on a dated, sourced, daily-refreshed feed of countdown starts, and you're currently monetizing it with eSIM affiliate links.

So the right question isn't "who might value this." It's **"who is right now paying a human to assemble this by hand?"** That's the only budget that provably exists. Find three of them. Not a survey — find the actual person, ask what they do on Monday morning, and ask what it costs them.

Fourth: don't build anything. Send twenty emails with a hand-made version of the answer attached. If zero reply, the asset is worth zero and the elegance of the pipeline is irrelevant. That test costs one weekend and zero dollars. Run it before any other advice in this room.

### The Expansionist (anonymized as Response D)

**You built a lead-gen site and accidentally built a data company. Stop optimizing the wrong asset.**

The WARN API isn't a feature. It's the only free, normalized, entity-resolved national layoff feed that joins to H-1B/LCA. Intellizence, Revelio, and Lightcast sell adjacent data for six figures. You're giving it away at 5 states. **Go to 50.** That's the whole unlock — and it's the same scraper pattern you already wrote, times ten.

Who actually pays, ranked by willingness:

1. **Alt-data / equity research.** WARN filings are a leading indicator of quarterly headcount. A hedge fund pays $30–75k/yr for a clean, timestamped, revision-tracked layoff feed — and your point-in-time archive is *specifically* what they buy, because backtests die without it. This is the single highest-value thing you own and you're treating it as a footnote.
2. **HR tech / recruiting platforms** embedding your feed: $500–2k/mo API seats. They won't build state scrapers.
3. **PE/corporate diligence and mobility teams:** $5–15k/yr.

Ceiling: consumer affiliate caps at $40/mo. This caps around **$1–2M ARR** as a solo operator, and it's an acquisition target for Revelio, Lightcast, Envoy, or Deel at 4–8x — which is the real exit.

The adjacent play nobody's named: **be the citation layer.** Free API + free archive means journalists, academics, and LLMs cite immigrationclock as canonical. That citation graph *is* your distribution, your credibility, and your defensibility. Give the data away harder, sell the freshness, the SLA, the history, and the join.

Keep the free tier loud. Sell the timestamp.

### The Outsider (anonymized as Response B)

**The tell is the off switch.** Monetization is fully built and disabled by an environment variable. Two months of work, zero conversations with a buyer. That's not a business waiting on a decision — that's someone who likes building and doesn't like asking strangers for money. Everything below is downstream of that.

**As a first-time visitor:** the name says clock, the site is forty route types. I don't know what to do here or why I'd come back. And you say you refuse to assert causation, but you shipped a page called `/layoffs-vs-h1b`. A normal person reads that URL as the causal claim. A law firm's compliance person reads it and stops replying. Pick one: neutral utility or the spicy page. You can't sell both.

**The only thing I'd remember:** "WARN layoff notices, matched to H-1B sponsors, updated daily, with the government source on every row." I understood that in one sentence. That is the product. The dashboard is a marketing site for it, at best.

**Concrete:** form the LLC (~$500, one afternoon — nobody sends an invoice to a hobby). Then email 50 named humans — immigration attorneys, mobility leads, a labor reporter — with one sentence and a link to a free CSV. Ask what they'd pay. Not "would you," what. Price where a corporate card clears without approval: $99/month.

**Ten customers is $12k/year.** That's real money and not a job. Call it a cash-flowing asset, not a business, and stop measuring yourself against a company.

**Ninety days.** If you can't get ten strangers to pay by then, the answer isn't more features — it's that nobody wanted it, and you'll have learned that for $500 instead of another year.

### The Executor (anonymized as Response A)

**Monday morning, three things, in order.**

1. **Today (2 hours, $0):** Turn on the affiliate env vars and AdSense. Not because $40/month matters — because it's a two-hour switch that gives you a live revenue baseline and stops you optimizing in the dark. Do it and never think about it again.

2. **Week 1 (6 hours, $0):** Quarantine the modeled estimates behind a flag. You cannot show a law firm a dataset where some cells are labelled "estimate." Kill or hide. This is the gate on everything below it.

3. **Weeks 1–4, the actual job:** The product is **the WARN×H-1B join as a weekly alert email**, not a dashboard. "17 employers who filed WARN notices this month have active LCAs. Here's the list, here's the source link." That's a Google Sheet plus a cron you already have. Build time: 1 weekend.

**Sales motion:** 50 hand-written emails to named immigration attorneys at 10–50-lawyer firms, sourced from AILA's directory. 10/day, 5 days. Ask for a 15-minute call, not a sale. Price: **$99/month, or $1,500/year for firm-wide.** Don't invent tiers. Ten firms = $12K–15K/year, and that's a realistic 90-day outcome, not a fantasy one.

**Costs:** LLC + registered agent, ~$300. Stripe, $0 upfront. Email provider, ~$20/month. Total cash risk under $500.

**Ceiling:** ~40 firms / $60K ARR before you need a second person for support. That's a cash-flowing asset, not a business. Fine. Optimize for that, and the acquisition conversation finds you.

**Kill criterion:** 50 emails, zero calls booked by day 30 — the buyer isn't law firms. Move to recruiting ops.

---

## Peer review round

**Anonymization mapping:** A = The Executor · B = The Outsider · C = The Contrarian · D = The Expansionist · E = The First Principles Thinker

### Review 1

**1. Strongest: E.** It's the only one that names the actual product mechanism rather than the asset. "Nobody buys data, people buy triggers" plus the 60-day H-1B grace clock converts a dataset into a dated event that three separate budgets already fund. It also correctly reframes the goal: the constraint is 200 founder-hours, not dollars. A is the best execution plan; E is the better thesis. Ideally A's Monday sequence under E's framing.

**2. Biggest blind spot: D.** The alt-data path is fantasy at this stage. A 60-day point-in-time archive fails any backtest; funds want 3+ years, vendor diligence, compliance sign-off, and an SLA — none of which an unincorporated solo founder clears. "$1–2M ARR, acquisition at 4–8x" is unanchored. It also calls 50-state scraping "the same pattern times ten"; WARN feeds are inconsistent PDFs and portals — that's a permanent maintenance job, i.e. the thing that kills solo operators.

**3. All five missed:** lawyer lead-gen is regulated. Most state bars restrict fee-sharing and paid referrals to non-lawyers; a per-lead price to attorneys can be unsellable as designed. Subscription-to-data is the compliant shape — that changes the pitch, not just the price. Also unexamined: revenue is countercyclical (layoffs cool, churn spikes), and nobody asked the founder's runway or day-job status.

### Review 2 (data-sales / procurement lens)

**1. Strongest: E.** It's the only one that names the actual sellable unit — not data, a *trigger*. The 60-day H-1B grace clock is a dated, sourced event that creates a client, a candidate, and a compliance duty simultaneously. And "who is paying a human to do this by hand today" is the only question that locates a budget that provably exists. A is the best execution plan; E is the best thesis. Run E's test with A's calendar.

**2. Biggest blind spot: D.** The alt-data numbers are fantasy at this stage. Funds require ODD questionnaires, data-provenance and scraping-ToS legal review, PII attestation, MNPI policy, W-9/COI/DPA, and typically 3+ years of point-in-time history to backtest. You have 60 days and no legal entity. Also "50 states = same scraper ×10" is wrong — many states publish WARN as PDFs or portal-only, some not at all; it's months of brittle maintenance, not a weekend.

**3. All five missed:** nobody addressed **procurement mechanics or liability**. No entity, no SLA, no E&O — and a missed WARN notice in an attorney's alert feed is malpractice-adjacent. Also: the free no-key API cannibalizes the paid tier — add keys and rate limits *now*, before selling. And law firms buy *leads*, not data; the lead-gen path uses the same asset at higher yield.

### Review 3 (legal / regulatory-exposure lens)

**1. Strongest: E.** It's the only one that names the actual unit of value — a *trigger*, the 60-day status clock — and the only test that costs nothing: find who's paying a human to do this by hand today. A is the best execution plan, but it's E's thesis with a calendar attached.

**2. Biggest blind spot: D.** The alt-data path is where a solo founder gets hurt. Hedge funds don't buy from unincorporated individuals — they buy through vendor diligence: provenance, redistribution rights, no-PII attestation, sometimes SOC 2. A 60-day archive fails the first backtest question. And a 4–8x multiple on zero revenue isn't an exit, it's a mood.

**3. What all five missed: the join is a list of identifiable people on a deportation clock.**
- Selling "recently laid-off H-1B holders" to attorneys is client solicitation after a triggering event — the ABA 7.3 / state-bar rules built for ambulance chasing. That regulates the buyer, and the buyer knows it.
- Recruiting/HR use makes it a consumer report under FCRA the moment it informs an employment decision.
- Normalization errors mean falsely tagging Employer X as laying off — trade-libel exposure, personally, with no LLC.
- Nobody priced the maintenance cliff: at 50 states the SLA *is* the product, and it's a job you can't quit.

### Review 4 (unit-economics / pricing lens)

**1. Strongest: E.** It's the only one that names the actual unit of value — a *trigger* (60-day status clock) rather than a dataset — and the only correct demand test: find who is paying a human to assemble this today, because that's the sole budget proven to exist. A is the best execution plan; E is the better diagnosis.

**2. Biggest blind spot: D.** Every number is asserted. $30–75k hedge fund deals need 50-state coverage, multi-year point-in-time history (you have 60 days), an entity, a vendor security review, and a 6–12 month cycle. WARN skews small/private employers — weak signal for tradeable names. "$1–2M ARR solo" and "4–8x exit" are decoration.

**3. All five missed:**
- **COGS.** 50 state scrapers = 50 fragile PDF/portal parsers breaking monthly. That's 10–20 unpaid hrs/mo. At 10×$99 the founder clears roughly minimum wage. D's "same scraper times ten" is the most expensive sentence here.
- **$99/mo is an anchor, not a derivation.** A signed H-1B transfer case is worth $3–8k to a firm. Price per qualified lead or retainer, not a SaaS seat.
- **Churn.** The alert is episodic; firms cancel between hiring waves.
- **Sales CAC in founder-hours** — priced at zero by all five.

### Review 5 (founder psychology / executability lens)

**1. Strongest: A.** It's the only one that survives contact with a calendar. Hours, dollars, a price ($99/mo), a named list source (AILA), a ceiling it admits is small, and a dated kill criterion. E has the better *insight* — the 60-day grace clock is a trigger, and triggers are what people buy — but E gives no price and no date, so it's a reframe, not a plan. A + E's framing is the actual answer.

**2. Biggest blind spot: D.** The hedge-fund $30–75k number is fantasy at this stage: alt-data buyers require multi-year history, vendor diligence, and an entity — you have 60 days and no LLC. Worse, D's prescription ("go to 50 states") is months of scraper work *before* any customer, which is exactly the supply-side trap C correctly identified. $1–2M ARR is asserted with nothing under it.

**3. All five missed the maintenance liability.** The day someone pays $99/mo, a free hobby becomes an uptime obligation with no backup and no vacation — 50 state scrapers break weekly. That's the real founder cost, larger than the $500 LLC, and nobody priced it. Nobody asked whether he wants to sell lawyers data for three years. And charging after giving the API away free has no named path.

**Peer-review tally:** Strongest — First Principles ×4, Executor ×1. Biggest blind spot — **Expansionist ×5 (unanimous).**

---

## Chairman's synthesis

### Where the council agrees

**1. The dashboard is not the product. The join is.** Every advisor, from five different angles, arrived at the same object: *WARN layoff notices matched to H-1B sponsors, dated, with a government source on every row.* The Outsider put it best — that's the one sentence a stranger understood immediately. Forty route types, the animated map, the persona switcher, the countdown: marketing collateral for a single join.

**2. You have supply and zero demand evidence.** Two months of building, zero conversations quoting a price. The Contrarian named it as the fatal flaw; the Outsider read the off-switch as the psychological tell — monetization fully built and disabled is someone who likes building and doesn't like asking strangers for money. Both are right.

**3. Sell before you build.** Four of five prescribed the same next move: 20–50 hand-written emails to named humans with a price attached, using a hand-made sample. Not a survey, not "would you pay" — a number.

**4. Form the LLC.** Nobody invoices from a hobby, and you are currently personally liable for every modeled estimate anyone cites.

**5. The realistic outcome is a cash-flowing asset, not a company.** Both advisors who priced it landed in the same place: ~10 customers, $12–15k/year, ceiling ~$60k ARR solo. The Outsider's framing is the healthy one — call it an asset and stop measuring it against a company.

### Where the council clashes

**Is the alt-data path real? — Resolved: no.**
The Expansionist made the boldest claim in either session: hedge funds pay $30–75k/yr for a revision-tracked layoff feed, ceiling $1–2M ARR, acquisition by Revelio or Lightcast at 4–8x. **All five reviewers independently named it the biggest blind spot — the only unanimous verdict across both council sessions.** The objections stack: funds require ODD questionnaires, provenance and scraping-ToS review, PII attestation, MNPI policy, and typically 3+ years of point-in-time history to backtest. You have ~60 days of archive and no legal entity. And "50 states is the same scraper times ten" is wrong — many states publish WARN as PDFs or portal-only. As one reviewer put it, a multiple on zero revenue isn't an exit, it's a mood.

The chair rejects the alt-data path *as a near-term plan* while preserving its one durable insight: **the archive only becomes valuable if you keep committing it.** It costs you nothing. Keep it running for three years and the Expansionist's thesis becomes testable. Just don't organize the next 90 days around it.

**Is $99/month right? — Resolved: no, it's too low.**
The Executor and the Outsider converged on $99/mo, and Review 5 praised it as the only plan that survives contact with a calendar. Review 4 dismantled the number: it's an anchor, not a derivation. A signed H-1B transfer case is worth $3–8k to a firm. If the feed reliably surfaces even one such case a quarter, $99/mo underprices it by an order of magnitude — and cheap prices attract the buyers who churn fastest. The chair sides with Review 4. **Test $400–500/month firm-wide, or $4,800/year.** Ten customers at that price is $48k, which is the difference between a hobby that pays for dinner and something worth your next 200 hours.

**Neutrality: does it kill the thesis?**
The Contrarian argued your buyers pay for conclusions and you built a site that refuses to state one. The Outsider found the sharper version: you claim neutrality *and* ship a page called `/layoffs-vs-h1b`, which reads as the causal claim to a normal person — and to a law firm's compliance reviewer. The chair's resolution: neutrality is correct for the data product and the URL is a liability for the enterprise sale. Rename it. Ship the same page as "Sponsorship and workforce reductions, side by side."

### Blind spots the council caught

Peer review surfaced four things no advisor raised, and one of them constrains the product's shape:

- **Bar rules constrain how you sell to attorneys.** Most state bars restrict fee-sharing and paid referrals with non-lawyers, and solicitation after a triggering event is exactly what Model Rule 7.3 was written for. **This changes the pitch, not the viability:** sell employer-level *market intelligence* on a subscription — the compliant shape — not per-lead pricing on people. (One reviewer described the join as "a list of identifiable people on a deportation clock." That overstates what you actually hold — WARN notices name employers, not employees, and your site has no individual-level data. But the caution about framing stands, and it's the reason the subscription shape is the right one.)
- **COGS is the number nobody priced.** 50 fragile PDF/portal parsers breaking monthly is 10–20 unpaid hours a month. At 10 × $99 you clear roughly minimum wage. This is the single strongest argument against the Expansionist's "go to 50 states" and *for* raising the price instead of the coverage.
- **The free no-key API cannibalizes the paid tier, and nobody named a path from free to paid.** Add API keys and rate limits *now*, while nobody depends on it. You cannot un-free it once someone builds on it.
- **Revenue here is countercyclical and episodic.** Layoffs cool, firms churn between hiring waves. Annual contracts, not monthly, for that reason alone.
- **Nobody asked your runway.** Full-time or nights changes every recommendation in this transcript.

### The recommendation

**Sell an employer-level layoff-and-sponsorship intelligence subscription to immigration law firms, at $400–500/month billed annually, before you build anything else.**

Concretely, in this order:

1. **This weekend, $0.** Run the join you already have the pieces for — `normalized` employer names in `warn.json` against your 2,600-sponsor dataset — for the last 30 days across your 5 states. Format it as a plain email: *"14 employers filed WARN notices this month and appear in USCIS H-1B sponsor data. Here they are, with the state portal link for each."* Hand-made is fine. It should look like something a paralegal spent a day on.
2. **Week 1, ~$300.** Form the LLC. Quarantine the modeled estimates behind a flag. Add API keys + rate limits to the free feed. Rename `/layoffs-vs-h1b`.
3. **Weeks 1–3.** Send that email to 40 named immigration attorneys at 10–50-lawyer firms, sourced from AILA chapter directories — 10/day. Attach the sample. State the price: $4,800/year, firm-wide. Ask for 15 minutes, not a signature.
4. **Also turn the affiliate env vars on.** Two hours, and then never think about it again. It's a revenue baseline, not a strategy.

**Kill criterion — take it seriously.** 40 emails, zero calls booked by day 30 means law firms aren't the buyer. Next stop is recruiting/mobility ops, not more features. If both fail by day 90, you have an excellent portfolio piece and a free public good, and the correct move is to say that out loud and stop spending weekends on it. The near-zero operating cost is the trap: it lets this run for years while technically "profitable" at $40/month.

**On the framing question you asked:** "profitable business" is the wrong target. It already costs ~$0 to run — it is technically profitable. The scarce resource is your next 200 hours. Aim for a **cash-flowing asset at $40–60k ARR**, keep the archive committing daily as a free option on the Expansionist's thesis, and let the acquisition conversation find you rather than designing for it.

### The one thing to do first

**Build one week's WARN × H-1B cross-reference by hand and email it, with a price, to twenty named immigration attorneys.**

You already have both datasets and a `normalized` employer key that exists specifically to join them — this is a script you can write in an hour, not a product. It simultaneously tests the thesis (is the join valuable?), the buyer (is it law firms?), and the price (does $4,800/year get a reply or a laugh?). It costs one weekend and zero dollars, and every other recommendation in this transcript is downstream of its answer.

---

*Council convened 2026-08-01, session 2. Five advisors, one anonymized peer-review round, chairman synthesis. Methodology by Andrej Karpathy.*
