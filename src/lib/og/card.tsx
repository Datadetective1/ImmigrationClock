// =============================================================================
// OPEN GRAPH CARD — one renderer, every story
//
// WHY THE SITE DRAWS ITS OWN CARDS
// --------------------------------
// Every link ImmigrationClock shared used to unfurl into the same homepage
// image, because buildMetadata() pointed every page at /brand/og-image.png.
// Measured on the live X account, that meant a post about a court order, a post
// about a fee rule and a post about layoff data all looked identical in the
// feed — and a reader deciding whether to tap had nothing to go on but the
// caption. A card that names the agency, states the headline and shows the
// status is the part of the post the platform actually renders large.
//
// WHY IT IS RENDERED AT BUILD, NOT ON REQUEST
// -------------------------------------------
// The route that serves these (src/app/og/[kind]/[file]/route.tsx) is
// force-static and enumerates every record, so each card is a plain PNG in the
// build output: no runtime, no cold start, no dependency that can fail when a
// crawler arrives. Satori and resvg run once per record at build time and never
// again.
//
// WHAT THE DESIGN IS
// ------------------
// The site's own look, not a new one: ink-950 with the two radial washes from
// globals.css, the navbar's gradient mark, the mono wordmark, the accent, the
// three status colours. Each card belongs to one family and is distinct per
// story through its eyebrow (the agency), its status pill (proposed, in effect,
// rescinded…) and, for data, the figure. Nothing here is a value a designer
// would recognise as new — see scripts/build-brand-assets.mjs for the same
// tokens rendered the same way.
//
// SATORI'S RULES, WHICH SHAPE THE MARKUP
// --------------------------------------
// Satori lays out with flexbox only. Every element with more than one child must
// declare `display: flex`; a text node may only sit in an element with no other
// children; there is no `grid`, no `float`, no line clamping. So the headline is
// capped by CHARACTER COUNT and its size is stepped down by length, which is the
// only way to guarantee it never runs off the bottom of a 630px canvas.
// =============================================================================

// Side-effect import, deliberately first: see the file for the one Windows bug
// it repairs and why it has to run before the first card renders.
import "./win32-og-shim";
import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HEADLINE_MAX_CHARS, fitText, headlineFontSize } from "./text";

export const OG_SIZE = { width: 1200, height: 630 } as const;

export type OgTone = "accent" | "amber" | "red" | "green" | "muted";

export interface OgCardSpec {
  /** Top right, mono, accent, uppercase: "USCIS", "EXPLAINER", "DATA SIGNAL". */
  eyebrow: string;
  /** The story, in one sentence. Trimmed and size-stepped by length. */
  headline: string;
  /** One quieter line under the headline, or under the figure on a data card. */
  kicker?: string;
  /** Bottom-left pill: "PROPOSED — NOT IN FORCE", "IN EFFECT SINCE MAR 3, 2026". */
  status?: string;
  statusTone?: OgTone;
  /** Bottom-right "Source: …" line. */
  source?: string;
  /** When set, the card leads with this number instead of the headline. */
  figure?: string;
  /** What the figure counts. Required to mean anything; shown under the figure. */
  figureLabel?: string;
}

// tailwind.config.ts / globals.css, by hand because Satori cannot read Tailwind.
const T = {
  ink950: "#05070d",
  accent: "#38bdf8",
  accentSoft: "#7dd3fc",
  red: "#f43f5e",
  amber: "#f59e0b",
  green: "#22c55e",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  // The accessibility override, not Tailwind's default.
  slate500: "#8b98ad",
  white: "#ffffff",
};

const TONE_COLOR: Record<OgTone, string> = {
  accent: T.accent,
  amber: T.amber,
  red: T.red,
  green: T.green,
  muted: T.slate400,
};

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// -----------------------------------------------------------------------------
// FONTS — IBM Plex, loaded once per process
//
// Read with readFileSync at module scope, as the Next.js docs do for Node
// route handlers. Satori wants a standalone ArrayBuffer; a Node Buffer's
// `.buffer` may be a shared slab with an offset, so it is sliced to exactly the
// file's bytes rather than handed over as-is.
// -----------------------------------------------------------------------------

