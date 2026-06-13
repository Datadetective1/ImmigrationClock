import type { Metadata } from "next";
import { SITE } from "./site";

interface SeoInput {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
}

// Builds consistent Next.js Metadata (canonical, OpenGraph, Twitter, OG image).
export function buildMetadata({
  title,
  description,
  path = "/",
  keywords = [],
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
    robots: { index: true, follow: true },
  };
}
