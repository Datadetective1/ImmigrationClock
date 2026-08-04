# ImmigrationClock — Brand Style Guide

Version 1.0 · August 2026

---

## 0. What this identity is for

ImmigrationClock publishes numbers about a subject people already have strong
feelings about. The identity has one job: **make the reader believe the number
before they decide how they feel about it.**

That produces three design constraints that everything below follows from.

**It must read as an instrument, not an argument.** The visual language is
measurement — dials, graduations, tabular figures, provenance chips. Not
persuasion.

**It must not look like a law firm.** No serif capitals, no gold, no gavels or
scales of justice, no centred symmetry, no eagles, no flags. Those signal
*advocacy on your behalf*. This product signals *here is what the data says*.

**It must not look partisan.** Red and green are never used to mean good or bad
about immigration figures. This is a hard rule with its own section (§3.4) and
it is the single most important thing in this document.

Reference points: Stripe (restraint, generous whitespace), Linear (tight
tracking, precise geometry), Bloomberg Terminal (numerals as the hero),
Notion (calm neutrals). Not: Reuters graphics, political campaign design.

---

## 1. The mark — "The Dial"

The mark is a measuring instrument with three layers, which is the product's
thesis in one glyph:

| Layer | Element | Means |
|---|---|---|
| Outer | Four graduations at the cardinals | The scale you are measuring against |
| Middle | Blue quarter-sweep, 12→3 | The period the data actually covers |
| Inner | Hand pointing to 12, centre dot | Where the reading stands right now |

**The sweep is always a quarter — never a half, never a full ring.** A closed
ring would claim complete coverage. This product's data is partial and lagged
by design, and the mark is honest about that. Do not "complete" it.

### 1.1 Optical sizes

Three cuts are generated. This is a real optical system, not a scale-down.

| Cut | Use at | Contains |
|---|---|---|
| `regular` | ≥ 32px | Graduations, sweep, hand, dot |
| `small` | 20–32px | Sweep, hand, dot. Strokes thickened. |
| `micro` | ≤ 16px | Sweep only. No hand, no dot. |

The micro cut exists because it was measured, not guessed. At 16px the gap
between the hand's round cap and the ring's inner edge computes to **0.90px**,
which antialiasing turns into a navy smudge. What survives at that size is the
ring and the blue quarter — so that is what micro keeps.

### 1.2 Clear space and minimum size

Clear space on all four sides is **½ the mark's height**, and it is baked into
the exported SVG viewBoxes so it cannot be got wrong by accident.

| | Minimum |
|---|---|
| Mark alone | 16px digital / 6mm print |
| Horizontal lockup | 120px wide |
| Stacked lockup | 88px wide |

Below 120px wide, switch from the horizontal lockup to the stacked one or to
the mark alone. Do not shrink the horizontal lockup past legibility.

### 1.3 Misuse

Do not: recolour the sweep to anything but the accent · rotate the mark ·
add a drop shadow, bevel, gradient or outer glow to the glyph · stretch it
non-uniformly · place it on a photograph without a solid navy plate · put the
wordmark in a different typeface · redraw the hand to a different hour ·
enclose it in an additional border or circle.

---

## 2. Logo lockups

**Horizontal** — the default. Mark + wordmark, gap = 0.33 × mark height.
**Stacked** — for square placements and anything under 160px wide.
**Mark alone** — avatars, favicons, app icons, watermarks.

The wordmark is **monotone**. Colouring "Clock" in the accent is the fastest way
to make a data brand look like a logo generator; the accent lives in the mark
and nowhere else in the logo. Wordmark is Inter 700 at **-0.02em** tracking —
at that weight, the tracking is what separates *institutional* from *shouty*.

`ImmigrationClock` is one word, no space, capital I and capital C. Never
"Immigration Clock", "immigrationclock", or "IC".

---

## 3. Colour palette

### 3.1 Core

| Token | Hex | Role |
|---|---|---|
| `navy-950` | `#0A1B2D` | Deepest field, gradient anchor |
| **`navy-900`** | **`#102A43`** | **Primary. Wordmark, headlines, logo container.** |
| `navy-800` | `#1B3A57` | Secondary surfaces, chart series 1 |
| `navy-700` | `#274D6E` | Borders on dark |
| `navy-600` | `#35648C` | — |
| `navy-500` | `#4A7FA8` | — |