const FONT_DIR = join(process.cwd(), "src", "lib", "og", "fonts");

function loadFont(file: string): ArrayBuffer {
  const buf = readFileSync(join(FONT_DIR, file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

type FontWeight = 400 | 500 | 600 | 700;
interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: FontWeight;
  style: "normal";
}

const FONTS: OgFont[] = [
  { name: "Plex Sans", data: loadFont("IBMPlexSans-Regular.ttf"), weight: 400, style: "normal" },
  { name: "Plex Sans", data: loadFont("IBMPlexSans-SemiBold.ttf"), weight: 600, style: "normal" },
  { name: "Plex Sans", data: loadFont("IBMPlexSans-Bold.ttf"), weight: 700, style: "normal" },
  { name: "Plex Mono", data: loadFont("IBMPlexMono-Medium.ttf"), weight: 500, style: "normal" },
  { name: "Plex Mono", data: loadFont("IBMPlexMono-Bold.ttf"), weight: 700, style: "normal" },
];

const SANS = "Plex Sans";
const MONO = "Plex Mono";

// -----------------------------------------------------------------------------
// TEXT FITTING — see ./text.ts; shared with the spec builders
// -----------------------------------------------------------------------------

export { HEADLINE_MAX_CHARS, fitText, headlineFontSize };

const KICKER_MAX_CHARS = 130;
const LABEL_MAX_CHARS = 110;
const SOURCE_MAX_CHARS = 64;

// -----------------------------------------------------------------------------
// THE MARK — the navbar badge, as SVG so its geometry is exact
//
// 32×32 rounded square filled accent→red, an ink dot dead centre, a 2×14 hand
// rotated 45° about (16,12). Same numbers as scripts/build-brand-assets.mjs,
// which read them off production.
// -----------------------------------------------------------------------------

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <linearGradient id="og-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color={T.accent} />
          <stop offset="1" stop-color={T.red} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#og-mark)" />
      <circle cx="16" cy="16" r="4" fill={T.ink950} />
      <rect x="15" y="5" width="2" height="14" fill={T.ink950} transform="rotate(45 16 12)" />
    </svg>
  );
}

// -----------------------------------------------------------------------------
// THE CARD
// -----------------------------------------------------------------------------

const PAD_X = 64;
const PAD_Y = 52;
const CONTENT_WIDTH = OG_SIZE.width - PAD_X * 2;

