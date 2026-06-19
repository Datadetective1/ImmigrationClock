import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { AdSenseScript } from "@/components/AdSenseScript";
import { AnalyticsScripts } from "@/components/AnalyticsScripts";
import { ConsentBanner } from "@/components/ConsentBanner";
import { StructuredData } from "@/components/StructuredData";
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
        {/* AdSense + GA4 load only after cookie consent; Plausible is cookieless. */}
        <AdSenseScript />
        <AnalyticsScripts />
        <Navbar />
        <main className="min-h-[60vh]">{children}</main>
        <Footer />
        <ConsentBanner />
      </body>
    </html>
  );
}