### 3.2 Accent — the "signal" ramp

| Token | Hex | Role |
|---|---|---|
| `blue-800` | `#0B3D91` | Text on pale blue fills |
| `blue-700` | `#1560D8` | Link hover on white — 5.68:1 |
| `blue-600` | `#2470F0` | **Link and eyebrow text on white — 4.52:1** |
| **`blue-500`** | **`#2D7FF9`** | **Accent. The sweep, active state, key data mark.** |
| `blue-400` | `#5B9DFF` | The accent *on dark* — 5.38:1 on navy-900 |
| `blue-300` | `#8FBDFF` | Secondary text on dark |
| `blue-200` | `#BBD7FF` | Tagline on dark |
| `blue-100` / `blue-50` | `#D9E8FF` / `#EFF5FF` | Fills, chips, highlight rows |

### 3.3 Where the accent is allowed

`#2D7FF9` measures **3.81:1 on white**. That clears the 3:1 bar for graphics
and large text, and falls short of the 4.5:1 bar for body text. So the accent
is *scoped*, not changed:

- **Graphics, marks, arcs, chart bars, 24px+ display text** → `blue-500` ✓
- **Body text, links, labels, anything under 24px on white** → `blue-600`
- **Anything on navy** → `blue-400` (`blue-500` is only 3.84:1 on navy-900)

Keep the brand accent exactly as specified; just never set a source line in it.

### 3.4 The colour rule — read this one

**Colour encodes identity, never direction, and never judgement.**

Removals up is not red. Approvals up is not green. Whether either is good is
the reader's call, and the moment the palette answers it for them, the product
stops being a source and becomes a position.

- Magnitude → a single navy→blue sequential ramp.
- Categories (countries, employers, states) → the categorical series, in order.
- Change → an arrow glyph and a signed number. Neutral ink. Not colour.
- Red / amber / green are reserved **exclusively for data freshness** — is this
  figure current — and are always paired with a text label, never colour alone.

### 3.5 Neutrals

| Token | Hex | Role | On white |
|---|---|---|---|
| `neutral-0` | `#FFFFFF` | Background |  |
| `neutral-50` | `#F7F9FC` | Page tint |  |
| `neutral-100` | `#EEF2F7` | Gridlines, hairline fills |  |
| `neutral-200` | `#DEE5EE` | Borders |  |
| `neutral-300` | `#C6D0DD` | Dial ring, strong borders |  |
| `neutral-400` | `#9AA8BB` | Disabled |  |
| `neutral-500` | `#68778D` | Secondary text | 4.55:1 |
| `neutral-600` | `#51617A` | Source lines, metadata | 6.29:1 |
| `neutral-900` | `#102A43` | Body text | 14.64:1 |

`neutral-500` is `#68778D`, not the more obvious `#6B7A91` — that measured
4.36:1, under AA. Source names and "data through" dates are set in this colour,
and the text a reader needs in order to judge a number must never be the least
legible thing on the page. This is the same reasoning as the `slate-500`
override already in `tailwind.config.ts`.

### 3.6 Data freshness

| State | Dot | Text on white | Label |
|---|---|---|---|
| Live | `#0E9F6E` | `#046C4E` — 6.44:1 | "Updated daily" |
| Stale | `#B45309` | `#B45309` — 5.02:1 | "Past expected refresh" |
| Archive | `#51617A` | `#51617A` — 6.29:1 | "Point-in-time figure" |

### 3.7 Chart series

Used strictly in order. Past four series a legend stops working and the answer
is small multiples, not a seventh colour.

| # | On white | On navy |
|---|---|---|
| 1 | `#102A43` | `#C6D0DD` |
| 2 | `#2D7FF9` | `#5B9DFF` |
| 3 | `#00A0A0` | `#34D3C4` |
| 4 | `#7B61FF` | `#A78BFA` |
| 5 | `#C77700` | `#F0A93B` |
| 6 | `#C2255C` | `#FF7CA3` |

Every pairing in this document is machine-checked. Run `node brand/contrast.mjs`
— 31/31 pass. Add `--ci` to fail a build on regression.

