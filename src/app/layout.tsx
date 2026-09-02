import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { AnalyticsScripts } from "@/components/AnalyticsScripts";
import { ConsentBanner } from "@/components/ConsentBanner";
import { SocialArrival } from "@/components/SocialArrival";
import { StructuredData } from "@/components/StructuredData";
import { Analytics } from "@vercel/analytics/next";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  ...buildMetadata({
    title: SITE.title,
    description: SITE.subtitle,
    path: "/",
  }),
  applicationName: SITE.name,
  authors: [{ name: SITE.name }],
  category: "news",
  verification: {
    google: "nPRJ1Gd57XNxLJqQA2jrUgZHGOo6V-UI5tYn2YiwohQ",
  },
};

export const viewport: Viewport = {
  themeColor: "#05070d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <StructuredData />
      </head>
      <body className="min-h-screen">
        {/* Plausible is cookieless and loads immediately. GA4 sets cookies and
            loads only after consent. There is no advertising script: display ads
            were removed from the platform — see docs/founder-directive-gap-analysis.md
            (conflict C-2). */}
        <AnalyticsScripts />
        {/* Attributes a landing from one of our own social posts to its story.
            Reads the query string only; renders nothing. In Suspense because
            useSearchParams() would otherwise de-optimise every static page. */}
        <Suspense fallback={null}>
          <SocialArrival />
        </Suspense>
        {/* First tab stop on every page — lets keyboard and screen-reader users
            jump past the navigation straight to the content. */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Navbar />
        <main id="main-content" tabIndex={-1} className="min-h-[60vh]">
          {children}
        </main>
        <Footer />
        <ConsentBanner />
        {/* Vercel Web Analytics. Loaded unconditionally, on the same reasoning as
            Plausible above: it is cookieless, sets no identifier, and follows
            nobody between sites, so it does not require the consent gate that GA4
            does. It also needs no CSP change — the script and its beacon are both
            same-origin (/_vercel/insights/…), already covered by `script-src
            'self'` and `connect-src 'self'` in vercel.json. */}
        <Analytics />
      </body>
    </html>
  );
}
