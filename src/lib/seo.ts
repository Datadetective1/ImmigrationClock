import type { Metadata } from "next";
import { SITE } from "./site";

interface SeoInput {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  noindex?: boolean;
}

// Builds consistent Next.js Metadata (canonical, OpenGraph, Twitter, OG image).
export function buildMetadata({
  title,
  description,
  path = "/",
  keywords = [],
  noindex = false,
}: SeoInput): Metadata {
  const url = `${SITE.url}${path}`;
  const fullTitle =
    title === SITE.title ? title : `${title} — ${SITE.name}`;
  const ogImage = `${SITE.url}/og.svg`;
  return {
    title: fullTitle,
    description,
    keywords: [
      "immigration data",
      "H-1B",
      "ICE arrests",
      "deportations",
      "border encounters",
      "visa statistics",
      "WARN layoffs",
      ...keywords,
    ],
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: SITE.name,
      title: fullTitle,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [ogImage],
    },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
  };
}

/**
 * Serialize structured data for injection into a <script> tag.
 *
 * `JSON.stringify` escapes quotes but NOT the sequence `</script>`, so any
 * string that reaches JSON-LD carrying one would close the tag early and let
 * whatever follows be parsed as markup. Most of our structured data is
 * hardcoded, but breadcrumb labels on /employer/[slug] and /company/[slug] come
 * from DOL disclosure files — third-party text, on 2,600+ generated pages.
 *
 * No exploit is known and none is likely; government CSVs are not a realistic
 * attacker channel. This is one line, it removes the category entirely, and
 * "the upstream data is probably fine" is not a security control.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    // NOTE the DOUBLED backslashes. "\\u003c" is what must reach the
    // OUTPUT string. Writing "\u003c" in a TypeScript literal is simply "<",
    // so that version replaces "<" with "<" — a no-op that reads exactly like a
    // fix. The regression test in tests/trust-claims.test.ts caught it here.
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
