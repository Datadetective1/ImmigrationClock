#!/usr/bin/env node
/**
 * Brand asset export — rendered FROM production, not designed alongside it.
 *
 * Every value below was read out of the live site (https://immigrationclock.com)
 * with getComputedStyle, and cross-checked against the source it comes from:
 *
 *   tokens ............ tailwind.config.ts  (ink / accent / status / shadows)
 *   page surface ...... src/app/globals.css (body background + the two radials)
 *   the mark .......... src/components/Navbar.tsx (the 32px gradient badge)
 *   the wordmark ...... src/components/Navbar.tsx (mono, 700, tracking-tight)
 *   hero typography ... src/app/page.tsx    (h1 800 / -0.025em, gradient span)
 *   button ............ src/app/page.tsx    (accent fill, ink-950 ink, shadow-card)
 *   card .............. globals.css `.panel` + `.eyebrow` + `.chip`
 *
 * Nothing here is a new design decision. If production changes, change it there
 * and re-run this script — that is the whole point of generating rather than
 * drawing.
 *
 * Rendering is headless Chrome at 1x, so a 1200x630 export is 1200x630 real
 * pixels and is crisp at 100% zoom. Transparent exports use Chrome's
 * --default-background-color=00000000.
 *
 * Usage:  npm run brand:assets
 *         CHROME_PATH="/path/to/chrome" npm run brand:assets
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "brand");
const WORK = join(tmpdir(), "immigrationclock-brand-build");

/* ------------------------------------------------------------------ tokens */

// tailwind.config.ts
const T = {
  ink950: "#05070d",
  ink900: "#0a0e1a",
  ink850: "#0f1424",
  ink800: "#141a2e",
  ink700: "#1c2440",
  accent: "#38bdf8",
  accentSoft: "#7dd3fc",
  red: "#f43f5e",
  green: "#22c55e",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#8b98ad", // the accessibility override, not Tailwind's default
  white: "#ffffff",
};

// globals.css :root. Single-quoted family names, not double: these stacks are
// interpolated into `style="..."` attributes, and a double quote there ends the
// attribute and silently drops every declaration after it.
const SANS = `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, 'Roboto Mono', Menlo, monospace`;

// globals.css body — the page surface, verbatim.
const HERO_BG =
  `radial-gradient(1200px 600px at 70% -10%, rgba(56,189,248,0.08), transparent 60%),` +
  `radial-gradient(900px 500px at 0% 0%, rgba(244,63,94,0.06), transparent 55%)`;

// tailwind.config.ts boxShadow.card
const SHADOW_CARD =
  `0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 30px -18px rgba(0,0,0,0.9)`;

// The hero's gradient headline span: from-accent via-accent-soft to-status-red
const TEXT_GRADIENT = `linear-gradient(to right, ${T.accent}, ${T.accentSoft}, ${T.red})`;

// The mark's fill: bg-gradient-to-br from-accent to-status-red
const MARK_GRADIENT = `linear-gradient(to bottom right, ${T.accent}, ${T.red})`;

const TIGHT = "-0.025em"; // tracking-tight

/* -------------------------------------------------------------------- mark */

/**
 * The mark, straight off the navbar.
 *
 *   32x32, rounded-lg (8px = 25%), filled with the accent->red diagonal
 *   an 8px ink-950 dot dead centre
 *   a 2x14 ink-950 hand, centre (16,12), rotated 45deg
 *
 * The hand's geometry is not eyeballed: Tailwind's `-translate-y-1 rotate-45`
 * on an absolutely-centred 2x14 bar puts its centre at (16,12) and its ends at
 * (11.05,16.95) and (20.95,7.05). `rotate(45 16 12)` in SVG is the same
 * transform in the same direction.
 */