---

## 4. Typography

### 4.1 Families

**Inter** — display, UI, body.
Neutral to the point of transparency, which is the point: the reader should
notice the number, not the typeface. Variable, free (OFL), enormous language
coverage, and it ships genuine tabular figures and a slashed zero. It is also
already the house voice of the reference set — Linear, Vercel, most of modern
fintech — so it reads as contemporary infrastructure rather than as a brand.

**IBM Plex Mono** — all numerals, source lines, timestamps, IDs.
This is the identity's second signature and it does real work. Its lineage is
institutional-technical rather than editorial, so figures read as *instrument
output* instead of *headline*. Monospace also means a counter that ticks does
not reflow the layout around it — which matters on a page full of live counters.

**Fallback stack.** `-apple-system, "Segoe UI Variable Display", "Segoe UI",
Roboto, Helvetica, Arial, sans-serif`. Chosen so an unbranded fallback still
lands on a neutral grotesque and never on a serif.

> **Deliberately no serif.** A serif is the single fastest way to read as a law
> firm or an advocacy shop. If long-form editorial ever needs one, it is scoped
> to newsletter body copy only and must be a *newspaper* serif, never a
> *lawyer's* serif — Source Serif 4, never Trajan, Garamond or Baskerville.

### 4.2 Scale

| Role | Size / line-height | Weight | Tracking |
|---|---|---|---|
| Display | 60–76 / 1.05 | 700 | -0.025em |
| H1 | 44 / 1.12 | 700 | -0.02em |
| H2 | 32 / 1.2 | 650 | -0.02em |
| H3 | 24 / 1.3 | 600 | -0.01em |
| Body L | 18 / 1.6 | 400 | 0 |
| Body | 16 / 1.6 | 400 | 0 |
| Small | 14 / 1.5 | 400 | 0 |
| Eyebrow | 12–14 / 1.2 | 700 | **+0.12em**, uppercase |
| Source line | 13–14 / 1.5 | 400 | 0 | *(mono)* |
| Counter | 32–160 / 1 | 600 | -0.02em | *(mono)* |

Tracking is negative as size goes up and positive only for uppercase eyebrows.
Never track lowercase body copy.

### 4.3 Numeral rules

These are not stylistic preferences; they are correctness requirements for a
product whose numbers animate.

1. **Every figure uses tabular, lining numerals.** `font-variant-numeric:
   tabular-nums`. Proportional figures make a ticking counter jitter.
2. **Every figure that can be confused uses a slashed zero.** Inter: `cv01`.
3. **Group with commas at 4+ digits** (`9,265`), US convention.
4. **Never abbreviate in the primary figure.** `271,484`, not `271K`.
   Abbreviation is permitted only on chart axes.
5. **Every figure carries a period and a source within the same visual block.**
   A number without "FY2024" and without an agency name is not publishable.

---

## 5. Iconography

31 icons, generated from `brand/lib/icons.mjs`.

- 24 × 24 grid, 20 × 20 live area
- **1.75** stroke, round caps, round joins
- `stroke="currentColor"` — colour is decided by context, never by the icon
- Geometry snaps to 0.5; circles centre on 12
- Nothing drawn smaller than 2.5 units; it will not survive 16px

Sets: *evidence* (source, document, verified, dataset, api, download) ·
*time* (clock, live, calendar, history) · *charts* (line, bar, area, gauge,
trend up/down/flat) · *subject* (globe, state, status, border, employer, jobs,
people) · *utility* (search, filter, external, caveat, method, newsletter,
alert).

**Deliberately absent:** gavels, scales of justice, courthouse columns, eagles,
flags, handshakes, torches, Statue of Liberty silhouettes. That is the visual
vocabulary of a law firm or an advocacy group. This product reports numbers.

---

## 6. Layout

- **8px base grid.** Every spacing value is a multiple of 8; 4 is allowed only
  inside components.
- **Generous margins.** Social templates use an 88px margin on a 1080 canvas —
  8.1%. Resist filling it.
- **One idea per surface.** A post makes one claim. If it needs two, it is two
  posts.
