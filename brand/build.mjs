/**
 * Generates every brand asset from tokens.mjs.
 *
 *   node brand/build.mjs
 *
 * Assets are committed, so nobody needs Node to use them — but they are
 * generated, so changing a colour never means editing 40 files by hand.
 */

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { color, font, TAGLINE, NAME, DOMAIN } from "./tokens.mjs";
import { dial, badge, glyph } from "./lib/mark.mjs";
import { lockupHorizontal, lockupStacked } from "./lib/lockup.mjs";
import {
  linkedinCompanyBanner,
  linkedinPersonalBanner,
  xBanner,
} from "./lib/social.mjs";
import { postNumber, postStatement, postChart, postCard } from "./lib/posts.mjs";
import { icons, iconSvg, iconSprite } from "./lib/icons.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "assets");

const written = [];
function emit(rel, contents) {
  const path = join(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
  written.push(rel.replace(/\\/g, "/"));
}

rmSync(ROOT, { recursive: true, force: true });

/* ── 1. Logo ───────────────────────────────────────────────────────────── */

emit("logo/mark-badge-navy.svg", badge({ size: 256 }));
emit(
  "logo/mark-badge-white.svg",
  badge({
    size: 256,
    bg: "#FFFFFF",
    ringColor: color.neutral[300],
    arcColor: color.blue[500],
    handColor: color.navy[900],
    tickColor: color.neutral[300],
  })
);
emit("logo/mark-glyph-light.svg", glyph({ size: 256 }));
emit(
  "logo/mark-glyph-dark.svg",
  glyph({
    size: 256,
    ringColor: "rgba(255,255,255,0.30)",
    arcColor: color.blue[400],
    handColor: "#FFFFFF",
    tickColor: "rgba(255,255,255,0.45)",
  })
);
// Single-colour cuts, for embossing, faxes, sponsor walls and anything that
// cannot honour the accent. The arc keeps its identity through weight alone.
emit(
  "logo/mark-glyph-mono-navy.svg",
  glyph({
    size: 256,
    ringColor: "rgba(16,42,67,0.28)",
    arcColor: color.navy[900],
    handColor: color.navy[900],
    tickColor: "rgba(16,42,67,0.45)",
  })
);
emit(
  "logo/mark-glyph-mono-white.svg",
  glyph({
    size: 256,
    ringColor: "rgba(255,255,255,0.32)",
    arcColor: "#FFFFFF",
    handColor: "#FFFFFF",
    tickColor: "rgba(255,255,255,0.5)",
  })
);

emit("logo/logo-horizontal-navy.svg", lockupHorizontal({ markSize: 64 }));
emit(
  "logo/logo-horizontal-white.svg",
  lockupHorizontal({ markSize: 64, onDark: true })
);
emit("logo/logo-stacked-navy.svg", lockupStacked({ markSize: 96 }));
emit(
  "logo/logo-stacked-white.svg",
  lockupStacked({ markSize: 96, onDark: true })
);

/* ── 2. Profile images ─────────────────────────────────────────────────── */

// LinkedIn company logo: uploaded at 400×400, displayed ~300×300 and masked to
// a rounded square. Keeping the corner radius in the artwork means the mask
// never clips the mark, whatever LinkedIn does next.
emit("profile/linkedin-logo-400.svg", badge({ size: 400, inset: 0.62 }));
emit(
  "profile/linkedin-logo-400-white.svg",
  badge({
    size: 400,
    inset: 0.62,
    bg: "#FFFFFF",
    ringColor: color.neutral[300],
    arcColor: color.blue[500],
    handColor: color.navy[900],
    tickColor: color.neutral[300],
  })
);

// X masks avatars to a circle, so the artwork ships as a full square with no
// corner radius — rounding it would only waste pixels the mask throws away.
emit("profile/x-profile-400.svg", badge({ size: 400, radius: 0, inset: 0.58 }));
emit(
  "profile/x-profile-400-white.svg",
  badge({
    size: 400,
    radius: 0,
    inset: 0.58,
    bg: "#FFFFFF",
    ringColor: color.neutral[300],
    arcColor: color.blue[500],
    handColor: color.navy[900],
    tickColor: color.neutral[300],
  })
);

/* ── 3. Banners ────────────────────────────────────────────────────────── */

emit("banners/linkedin-company-1128x191.svg", linkedinCompanyBanner());
emit("banners/linkedin-personal-1584x396.svg", linkedinPersonalBanner());
emit("banners/x-header-1500x500.svg", xBanner());

/* ── 4. Post templates ─────────────────────────────────────────────────── */

emit("social/template-a-number-1080x1080.svg", postNumber());
emit("social/template-b-statement-1080x1080.svg", postStatement());
emit("social/template-c-chart-1080x1350.svg", postChart());
emit("social/template-d-card-1200x628.svg", postCard());
// Worked second examples, so the templates read as a system rather than a one-off.
emit(
  "social/example-number-removals.svg",
  postNumber({
    eyebrow: "ICE REMOVALS · FY2024",
    value: "271,484",
    label: "removals carried out by ICE",
    context: "Up from 142,580 in FY2023.",
    delta: "90.4% vs FY2023",
    source: "ICE Annual Report FY2024, Table 1",
    asOf: "Data through Sep 30, 2024",
  })
);
emit(
  "social/example-card-pulse.svg",
  postCard({
    headline: "Immigration Pulse",
    sub: "What changed in the data this month — in one email, every Tuesday.",
  })
);

/* ── 5. Favicons & app icons ───────────────────────────────────────────── */

// Below ~24px the graduations fill in and the hand disappears, so every small
// size uses the `small` optical cut: no ticks, heavier strokes.
emit(
  "favicon/favicon.svg",
  badge({ size: 32, optical: "small", inset: 0.74, radius: 0.22 })
);
emit(
  "favicon/favicon-16.svg",
  // micro cut: ring + sweep only. The hand's cap sits 0.90px from the ring at
  // this size and antialiases into a blob — verified, not assumed.
  badge({ size: 16, optical: "micro", inset: 0.85, radius: 0.19 })
);
emit(
  "favicon/apple-touch-icon-180.svg",
  // iOS applies its own superellipse mask — ship a hard square and leave room.
  badge({ size: 180, optical: "small", inset: 0.6, radius: 0 })
);
emit(
  "favicon/maskable-512.svg",
  // Android maskable icons may crop to the central 80%; stay well inside it.
  badge({ size: 512, optical: "small", inset: 0.5, radius: 0 })
);
emit(
  "favicon/safari-pinned-tab.svg",
  // Safari pinned tabs are recoloured to a single flat colour; ship pure black
  // on transparent and let the browser tint it.
  glyph({
    size: 64,
    optical: "small",
    ringColor: "#000000",
    arcColor: "#000000",
    handColor: "#000000",
  })
);

/* ── 6. Icon set ───────────────────────────────────────────────────────── */

for (const name of Object.keys(icons)) {
  emit(`icons/${name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}.svg`, iconSvg(name));
}
emit("icons/sprite.svg", iconSprite());

/* ── 7. Engineering handoff ────────────────────────────────────────────── */

function flatten(obj, prefix = []) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, [...prefix, k]));
    } else if (Array.isArray(v)) {
      v.forEach((c, i) => (out[[...prefix, k, i + 1].join("-")] = c));
    } else {
      out[[...prefix, k].join("-")] = v;
    }
  }
  return out;
}

const flat = flatten(color);
emit(
  "tokens/colors.json",
  JSON.stringify({ color, font, tagline: TAGLINE, name: NAME, domain: DOMAIN }, null, 2) + "\n"
);
emit(
  "tokens/colors.css",
  `/* ImmigrationClock brand tokens — generated by brand/build.mjs. Do not edit. */\n:root {\n` +
    Object.entries(flat)
      .map(([k, v]) => `  --ic-${k}: ${v};`)
      .join("\n") +
    `\n  --ic-font-sans: ${font.sans};\n  --ic-font-mono: ${font.mono};\n}\n`
);

console.log(`Wrote ${written.length} assets to brand/assets/`);
for (const f of written) console.log("  " + f);