function markSvg(size, { id = "icon-mark", square = false } = {}) {
  const r = square ? 0 : 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" role="img" aria-label="ImmigrationClock">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${T.accent}"/>
      <stop offset="1" stop-color="${T.red}"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="${r}" fill="url(#${id})"/>
  <circle cx="16" cy="16" r="4" fill="${T.ink950}"/>
  <rect x="15" y="5" width="2" height="14" fill="${T.ink950}" transform="rotate(45 16 12)"/>
</svg>`;
}

/**
 * The horizontal lockup, straight off the navbar: mark, 10px gap at 1x, then
 * the wordmark over "Facts first".
 *
 * `k` is the navbar's own scale: k=1 is the 32px header lockup.
 */
function lockup(k, mode = "dark", { id = "" } = {}) {
  const word = mode === "light" ? T.ink950 : T.white;
  // slate-500 is tuned for ink-950. On a light surface it fails, so the light
  // lockup drops the same ink-950 back to 55% rather than introducing a colour
  // that does not exist in the palette.
  const sub = mode === "light" ? "rgba(5,7,13,0.55)" : T.slate500;
  return `<div ${id ? `id="${id}"` : ""} style="display:inline-flex;align-items:center;gap:${10 * k}px">
    ${markSvg(32 * k, { id: `mk-${mode}-${k}` })}
    <span style="display:flex;flex-direction:column;line-height:1">
      <span style="font-family:${MONO};font-size:${14 * k}px;font-weight:700;letter-spacing:${TIGHT};color:${word}">Immigration<span style="color:${T.accent}">Clock</span></span>
      <span style="font-family:${SANS};font-size:${10 * k}px;text-transform:uppercase;letter-spacing:0.2em;color:${sub};margin-top:${1.5 * k}px">Facts first</span>
    </span>
  </div>`;
}

/* ----------------------------------------------------------- page assembly */

function page(w, h, body, { transparent = false, css = "" } = {}) {
  const surface = transparent
    ? "background:transparent"
    : `background-color:${T.ink950};background-image:${HERO_BG}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{${surface};font-family:${SANS};color:${T.slate200};-webkit-font-smoothing:antialiased}
.grad{background-image:${TEXT_GRADIENT};-webkit-background-clip:text;background-clip:text;color:transparent}
.mono{font-family:${MONO}}
/* globals.css .eyebrow */
.eyebrow{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;color:rgba(125,211,252,0.8)}
/* globals.css .chip */
.chip{display:inline-flex;align-items:center;gap:4px;border-radius:9999px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);padding:4px 10px;font-size:12px;font-weight:500;color:${T.slate300}}
/* page.tsx primary CTA */
.cta{display:inline-block;border-radius:8px;background:${T.accent};color:${T.ink950};padding:12px 24px;font-size:16px;font-weight:600;line-height:24px;box-shadow:${SHADOW_CARD}}
/* globals.css .panel */
.panel{border-radius:16px;border:1px solid rgba(255,255,255,0.05);background:rgba(15,20,36,0.7);box-shadow:${SHADOW_CARD}}
.h1{font-weight:800;letter-spacing:${TIGHT};color:${T.white};line-height:1.05}
.stack{position:absolute;inset:0;display:flex;flex-direction:column}
${css}
</style></head><body>${body}</body></html>`;
}

/** The hero's live pill, dot and all. */
function pill(text, fs = 12) {
  return `<span style="display:inline-flex;align-items:center;gap:8px;border-radius:9999px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);padding:${fs / 3}px ${fs}px;font-size:${fs}px;color:${T.slate300}">
    <span style="width:${fs * 0.67}px;height:${fs * 0.67}px;border-radius:9999px;background:${T.green};display:block"></span>${text}
  </span>`;
}

/* ------------------------------------------------------------------ chrome */

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) {
    throw new Error(
      "No Chrome/Edge found. Set CHROME_PATH to a Chromium binary and re-run."
    );
  }
  return hit;
}

const CHROME = findChrome();

const BASE_FLAGS = [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  // Production sets `antialiased` (grayscale). Subpixel AA would not match, and
  // would fringe the transparent exports.
  "--disable-lcd-text",
  "--no-first-run",
  "--no-default-browser-check",
];

function chrome(args) {
  execFileSync(CHROME, [...BASE_FLAGS, ...args], { stdio: ["ignore", "pipe", "pipe"] });
}

/** Renders `html` at exactly w x h and writes a PNG. */
function shoot(name, w, h, html, { transparent = false } = {}) {
  const src = join(WORK, `${name}.html`);
  const dest = join(OUT, `${name}.png`);
  writeFileSync(src, html, "utf8");
  chrome([
    `--default-background-color=${transparent ? "00000000" : "ff05070d"}`,
    `--screenshot=${dest}`,
    `--window-size=${w},${h}`,
    `file:///${src.replace(/\\/g, "/")}`,
  ]);
  const png = readFileSync(dest);
  const gw = png.readUInt32BE(16);
  const gh = png.readUInt32BE(20);
  if (gw !== w || gh !== h) {
    throw new Error(`${name}.png rendered ${gw}x${gh}, expected ${w}x${h}`);
  }
  console.log(`  ${name}.png  ${gw}x${gh}  ${(png.length / 1024).toFixed(1)} KB`);
  return png;
}

