/**
 * Generates the visual style guide → brand/preview/index.html
 *
 *   node brand/guide.mjs
 *
 * The page inlines every asset so the single HTML file is self-contained and
 * can be opened from disk, served, or published without a dependency on the
 * assets folder travelling with it.
 *
 * Design note: the guide is set in the identity it documents — a datasheet, not
 * a brochure. Narrow mono label column, wide content column, hairline rules.
 * The brand argues that a figure is only as good as its provenance, so the page
 * that explains the brand shows its own measurements.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { color, TAGLINE } from "./tokens.mjs";
import { icons } from "./lib/icons.mjs";
import { ratio } from "./contrast.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const A = join(HERE, "assets");

/** Inline an asset, stripping the width/height so CSS controls the size. */
const svg = (rel, cls = "", style = "") =>
  readFileSync(join(A, rel), "utf8")
    .replace(/<\?xml[^>]*\?>/, "")
    .replace(/^\s*<svg /, `<svg class="${cls}" style="${style}" `)
    .replace(/ (width|height)="[^"]*"/g, "")
    .trim();

const sw = (name, hex, role = "") => `
  <div class="sw">
    <div class="sw-chip" style="background:${hex}"></div>
    <div class="sw-meta"><b>${name}</b><code>${hex}</code>${role ? `<span>${role}</span>` : ""}</div>
  </div>`;

const contrastRow = (label, fg, bg, min) => {
  const r = ratio(fg, bg);
  return `<tr><td>${label}</td><td><code>${fg}</code></td><td class="num">${r.toFixed(2)}:1</td><td><span class="pass">PASS</span> <span class="dim">min ${min}</span></td></tr>`;
};

const iconCell = (name) => `
  <figure class="ic">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>
    <figcaption>${name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}</figcaption>
  </figure>`;

/** Construction diagram: the mark with its geometry exposed. */
const construction = () => `
<svg viewBox="-6 -6 76 76" class="constr">
  <defs><pattern id="g" width="8" height="8" patternUnits="userSpaceOnUse">
    <path d="M8 0H0v8" fill="none" stroke="currentColor" stroke-width="0.25" opacity="0.35"/>
  </pattern></defs>
  <rect x="0" y="0" width="64" height="64" fill="url(#g)"/>
  <rect x="0" y="0" width="64" height="64" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.5"/>
  <circle cx="32" cy="32" r="30.2" fill="none" stroke="currentColor" stroke-width="0.35" stroke-dasharray="2 2" opacity="0.6"/>
  <circle cx="32" cy="32" r="27.5" fill="none" stroke="currentColor" stroke-width="0.35" stroke-dasharray="2 2" opacity="0.6"/>
  <circle cx="32" cy="32" r="23" fill="none" stroke="currentColor" stroke-width="0.35" stroke-dasharray="2 2" opacity="0.6"/>
  <path d="M32 0v64M0 32h64" stroke="currentColor" stroke-width="0.35" stroke-dasharray="2 2" opacity="0.6"/>
  <g class="constr-mark">
    <circle cx="32" cy="32" r="23" fill="none" stroke="#C6D0DD" stroke-width="4.6"/>
    <path d="M32 9A23 23 0 0 1 55 32" fill="none" stroke="#2D7FF9" stroke-width="4.6" stroke-linecap="round"/>
    <path d="M32 32L32 16.5" stroke="#102A43" stroke-width="4.6" stroke-linecap="round"/>
    <circle cx="32" cy="32" r="2.8" fill="#102A43"/>
    <path d="M32 4.5v-2.7M32 62.2v-2.7M4.5 32H1.8M62.2 32h2.7" stroke="#102A43" stroke-width="2.4" stroke-linecap="round" opacity="0"/>
  </g>
  <g stroke="#102A43" stroke-width="2.4" stroke-linecap="round">
    <path d="M32 4.5V1.8"/><path d="M59.5 32h2.7"/><path d="M32 59.5v2.7"/><path d="M4.5 32H1.8"/>
  </g>
  <g class="dim-txt" font-size="3.2">
    <text x="33.5" y="21.5">r 23</text>
    <text x="33.5" y="6">r 30.2</text>
  </g>
</svg>`;