function Card({ spec }: { spec: OgCardSpec }) {
  const tone = TONE_COLOR[spec.statusTone ?? "accent"];
  const headline = fitText(spec.headline, HEADLINE_MAX_CHARS);
  const kicker = spec.kicker ? fitText(spec.kicker, KICKER_MAX_CHARS) : null;
  const isFigure = Boolean(spec.figure);
  // A data card shows its title once: as the kicker when one is set, otherwise
  // the headline. Signals set both to the same title.
  const figureCaption = kicker && kicker !== headline ? kicker : headline;

  return (
    <div
      style={{
        width: OG_SIZE.width,
        height: OG_SIZE.height,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: T.ink950,
        padding: `${PAD_Y}px ${PAD_X}px`,
        fontFamily: SANS,
        color: T.white,
      }}
    >
      {/* globals.css body: the two radial washes, one accent, one red. Satori's
          gradient parser takes no explicit ellipse size, so each wash is an
          oversized box positioned where the CSS puts the ellipse's centre
          (70% −10% and 0% 0%) and the gradient fills the box. */}
      <div
        style={{
          position: "absolute",
          top: -423,
          left: 140,
          width: 1400,
          height: 720,
          backgroundImage: "radial-gradient(ellipse at 50% 50%, rgba(56,189,248,0.13), rgba(56,189,248,0) 62%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -290,
          left: -520,
          width: 1040,
          height: 580,
          backgroundImage: "radial-gradient(ellipse at 50% 50%, rgba(244,63,94,0.10), rgba(244,63,94,0) 58%)",
        }}
      />
      {/* A tone-coloured rule along the top: the one element that changes with
          the story's status, so a proposal and a rule in force differ at a glance. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: OG_SIZE.width,
          height: 6,
          backgroundImage: `linear-gradient(to right, ${tone}, ${rgba(tone, 0)})`,
        }}
      />

      {/* Top row: lockup left, eyebrow right. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: CONTENT_WIDTH }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Mark size={44} />
          <div
            style={{
              marginLeft: 16,
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: "0.1em",
              color: T.white,
            }}
          >
            IMMIGRATIONCLOCK
          </div>
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontWeight: 500,
            fontSize: 20,
            letterSpacing: "0.18em",
            color: T.accent,
          }}
        >
          {fitText(spec.eyebrow, 40).toUpperCase()}
        </div>
      </div>

      {/* Middle: the story. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flexGrow: 1,
          width: CONTENT_WIDTH,
          paddingTop: 24,
          paddingBottom: 24,
        }}
      >
        {isFigure ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 120,
                lineHeight: 1,
                letterSpacing: "-0.03em",
                color: T.accent,
              }}
            >
              {fitText(spec.figure!, 16)}
            </div>
            {spec.figureLabel ? (
              <div
                style={{
                  marginTop: 18,
                  fontFamily: SANS,
                  fontWeight: 600,
                  fontSize: 30,
                  lineHeight: 1.25,
                  color: T.slate200,
                }}
              >
                {fitText(spec.figureLabel, LABEL_MAX_CHARS)}
              </div>
            ) : null}
            <div
              style={{
                marginTop: 18,
                fontFamily: SANS,
                fontWeight: 400,
                fontSize: 22,
                lineHeight: 1.35,
                color: T.slate400,
              }}
            >
              {fitText(figureCaption, KICKER_MAX_CHARS)}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: headlineFontSize(headline),
                lineHeight: 1.1,
                letterSpacing: "-0.025em",
                color: T.white,
              }}
            >
              {headline}
            </div>
            {kicker ? (
              <div
                style={{
                  marginTop: 22,
                  fontFamily: SANS,
                  fontWeight: 400,
                  fontSize: 26,
                  lineHeight: 1.35,
                  color: T.slate300,
                }}
              >
                {kicker}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Bottom row: status pill left, source and domain right. */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", width: CONTENT_WIDTH }}>
        {spec.status ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 18px",
              borderRadius: 999,
              border: `1px solid ${rgba(tone, 0.4)}`,
              backgroundColor: rgba(tone, 0.12),
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: "0.12em",
              color: tone,
            }}
          >
            {fitText(spec.status, 48).toUpperCase()}
          </div>
        ) : (
          <div />
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          {spec.source ? (
            <div style={{ fontFamily: SANS, fontWeight: 400, fontSize: 20, color: T.slate400 }}>
              {`Source: ${fitText(spec.source, SOURCE_MAX_CHARS)}`}
            </div>
          ) : null}
          <div
            style={{
              marginTop: 6,
              fontFamily: MONO,
              fontWeight: 500,
              fontSize: 18,
              letterSpacing: "0.04em",
              color: T.slate500,
            }}
          >
            immigrationclock.com
          </div>
        </div>
      </div>
    </div>
  );
}

/** Render one card. The Response carries image/png and a long immutable cache. */
export function ogCard(spec: OgCardSpec): ImageResponse {
  return new ImageResponse(<Card spec={spec} />, {
    width: OG_SIZE.width,
    height: OG_SIZE.height,
    fonts: FONTS,
  });
}