/** Reads a laid-out element's real size back out of Chrome, for tight crops. */
function measure(html) {
  const src = join(WORK, "measure.html");
  writeFileSync(src, html, "utf8");
  const dom = execFileSync(
    CHROME,
    [...BASE_FLAGS, "--dump-dom", `file:///${src.replace(/\\/g, "/")}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  const m = dom.match(/data-measured="(\d+)x(\d+)"/);
  if (!m) throw new Error("measurement pass produced no result");
  return { w: Number(m[1]), h: Number(m[2]) };
}

/* ------------------------------------------------------------------- ico */

/**
 * A PNG-payload .ico. Every browser in support since IE11 reads these, and it
 * keeps the 32px entry pixel-identical to favicon-32.png rather than
 * re-encoding it as a BMP.
 */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

/* ------------------------------------------------------------------ build */

mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });
console.log(`Rendering with: ${CHROME}\n`);

/* --- 1. Vector masters ------------------------------------------------- */

writeFileSync(join(OUT, "mark.svg"), markSvg(256, { id: "ic-mark" }) + "\n", "utf8");
console.log("  mark.svg");

/* --- 2. Logo lockups (transparent) ------------------------------------- */

const K = 4; // 4x the navbar lockup: a 128px mark, a 56px wordmark
const PAD = Math.round(32 * K * 0.2); // clear space, proportional to the mark

const probe = measure(
  page(
    1600,
    600,
    `<div style="position:absolute;top:0;left:0">${lockup(K, "dark", { id: "L" })}</div>
     <script>
       var r = document.getElementById('L').getBoundingClientRect();
       document.documentElement.setAttribute('data-measured', Math.ceil(r.width) + 'x' + Math.ceil(r.height));
     </script>`,
    { transparent: true }
  )
);

const LW = probe.w + PAD * 2;
const LH = probe.h + PAD * 2;

function lockupPage(mode) {
  return page(
    LW,
    LH,
    `<div style="width:${LW}px;height:${LH}px;display:flex;align-items:center;justify-content:center">${lockup(K, mode)}</div>`,
    { transparent: true }
  );
}

const darkLockup = lockupPage("dark");
shoot("logo", LW, LH, darkLockup, { transparent: true });
shoot("logo-dark", LW, LH, darkLockup, { transparent: true });
shoot("logo-light", LW, LH, lockupPage("light"), { transparent: true });

/* --- 3. Icons ----------------------------------------------------------- */

function iconPage(size, { square = false } = {}) {
  return page(size, size, markSvg(size, { id: "ic", square }), { transparent: true });
}

const favicon48 = shoot("favicon-48", 48, 48, iconPage(48), { transparent: true });
const favicon32 = shoot("favicon-32", 32, 32, iconPage(32), { transparent: true });
const favicon16 = shoot("favicon-16", 16, 16, iconPage(16), { transparent: true });

// Apple masks its own corners, so the touch icon ships full-bleed and opaque.
shoot("apple-touch-icon", 180, 180, iconPage(180, { square: true }));

// Profile avatars: full-bleed, exactly as the mark sits in the header.
shoot("linkedin-profile", 300, 300, iconPage(300), { transparent: true });
shoot("twitter-profile", 400, 400, iconPage(400), { transparent: true });

writeFileSync(
  join(OUT, "favicon.ico"),
  buildIco([
    { size: 16, data: favicon16 },
    { size: 32, data: favicon32 },
    { size: 48, data: favicon48 },
  ])
);
console.log("  favicon.ico  16+32+48");

// favicon-48 is an ICO ingredient, not a deliverable.
rmSync(join(OUT, "favicon-48.png"));

/* --- 4. LinkedIn cover banner 1128x191 ---------------------------------- */

/**
 * The homepage hero, adapted — not redesigned.
 *
 * Two constraints shape the layout and neither is aesthetic: LinkedIn overlays
 * the company logo on the banner's lower-left, and 191px is not enough height
 * for the hero's centred stack. So the left ~220px stays empty (which is also
 * the whitespace the brief asks for), the hero's headline and gradient span
 * move to a left-aligned column, and the lockup + CTA sit right.
 */
shoot(
  "linkedin-banner",
  1128,
  191,
  page(
    1128,
    191,
    `<div style="position:absolute;inset:0;display:flex;align-items:center;padding:0 48px 0 232px;gap:40px">
       <div style="flex:1">
         <div class="h1" style="font-size:26px;line-height:1.24">
           Track every U.S. immigration change,<br>
           <span class="grad">back to the official source.</span>
         </div>
         <p style="margin-top:12px;font-size:11.5px;line-height:1.5;color:${T.slate500};max-width:560px">
           Rules, executive actions, agency guidance, court decisions, visa updates, and
           employer changes, all traced back to the official government source.
         </p>
       </div>
       <div style="display:flex;flex-direction:column;align-items:flex-end;gap:16px;flex:none">
         ${lockup(1.35, "dark")}
         <span class="cta" style="font-size:14px;padding:9px 18px;line-height:20px">immigrationclock.com</span>
       </div>
     </div>`
  )
);

/* --- 5. X header 1500x500 ----------------------------------------------- */

/**
 * X overlays the avatar on the lower-left and crops the top and bottom on
 * narrow viewports, so everything that matters is centred and inset.
 */
shoot(
  "twitter-header",
  1500,
  500,
  page(
    1500,
    500,
    `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:0 120px">
       ${lockup(2.2, "dark")}
       <div class="h1" style="font-size:44px;text-align:center;line-height:1.14;margin-top:6px">
         Track every U.S. immigration change,<br>
         <span class="grad">back to the official source</span>
       </div>
       <p style="font-size:17px;line-height:1.5;color:${T.slate300};text-align:center;max-width:820px">
         Rules, executive actions, agency guidance and court decisions — each linked to the
         government document it came from.
       </p>
       <span class="mono" style="font-size:14px;color:${T.slate500};letter-spacing:0.04em;margin-top:2px">immigrationclock.com</span>
     </div>`
  )
);

/* --- 6. Open Graph 1200x630 and GitHub 1280x640 -------------------------- */

/**
 * The homepage as a card: navbar lockup where the navbar puts it, the hero
 * centred underneath, the same pill, the same gradient headline, the same
 * button. The only thing invented is the crop.
 */
function heroCard(w, h) {
  return page(
    w,
    h,
    `<div style="position:absolute;top:${Math.round(h * 0.089)}px;left:${Math.round(w * 0.053)}px">${lockup(1.6, "dark")}</div>
     <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:0 96px">
       ${pill("Facts first. Freshness labelled. Sources included.", 14)}
       <!-- No hand-set line break: the hero's h1 carries text-balance, so the
            wrap is left to the same algorithm production uses. -->
       <div class="h1" style="font-size:${Math.round(w * 0.0467)}px;text-align:center;line-height:1.1;text-wrap:balance;max-width:${Math.round(w * 0.86)}px">
         Track every U.S. immigration change,
         <span class="grad">back to the official source</span>
       </div>
       <p style="font-size:20px;line-height:1.55;color:${T.slate300};text-align:center;text-wrap:balance;max-width:${Math.round(w * 0.6)}px">
         Rules, executive actions, agency guidance and court decisions — each linked to the
         government document it came from, and what that document says about who it affects.
       </p>
       <span class="cta" style="margin-top:8px">See what changed</span>
     </div>
     <div style="position:absolute;bottom:${Math.round(h * 0.073)}px;left:0;right:0;text-align:center">
       <span class="mono" style="font-size:15px;color:${T.slate500};letter-spacing:0.04em">immigrationclock.com</span>
     </div>`
  );
}

shoot("og-image", 1200, 630, heroCard(1200, 630));
shoot("github-social-preview", 1280, 640, heroCard(1280, 640));

/* --- 7. Reusable 1200x1200 social post template -------------------------- */

/**
 * A real template, not a mockup: swap the four TEMPLATE_* strings and re-run.
 * The card is globals.css `.panel`, the label is `.eyebrow`, the source row is
 * `.chip` plus the ProvenanceTag's "Reported" green — all lifted, none drawn.
 */
const TEMPLATE_EYEBROW = "Traced to the source";
const TEMPLATE_HEADLINE = "USCIS raises the H-1B registration fee to $215";
const TEMPLATE_BODY =
  "The fee applies to every registration submitted in the FY2027 cap season. " +
  "Employers filing at volume see the largest change.";
const TEMPLATE_SOURCE = "Federal Register · 90 FR 12345 · Final rule";

shoot(
  "social-template",
  1200,
  1200,
  page(
    1200,
    1200,
    `<div style="position:absolute;inset:0;display:flex;flex-direction:column;padding:80px">
       <div style="flex:none">${lockup(2, "dark")}</div>

       <!-- The card hugs its content and centres in the space left over, so a
            two-line headline and a five-line one both sit where the eye expects. -->
       <div style="flex:1;display:flex;align-items:center;padding:56px 0">
       <div class="panel" style="width:100%;padding:64px;display:flex;flex-direction:column">
         <div class="eyebrow" style="font-size:18px">${TEMPLATE_EYEBROW}</div>
         <div class="h1" style="font-size:64px;line-height:1.12;margin-top:24px">${TEMPLATE_HEADLINE}</div>
         <p style="margin-top:28px;font-size:26px;line-height:1.55;color:${T.slate300}">${TEMPLATE_BODY}</p>
         <div style="margin-top:44px;padding-top:32px;border-top:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;gap:14px;flex-wrap:wrap">
           <span class="chip" style="font-size:18px;padding:8px 18px">${TEMPLATE_SOURCE}</span>
           <span style="display:inline-flex;align-items:center;gap:6px;font-size:16px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${T.green}">✓ Reported</span>
         </div>
       </div>
       </div>

       <div style="flex:none;display:flex;align-items:center;justify-content:space-between">
         <span class="mono" style="font-size:24px;color:${T.slate500};letter-spacing:0.04em">immigrationclock.com</span>
         <span style="font-size:20px;color:${T.slate500}">Facts first. Sources included.</span>
       </div>
     </div>`
  )
);

console.log(`\nDone — ${OUT}`);