- **Left-aligned, asymmetric.** Centred layouts read institutional-in-the-
  ceremonial-sense. The only centred asset is the LinkedIn cover, where the
  platform's own chrome forces it.
- **The rule at the top.** Navy 10px bar with a 270px accent segment at the
  left, on every white template. It is the brand's quietest recurring signature.

---

## 7. Social specifications

| Asset | Pixels | File |
|---|---|---|
| LinkedIn company logo | 400 × 400 | `profile/linkedin-logo-400.svg` |
| X profile image | 400 × 400 | `profile/x-profile-400.svg` |
| LinkedIn company cover | 1128 × 191 | `banners/linkedin-company-1128x191.svg` |
| LinkedIn personal cover | 1584 × 396 | `banners/linkedin-personal-1584x396.svg` |
| X header | 1500 × 500 | `banners/x-header-1500x500.svg` |
| Post — the number | 1080 × 1080 | `social/template-a-number-*.svg` |
| Post — the statement | 1080 × 1080 | `social/template-b-statement-*.svg` |
| Post — the chart | 1080 × 1350 | `social/template-c-chart-*.svg` |
| Link / OG card | 1200 × 628 | `social/template-d-card-*.svg` |

**Platform chrome is designed around, not ignored.** LinkedIn overlaps the
bottom-left of a company cover with the logo card; X overlaps the bottom-left
of a header with the avatar. Nothing important is placed there. The X header
block starts at x=340 and stays within y=100–400 because mobile crops the top
and bottom bands.

The X profile image ships as a **hard square with no corner radius** — X masks
avatars to a circle, and rounding artwork that is about to be circle-masked
only wastes pixels. The LinkedIn logo keeps its squircle because LinkedIn's
mask is a rounded square.

### The four post templates

**A. The Number** — one figure, sourced. The default post.
**B. The Statement** — a plain-language finding on navy, for threads and quotes.
**C. The Chart** — a comparison, portrait, for feed dwell time.
**D. The Card** — link previews and OG images.

**Every template ends in a source block.** A post from this account without a
visible source and an "as of" date is off-brand and should not ship. That is
the entire promise of the tagline, and the templates are built so that keeping
it is easier than breaking it.

---

## 8. The tagline

> **Facts First • Sources Included**

Locked wording, title case, U+2022 bullet with spaces. Used on banners and the
link card. Never re-punctuated, never split across lines, never translated
without sign-off.

It is the short brand form of the longer product line already in use on the
site — *"Facts first. Trends live. Sources included."* Both are correct; the
short one is for identity surfaces, the long one for product surfaces.

---

## 9. Two surfaces, one system

The dashboard at immigrationclock.com is **dark** (the `ink` palette in
`tailwind.config.ts`). This brand is **white and navy**. That is deliberate,
not a contradiction:

- **Product surface — dark.** A live instrument. Numbers glow against near-black
  the way a terminal does. Governed by `tailwind.config.ts`.
- **Brand surface — light.** Everything that represents the organisation rather
  than the data: logo, social, email, decks, docs, press. Governed by this file.

They are reconciled by sharing the same navy (`#102A43` is both `navy-900` here
and the family the `ink` ramp descends from), the same accent hue, the same
typefaces, the same icons, and the same numeral rules. A reader moving from a
LinkedIn post to the dashboard should feel the lights dim, not the brand change.

---

## 10. Files

```
brand/
  tokens.mjs          single source of truth — colour, type, tagline
  build.mjs           generates every asset          → node brand/build.mjs
  contrast.mjs        verifies every colour pairing  → node brand/contrast.mjs
  serve.mjs           local review server            → node brand/serve.mjs
  lib/                mark, lockup, banner, post and icon generators
  preview/index.html  visual style guide
  preview/export.html PNG export at exact platform sizes
  assets/             62 generated files — logo, profile, banners, social,
                      favicon, icons, tokens (colors.css + colors.json)
```

Assets are committed, so nobody needs Node to use them. They are generated, so
changing a colour never means editing forty files by hand.

**Handoff to engineering:** `assets/tokens/colors.css` (CSS custom properties,
`--ic-*`) and `assets/tokens/colors.json`.

---

*Questions this guide does not answer should be resolved in favour of whichever
option makes the source of a number more obvious.*
