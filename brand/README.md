# brand/

The ImmigrationClock visual identity. Read
**[BRAND-GUIDE.md](BRAND-GUIDE.md)** for the rules; this file covers the
mechanics.

Assets are **committed**, so nobody needs Node to use them. They are also
**generated**, so changing a colour never means editing forty files by hand.

## Commands

```bash
npm run brand
```

Regenerates every asset and the visual guide. Run this after touching
`tokens.mjs` or anything in `lib/`.

```bash
npm run brand:contrast
```

Checks all 31 colour pairings the guide claims are accessible. Exits non-zero on
failure, so it can gate a build. It has already caught four real problems —
including a secondary-text grey at 4.36:1 and a chart series at 1.93:1.

```bash
npm run brand:review
```

Serves the guide at <http://localhost:4321> and the PNG exporter at
<http://localhost:4321/preview/export.html>.

## Getting PNGs

LinkedIn and X want PNG, not SVG. Open `preview/export.html`, click **Download
everything**, and you get all 24 rasters at their exact required pixel sizes.

One caveat worth knowing: a browser rasterises SVG using *locally installed*
fonts, not webfonts a page has loaded. Without [Inter](https://rsms.me/inter/)
installed you will get your system UI font in the wordmark — close, but not the
real thing. Install Inter first, or open the SVG in Figma, which embeds it.

## Layout

```
tokens.mjs          colour, type, tagline — the single source of truth
build.mjs           writes assets/
guide.mjs           writes preview/index.html
contrast.mjs        verifies the palette; also exports ratio() for the guide
serve.mjs           zero-dependency review server

lib/
  mark.mjs          the dial, in three optical cuts
  lockup.mjs        wordmark and lockups
  social.mjs        banners, chips, pills, the navy field
  posts.mjs         the four post templates
  icons.mjs         31 icons + sprite

assets/             62 generated files (see below)
preview/
  index.html        the visual style guide
  export.html       PNG export
  qa.html           contact sheet used to check every asset at once
```

### assets/

| Folder | Contents |
|---|---|
| `logo/` | Mark (badge, glyph, mono cuts) and horizontal / stacked lockups, light and dark |
| `profile/` | LinkedIn 400×400 and X 400×400, navy and white |
| `banners/` | LinkedIn company 1128×191, LinkedIn personal 1584×396, X header 1500×500 |
| `social/` | Four post templates plus two worked examples |
| `favicon/` | 16, 32, apple-touch 180, maskable 512, Safari pinned tab |
| `icons/` | 31 individual SVGs plus `sprite.svg` |
| `tokens/` | `colors.css` (`--ic-*` custom properties) and `colors.json` |

## For engineering

Import `assets/tokens/colors.css` for CSS custom properties, or
`assets/tokens/colors.json` to feed a build.

The icon sprite is referenced as:

```html
<svg width="20" height="20"><use href="/brand/icons/sprite.svg#ic-clock"/></svg>
```

Icons use `stroke="currentColor"`, so they take the colour of whatever they sit
in — never set a colour on the icon itself.

## Note on the two palettes

This folder describes the **brand** surface: white background, navy ink. The
product dashboard is dark and is governed by the `ink` palette in
`tailwind.config.ts`. That is deliberate, not drift — see §9 of the brand
guide. If you change a shared value, change it in both places and re-run
`npm run brand:contrast`.