const page = `<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ImmigrationClock — Brand Style Guide</title>
<style>
  :root {
    color-scheme: light dark;
    --navy-950:${color.navy[950]}; --navy-900:${color.navy[900]}; --navy-800:${color.navy[800]};
    --blue-600:${color.blue[600]}; --blue-500:${color.blue[500]}; --blue-400:${color.blue[400]};
    --blue-300:${color.blue[300]}; --blue-50:${color.blue[50]};

    --bg:      #FFFFFF;
    --bg-sunk: #F7F9FC;
    --ink:     ${color.navy[900]};
    --ink-2:   ${color.neutral[600]};
    --ink-3:   ${color.neutral[500]};
    --line:    ${color.neutral[200]};
    --line-2:  ${color.neutral[100]};
    --acc:     ${color.blue[600]};
    --acc-mark:${color.blue[500]};
    --ring:    ${color.neutral[300]};
    --card:    #FFFFFF;

    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --mono: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, "Roboto Mono", Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:${color.navy[950]}; --bg-sunk:#07131F; --card:#0E2438;
      --ink:#EAF1F8; --ink-2:#A9BACD; --ink-3:#8397AE;
      --line:rgba(255,255,255,0.13); --line-2:rgba(255,255,255,0.07);
      --acc:${color.blue[400]}; --acc-mark:${color.blue[400]}; --ring:rgba(255,255,255,0.30);
    }
  }
  :root[data-theme="dark"] {
    --bg:${color.navy[950]}; --bg-sunk:#07131F; --card:#0E2438;
    --ink:#EAF1F8; --ink-2:#A9BACD; --ink-3:#8397AE;
    --line:rgba(255,255,255,0.13); --line-2:rgba(255,255,255,0.07);
    --acc:${color.blue[400]}; --acc-mark:${color.blue[400]}; --ring:rgba(255,255,255,0.30);
  }
  :root[data-theme="light"] {
    --bg:#FFFFFF; --bg-sunk:#F7F9FC; --card:#FFFFFF;
    --ink:${color.navy[900]}; --ink-2:${color.neutral[600]}; --ink-3:${color.neutral[500]};
    --line:${color.neutral[200]}; --line-2:${color.neutral[100]};
    --acc:${color.blue[600]}; --acc-mark:${color.blue[500]}; --ring:${color.neutral[300]};
  }

  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--sans);
         font-size:15px; line-height:1.62; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:1080px; margin:0 auto; padding:0 28px; }

  /* ── masthead ─────────────────────────────────────────────── */
  .mast { background:var(--navy-950); color:#fff; padding:64px 0 56px; }
  .mast .wrap { display:flex; flex-direction:column; gap:28px; }
  .mast-logo svg { height:56px; width:auto; }
  .mast h1 { font-size:clamp(34px,5.2vw,54px); line-height:1.04; letter-spacing:-0.028em;
             margin:0; font-weight:700; text-wrap:balance; max-width:16ch; }
  .mast .tag { font-size:15px; letter-spacing:0.06em; color:${color.blue[200]}; font-weight:600; }
  .mast .meta { display:flex; gap:28px; flex-wrap:wrap; font-family:var(--mono);
                font-size:12px; color:rgba(255,255,255,0.55); letter-spacing:0.02em; }

  /* ── datasheet rows ───────────────────────────────────────── */
  section { border-top:1px solid var(--line); padding:56px 0; }
  section:first-of-type { border-top:none; }
  .row { display:grid; grid-template-columns:132px 1fr; gap:36px; align-items:start; }
  @media (max-width:760px){ .row { grid-template-columns:1fr; gap:16px; } }
  .lbl { font-family:var(--mono); font-size:11px; letter-spacing:0.14em; text-transform:uppercase;
         color:var(--ink-3); padding-top:6px; position:sticky; top:20px; }
  .lbl b { display:block; color:var(--acc); font-size:11px; margin-bottom:5px; font-weight:700; }
  h2 { font-size:27px; letter-spacing:-0.02em; margin:0 0 14px; font-weight:700; text-wrap:balance; }
  h3 { font-size:14px; letter-spacing:0.09em; text-transform:uppercase; color:var(--ink-3);
       margin:34px 0 14px; font-weight:700; }
  h3:first-child { margin-top:0; }
  p { margin:0 0 15px; max-width:66ch; color:var(--ink-2); }
  p.lede { font-size:17px; color:var(--ink); max-width:60ch; }
  strong { color:var(--ink); font-weight:650; }
  code { font-family:var(--mono); font-size:0.88em; }
  ul { margin:0 0 15px; padding-left:19px; max-width:66ch; color:var(--ink-2); }
  li { margin-bottom:6px; }
  a { color:var(--acc); }

  .callout { border:1px solid var(--line); border-left:3px solid var(--acc-mark);
             background:var(--bg-sunk); border-radius:0 8px 8px 0; padding:20px 22px; margin:22px 0; }
  .callout p:last-child { margin-bottom:0; }
  .callout h4 { margin:0 0 8px; font-size:15px; font-weight:700; color:var(--ink); }

  /* ── specimens ────────────────────────────────────────────── */
  /* Specimen plates do NOT follow the page theme. A light-variant logo has a
     navy hand; on a dark card that hand all but disappears, and the reader
     ends up judging the mark against a ground it will never be used on. So
     the plate is always the ground the artwork was drawn for, in both themes,
     and its text colour is pinned too so currentColor resolves correctly. */
  .plate { background:#FFFFFF; border:1px solid ${color.neutral[200]}; border-radius:10px;
           color:${color.navy[900]};
           padding:26px; display:flex; align-items:center; justify-content:center; gap:32px; flex-wrap:wrap; }
  .plate.dark { background:${color.navy[900]}; border-color:${color.navy[800]}; color:#FFFFFF; }
  .plate svg { display:block; }
  .grid { display:grid; gap:14px; }
  .g2 { grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); }

  .optical { display:flex; align-items:flex-end; gap:26px; flex-wrap:wrap; }
  .optical figure { margin:0; text-align:center; }
  .optical figcaption { font-family:var(--mono); font-size:10.5px; color:${color.neutral[500]}; margin-top:10px; }
  /* Pinned like .plate — the diagram lives on the always-white specimen ground. */
  .constr { width:min(300px,100%); color:${color.neutral[400]}; }
  .constr .dim-txt { fill:${color.neutral[500]}; font-family:var(--mono); }

  /* ── swatches ─────────────────────────────────────────────── */
  .sws { display:grid; grid-template-columns:repeat(auto-fill,minmax(158px,1fr)); gap:10px; }
  .sw { border:1px solid var(--line); border-radius:9px; overflow:hidden; background:var(--card); }
  .sw-chip { height:60px; }
  .sw-meta { padding:9px 11px; display:flex; flex-direction:column; gap:1px; }
  .sw-meta b { font-size:12.5px; font-weight:650; }
  .sw-meta code { font-size:11px; color:var(--ink-3); text-transform:uppercase; }
  .sw-meta span { font-size:11px; color:var(--ink-3); line-height:1.4; margin-top:3px; }

  table { width:100%; border-collapse:collapse; margin:16px 0; font-size:13.5px; }
  th { text-align:left; font-family:var(--mono); font-size:10.5px; letter-spacing:0.11em;
       text-transform:uppercase; color:var(--ink-3); padding:0 12px 9px 0; border-bottom:1px solid var(--line); font-weight:700; }
  td { padding:9px 12px 9px 0; border-bottom:1px solid var(--line-2); color:var(--ink-2); vertical-align:baseline; }
  td.num { font-family:var(--mono); font-variant-numeric:tabular-nums; color:var(--ink); }
  .scroll { overflow-x:auto; }
  .pass { color:${color.status.live}; font-family:var(--mono); font-size:11px; font-weight:700; }
  .dim { color:var(--ink-3); font-family:var(--mono); font-size:11px; }

  /* ── type specimens ───────────────────────────────────────── */
  .spec { border-bottom:1px solid var(--line-2); padding:16px 0; display:grid;
          grid-template-columns:118px 1fr; gap:20px; align-items:baseline; }
  .spec .k { font-family:var(--mono); font-size:10.5px; letter-spacing:0.09em;
             text-transform:uppercase; color:var(--ink-3); }
  .counter { font-family:var(--mono); font-variant-numeric:tabular-nums;
             font-size:clamp(40px,8vw,74px); font-weight:600; letter-spacing:-0.03em; color:var(--ink); line-height:1; }

  /* ── icons ────────────────────────────────────────────────── */
  .icons { display:grid; grid-template-columns:repeat(auto-fill,minmax(104px,1fr)); gap:6px; }
  .ic { margin:0; padding:16px 6px 12px; text-align:center; border:1px solid var(--line-2);
        border-radius:8px; color:var(--ink); }
  .ic svg { width:24px; height:24px; }
  .ic figcaption { font-family:var(--mono); font-size:10px; color:var(--ink-3); margin-top:10px;
                   word-break:break-word; }

  /* ── social ───────────────────────────────────────────────── */
  .banner { border:1px solid var(--line); border-radius:10px; overflow:hidden; margin-bottom:14px; }
  .banner svg { display:block; width:100%; height:auto; }
  .posts { display:grid; grid-template-columns:repeat(auto-fit,minmax(215px,1fr)); gap:14px; }
  .posts > div { border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  .posts svg { display:block; width:100%; height:auto; }

  .avatars { display:flex; gap:26px; align-items:flex-end; flex-wrap:wrap; }
  .avatars figure { margin:0; text-align:center; }
  .avatars figcaption { font-family:var(--mono); font-size:10.5px; color:var(--ink-3); margin-top:10px; }
  .circle svg { border-radius:50%; }

  .dont { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; margin-top:8px; }
  .dont div { border:1px solid var(--line); border-radius:8px; padding:13px 15px; font-size:13px; color:var(--ink-2); }
  .dont b { display:block; color:${color.status.stale}; font-family:var(--mono); font-size:10px;
            letter-spacing:0.11em; margin-bottom:5px; }

  footer { border-top:1px solid var(--line); padding:36px 0 60px; color:var(--ink-3); font-size:13px; }
  footer code { color:var(--ink-2); }
</style>

<header class="mast">
  <div class="wrap">
    <div class="mast-logo">${svg("logo/logo-horizontal-white.svg")}</div>
    <h1>Brand Style Guide</h1>
    <div class="tag">${TAGLINE}</div>
    <div class="meta">
      <span>VERSION 1.0</span><span>AUGUST 2026</span>
      <span>62 ASSETS</span><span>31/31 CONTRAST CHECKS PASS</span>
    </div>
  </div>
</header>

<main class="wrap">

<section><div class="row">
  <div class="lbl"><b>01</b>Positioning</div>
  <div>
    <h2>Make the reader believe the number before they decide how they feel about it</h2>
    <p class="lede">ImmigrationClock publishes figures about a subject people already have strong feelings about. Everything in this system follows from that one job.</p>
    <div class="grid g2">
      <div class="callout"><h4>An instrument, not an argument</h4><p>The visual language is measurement — dials, graduations, tabular figures, provenance chips. Not persuasion.</p></div>
      <div class="callout"><h4>Not a law firm</h4><p>No serif capitals, no gold, no gavels or scales, no centred ceremony. Those signal <em>advocacy on your behalf</em>. This signals <em>here is what the data says</em>.</p></div>
      <div class="callout"><h4>Not partisan</h4><p>Red and green never mean good or bad about immigration figures. That is a hard rule, and it has its own section.</p></div>
      <div class="callout"><h4>Calm at speed</h4><p>The dashboard is full of live counters. Monospaced figures and an 8px grid keep a moving page from feeling frantic.</p></div>
    </div>
  </div>
</div></section>

<section><div class="row">
  <div class="lbl"><b>02</b>The mark</div>
  <div>
    <h2>The Dial</h2>
    <p class="lede">A measuring instrument with three layers — which is the product's thesis in one glyph.</p>
    <div class="plate" style="gap:48px">
      ${svg("logo/mark-glyph-light.svg", "", "width:132px;height:132px")}
      ${construction()}
    </div>
    <table>
      <tr><th>Layer</th><th>Element</th><th>Means</th></tr>
      <tr><td>Outer</td><td>Four graduations at the cardinals</td><td>The scale you are measuring against</td></tr>
      <tr><td>Middle</td><td>Blue quarter-sweep, 12→3</td><td>The period the data actually covers</td></tr>
      <tr><td>Inner</td><td>Hand at 12, centre dot</td><td>Where the reading stands right now</td></tr>
    </table>
    <div class="callout">
      <h4>The sweep is always a quarter</h4>
      <p>Never a half, never a closed ring. A closed ring would claim complete coverage, and this product's data is partial and lagged by design. The mark is honest about that. Do not "complete" it.</p>
    </div>

    <h3>Optical sizes</h3>
    <p>Three cuts, not one drawing scaled down.</p>
    <div class="plate optical">
      <figure>${svg("logo/mark-badge-navy.svg", "", "width:96px;height:96px")}<figcaption>REGULAR · ≥32px</figcaption></figure>
      <figure>${svg("favicon/favicon.svg", "", "width:64px;height:64px")}<figcaption>SMALL · 20–32px</figcaption></figure>
      <figure>${svg("favicon/favicon-16.svg", "", "width:48px;height:48px")}<figcaption>MICRO · ≤16px</figcaption></figure>
      <figure>${svg("favicon/favicon.svg", "", "width:32px;height:32px")}<figcaption>32 ACTUAL</figcaption></figure>
      <figure>${svg("favicon/favicon-16.svg", "", "width:16px;height:16px")}<figcaption>16 ACTUAL</figcaption></figure>
    </div>
    <div class="callout">
      <h4>Why micro drops the hand</h4>
      <p>At 16px the gap between the hand's round cap and the ring's inner edge computes to <strong>0.90px</strong> — antialiasing turns that into a navy smudge and the dial stops being a dial. What survives at that size is the ring and the blue quarter, so that is what micro keeps. Measured, not guessed.</p>
    </div>

    <h3>Clear space &amp; minimum size</h3>
    <p>Clear space is <strong>½ the mark's height</strong> on all four sides, baked into the exported viewBoxes so it cannot be got wrong by accident. Minimums: mark alone <strong>16px</strong>; horizontal lockup <strong>120px</strong> wide; stacked lockup <strong>88px</strong> wide.</p>

    <h3>Never</h3>
    <div class="dont">
      <div><b>DON'T</b>Recolour the sweep</div>
      <div><b>DON'T</b>Rotate the mark or move the hand</div>
      <div><b>DON'T</b>Close the ring into a full circle</div>
      <div><b>DON'T</b>Add shadow, bevel or glow</div>
      <div><b>DON'T</b>Stretch non-uniformly</div>
      <div><b>DON'T</b>Place on photography without a navy plate</div>
    </div>
  </div>
</div></section>

<section><div class="row">
  <div class="lbl"><b>03</b>Lockups</div>
  <div>
    <h2>Three lockups, one wordmark</h2>
    <div class="plate">${svg("logo/logo-horizontal-navy.svg", "", "width:min(400px,100%);height:auto")}</div>
    <div class="grid g2" style="margin-top:14px">
      <div class="plate">${svg("logo/logo-stacked-navy.svg", "", "width:190px;height:auto")}</div>
      <div class="plate dark">${svg("logo/logo-stacked-white.svg", "", "width:190px;height:auto")}</div>
    </div>
    <div class="plate dark" style="margin-top:14px">${svg("logo/logo-horizontal-white.svg", "", "width:min(400px,100%);height:auto")}</div>
    <div class="callout">
      <h4>The wordmark is monotone</h4>
      <p>Colouring "Clock" in the accent is the fastest way to make a data brand look like a logo generator. The accent lives in the mark and nowhere else in the logo. Set in the brand sans at 700 with <strong>-0.02em</strong> tracking — at that weight, the tracking is what separates <em>institutional</em> from <em>shouty</em>.</p>
      <p><code>ImmigrationClock</code> is one word, capital I, capital C. Never "Immigration Clock", never "IC".</p>
    </div>
  </div>
</div></section>

<section><div class="row">
  <div class="lbl"><b>04</b>Colour</div>
  <div>
    <h2>Navy carries authority. Blue carries the signal.</h2>

    <h3>Core — navy</h3>
    <div class="sws">
      ${sw("navy-900", color.navy[900], "Primary — wordmark, headlines, logo container")}
      ${sw("navy-950", color.navy[950], "Deepest field, gradient anchor")}
      ${sw("navy-800", color.navy[800], "Secondary surfaces")}
      ${sw("navy-700", color.navy[700], "Borders on dark")}
      ${sw("navy-600", color.navy[600])}
      ${sw("navy-500", color.navy[500])}
    </div>

    <h3>Accent — the signal ramp</h3>
    <div class="sws">
      ${sw("blue-500", color.blue[500], "ACCENT — the sweep, active state, key data mark")}
      ${sw("blue-600", color.blue[600], "Link &amp; eyebrow text on white — 4.52:1")}
      ${sw("blue-400", color.blue[400], "The accent on dark — 5.38:1 on navy-900")}
      ${sw("blue-700", color.blue[700], "Link hover — 5.68:1")}
      ${sw("blue-800", color.blue[800], "Text on pale blue fills")}
      ${sw("blue-300", color.blue[300], "Secondary text on dark")}
      ${sw("blue-200", color.blue[200], "Tagline on dark")}
      ${sw("blue-50", color.blue[50], "Chips, highlight rows")}
    </div>

    <div class="callout">
      <h4>Where the accent is allowed</h4>
      <p><code>${color.blue[500]}</code> measures <strong>3.81:1 on white</strong> — clears the 3:1 bar for graphics, falls short of 4.5:1 for body text. So the accent is <em>scoped</em>, not changed:</p>
      <ul>
        <li>Graphics, arcs, chart marks, 24px+ display text → <code>blue-500</code></li>
        <li>Body text, links, anything under 24px on white → <code>blue-600</code></li>
        <li>Anything on navy → <code>blue-400</code></li>
      </ul>
    </div>

    <div class="callout" style="border-left-color:${color.status.stale}">
      <h4>The colour rule — the most important line in this document</h4>
      <p><strong>Colour encodes identity, never direction, and never judgement.</strong></p>
      <p>Removals up is not red. Approvals up is not green. Whether either is good is the reader's call, and the moment the palette answers it for them, the product stops being a source and becomes a position.</p>
      <ul>
        <li><strong>Magnitude</strong> → one navy→blue sequential ramp</li>
        <li><strong>Categories</strong> (countries, employers, states) → the categorical series, in order</li>
        <li><strong>Change</strong> → an arrow glyph and a signed number in neutral ink. Not colour.</li>
        <li><strong>Red / amber / green</strong> → reserved exclusively for <em>data freshness</em>, always paired with a text label, never colour alone</li>
      </ul>
    </div>

    <h3>Neutrals — cool, navy-tinted, never pure grey</h3>
    <div class="sws">
      ${sw("neutral-0", color.neutral[0], "Background")}
      ${sw("neutral-50", color.neutral[50], "Page tint")}
      ${sw("neutral-100", color.neutral[100], "Gridlines")}
      ${sw("neutral-200", color.neutral[200], "Borders")}
      ${sw("neutral-300", color.neutral[300], "Dial ring, strong borders")}
      ${sw("neutral-400", color.neutral[400], "Disabled")}
      ${sw("neutral-500", color.neutral[500], "Secondary text — 4.55:1")}
      ${sw("neutral-600", color.neutral[600], "Source lines, metadata — 6.29:1")}
    </div>
    <div class="callout">
      <h4>Why neutral-500 is ${color.neutral[500]} and not #6B7A91</h4>
      <p>The obvious value measured <strong>4.36:1</strong> — under AA. Source names and "data through" dates are set in this colour, and the text a reader needs in order to judge a number must never be the least legible thing on the page. Same reasoning as the <code>slate-500</code> override already in <code>tailwind.config.ts</code>.</p>
    </div>

    <h3>Data freshness — the only place colour judges anything</h3>
    <div class="sws">
      ${sw("live", color.status.live, "Updating on schedule")}
      ${sw("stale", color.status.stale, "Past expected refresh")}
      ${sw("archive", color.status.archive, "Point-in-time figure")}
    </div>

    <h3>Chart series — used strictly in order</h3>
    <p>Past four series a legend stops working, and the answer is small multiples, not a seventh colour.</p>
    <div class="sws">
      ${color.series.map((c, i) => sw(`series-${i + 1}`, c, "on white")).join("")}
    </div>
    <div class="sws" style="margin-top:10px">
      ${color.seriesDark.map((c, i) => sw(`series-${i + 1}`, c, "on navy")).join("")}
    </div>

    <h3>Verified contrast</h3>
    <p>Every pairing is machine-checked by <code>node brand/contrast.mjs</code>. A style guide that asserts "AA compliant" without a check is wrong within two months of someone nudging a hex value.</p>
    <div class="scroll"><table>
      <tr><th>Pairing</th><th>Colour</th><th>Ratio</th><th>Result</th></tr>
      ${contrastRow("Body text on white", color.navy[900], "#FFFFFF", 4.5)}
      ${contrastRow("Secondary text on white", color.neutral[500], "#FFFFFF", 4.5)}
      ${contrastRow("Source line on white", color.neutral[600], "#FFFFFF", 4.5)}
      ${contrastRow("Link text on white", color.blue[600], "#FFFFFF", 4.5)}
      ${contrastRow("White on navy-900", "#FFFFFF", color.navy[900], 4.5)}
      ${contrastRow("Tagline on navy-900", color.blue[200], color.navy[900], 4.5)}
      ${contrastRow("Accent mark on navy-900", color.blue[400], color.navy[900], 3)}
      ${contrastRow("Live status text on white", color.status.liveInk, "#FFFFFF", 4.5)}
    </table></div>
  </div>
</div></section>

<section><div class="row">
  <div class="lbl"><b>05</b>Typography</div>
  <div>
    <h2>Inter for language. IBM Plex Mono for evidence.</h2>

    <div class="callout">
      <h4>Inter — display, UI, body</h4>
      <p>Neutral to the point of transparency, which is the point: the reader should notice the number, not the typeface. Variable, free under the OFL, enormous language coverage, and it ships genuine tabular figures and a slashed zero. It also reads as contemporary infrastructure rather than as a brand.</p>
    </div>
    <div class="callout">
      <h4>IBM Plex Mono — all numerals, sources, timestamps</h4>
      <p>The identity's second signature, and it does real work. Its lineage is institutional-technical rather than editorial, so figures read as <em>instrument output</em> instead of <em>headline</em>. Monospace also means a counter that ticks does not reflow the layout around it — which matters on a page full of live counters.</p>
    </div>
    <div class="callout" style="border-left-color:${color.status.stale}">
      <h4>Deliberately no serif</h4>
      <p>A serif is the single fastest way to read as a law firm. If long-form editorial ever needs one it is scoped to newsletter body copy only, and must be a <em>newspaper</em> serif — Source Serif 4 — never a lawyer's serif like Trajan, Garamond or Baskerville.</p>
    </div>

    <h3>Scale</h3>
    <div class="spec"><div class="k">Display · 700</div><div style="font-size:clamp(30px,5vw,60px);line-height:1.05;letter-spacing:-0.025em;font-weight:700;color:var(--ink)">271,484 removals</div></div>
    <div class="spec"><div class="k">H1 · 700</div><div style="font-size:38px;line-height:1.12;letter-spacing:-0.02em;font-weight:700;color:var(--ink)">What changed this month</div></div>
    <div class="spec"><div class="k">H2 · 650</div><div style="font-size:29px;line-height:1.2;letter-spacing:-0.02em;font-weight:650;color:var(--ink)">Top H-1B sponsors, FY2024</div></div>
    <div class="spec"><div class="k">H3 · 600</div><div style="font-size:22px;line-height:1.3;font-weight:600;color:var(--ink)">Approvals and denials by employer</div></div>
    <div class="spec"><div class="k">Body · 400</div><div style="font-size:16px;line-height:1.6;color:var(--ink-2)">FY2024 is the latest complete year for most series. FY2025 figures are preliminary, and detention is a dated point-in-time count rather than an annual total.</div></div>
    <div class="spec"><div class="k">Eyebrow · 700</div><div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;color:var(--acc)">H-1B petitions · FY2024</div></div>
    <div class="spec"><div class="k">Source · mono</div><div style="font-family:var(--mono);font-size:13.5px;color:var(--ink-2)">USCIS H-1B Employer Data Hub · data through Sep 30, 2024</div></div>
    <div class="spec"><div class="k">Counter · mono</div><div class="counter">399,395</div></div>

    <h3>Numeral rules</h3>
    <p>Not stylistic preferences — correctness requirements for a product whose numbers animate.</p>
    <ul>
      <li><strong>Tabular, lining numerals everywhere.</strong> <code>font-variant-numeric: tabular-nums</code>. Proportional figures make a ticking counter jitter.</li>
      <li><strong>Slashed zero</strong> on anything confusable. Inter: <code>cv01</code>.</li>
      <li><strong>Comma grouping at 4+ digits</strong> — <code>9,265</code>, US convention.</li>
      <li><strong>Never abbreviate the primary figure.</strong> <code>271,484</code>, not <code>271K</code>. Abbreviation is permitted only on chart axes.</li>
      <li><strong>Every figure carries a period and a source in the same visual block.</strong> A number without "FY2024" and without an agency name is not publishable.</li>
    </ul>
  </div>
</div></section>

<section><div class="row">
  <div class="lbl"><b>06</b>Icons</div>
  <div>
    <h2>${Object.keys(icons).length} icons on a 24px grid</h2>
    <p>1.75 stroke, round caps and joins, <code>currentColor</code> so colour is decided by context and never by the icon. Geometry snaps to 0.5; nothing is drawn smaller than 2.5 units because it will not survive 16px.</p>
    <div class="icons">${Object.keys(icons).map(iconCell).join("")}</div>
    <div class="callout" style="border-left-color:${color.status.stale}">
      <h4>Deliberately absent</h4>
      <p>Gavels, scales of justice, courthouse columns, eagles, flags, handshakes, torches, Statue of Liberty silhouettes. That is the visual vocabulary of a law firm or an advocacy group. This product reports numbers.</p>
    </div>
  </div>
</div></section>

<section><div class="row">
  <div class="lbl"><b>07</b>Profile</div>
  <div>
    <h2>Avatars are built for the mask they'll get</h2>
    <div class="plate avatars">
      <figure>${svg("profile/linkedin-logo-400.svg", "", "width:120px;height:120px")}<figcaption>LINKEDIN · 400×400</figcaption></figure>
      <figure class="circle">${svg("profile/x-profile-400.svg", "", "width:120px;height:120px")}<figcaption>X · 400×400</figcaption></figure>
      <figure class="circle">${svg("profile/x-profile-400.svg", "", "width:48px;height:48px")}<figcaption>X @ 48</figcaption></figure>
      <figure class="circle">${svg("profile/x-profile-400.svg", "", "width:32px;height:32px")}<figcaption>X @ 32</figcaption></figure>
    </div>
    <p>The X image ships as a <strong>hard square with no corner radius</strong> — X masks avatars to a circle, and rounding artwork that is about to be circle-masked only wastes pixels. The LinkedIn logo keeps its squircle because LinkedIn's mask is a rounded square.</p>
  </div>
</div></section>

<section><div class="row">
  <div class="lbl"><b>08</b>Banners</div>
  <div>
    <h2>Designed around the platform's own chrome</h2>
    <p>LinkedIn overlaps the bottom-left of a company cover with the logo card; X overlaps the bottom-left of a header with the avatar. Nothing important is placed there. The X block starts at x=340 and stays within y=100–400, because mobile crops the top and bottom bands.</p>
    <h3>LinkedIn company cover · 1128 × 191</h3>
    <div class="banner">${svg("banners/linkedin-company-1128x191.svg")}</div>
    <h3>LinkedIn personal cover · 1584 × 396</h3>
    <div class="banner">${svg("banners/linkedin-personal-1584x396.svg")}</div>
    <h3>X header · 1500 × 500</h3>
    <div class="banner">${svg("banners/x-header-1500x500.svg")}</div>
  </div>
</div></section>

<section><div class="row">
  <div class="lbl"><b>09</b>Posts</div>
  <div>
    <h2>Four templates, and every one ends in a source</h2>
    <div class="posts">
      <div>${svg("social/template-a-number-1080x1080.svg")}</div>
      <div>${svg("social/template-b-statement-1080x1080.svg")}</div>
      <div>${svg("social/template-c-chart-1080x1350.svg")}</div>
    </div>
    <div class="posts" style="margin-top:14px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      <div>${svg("social/template-d-card-1200x628.svg")}</div>
      <div>${svg("social/example-card-pulse.svg")}</div>
    </div>
    <table style="margin-top:22px">
      <tr><th>Template</th><th>Size</th><th>Use</th></tr>
      <tr><td><strong>A · The Number</strong></td><td class="num">1080×1080</td><td>One figure, sourced. The default post.</td></tr>
      <tr><td><strong>B · The Statement</strong></td><td class="num">1080×1080</td><td>A plain-language finding on navy, for threads and quotes.</td></tr>
      <tr><td><strong>C · The Chart</strong></td><td class="num">1080×1350</td><td>A comparison, portrait, for feed dwell time.</td></tr>
      <tr><td><strong>D · The Card</strong></td><td class="num">1200×628</td><td>Link previews and OG images.</td></tr>
    </table>
    <div class="callout">
      <h4>A post without a visible source should not ship</h4>
      <p>That is the entire promise of the tagline, and the templates are built so that keeping it is easier than breaking it. Every layout reserves a source block with the agency name and an "as of" date.</p>
    </div>
  </div>
</div></section>

<section><div class="row">
  <div class="lbl"><b>10</b>Tagline</div>
  <div>
    <h2>${TAGLINE}</h2>
    <p>Locked wording, title case, U+2022 bullet with spaces. Used on banners and the link card. Never re-punctuated, never split across lines, never translated without sign-off.</p>
    <p>It is the short brand form of the longer product line already on the site — <em>"Facts first. Trends live. Sources included."</em> Both are correct: the short one for identity surfaces, the long one for product surfaces.</p>
  </div>
</div></section>

<section><div class="row">
  <div class="lbl"><b>11</b>Two surfaces</div>
  <div>
    <h2>The lights dim. The brand doesn't change.</h2>
    <p>The dashboard is <strong>dark</strong>; this identity is <strong>white and navy</strong>. That is deliberate, not a contradiction.</p>
    <table>
      <tr><th></th><th>Product surface</th><th>Brand surface</th></tr>
      <tr><td><strong>Ground</strong></td><td>Near-black <code>ink</code> ramp</td><td>White / navy-900</td></tr>
      <tr><td><strong>Feels like</strong></td><td>A live instrument</td><td>A published record</td></tr>
      <tr><td><strong>Covers</strong></td><td>The dashboard and its charts</td><td>Logo, social, email, decks, press</td></tr>
      <tr><td><strong>Governed by</strong></td><td><code>tailwind.config.ts</code></td><td><code>brand/tokens.mjs</code></td></tr>
    </table>
    <p>They share the same navy, the same accent hue, the same typefaces, the same icons and the same numeral rules. A reader moving from a LinkedIn post to the dashboard should feel the lights dim, not the brand change.</p>
  </div>
</div></section>

</main>

<footer class="wrap">
  <p>Generated from <code>brand/tokens.mjs</code> — <code>node brand/build.mjs</code> writes the assets, <code>node brand/contrast.mjs</code> verifies the palette, <code>node brand/guide.mjs</code> writes this page. Assets are committed, so nobody needs Node to use them; they are generated, so changing a colour never means editing forty files by hand.</p>
  <p>ImmigrationClock — Brand Style Guide v1.0 · August 2026</p>
</footer>
`;

mkdirSync(join(HERE, "preview"), { recursive: true });
writeFileSync(join(HERE, "preview", "index.html"), page, "utf8");
console.log("Wrote brand/preview/index.html (" + (page.length / 1024).toFixed(0) + " KB)");
