import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { AdSenseScript } from "@/components/AdSenseScript";
import { ConsentBanner } from "@/components/ConsentBanner";
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
      <body className="min-h-screen">
        {/* AdSense loads only after cookie consent (see ConsentBanner). */}
        <AdSenseScript />
        <Navbar />
        <main className="min-h-[60vh]">{children}</main>
        <Footer />
        <ConsentBanner />
      </body>
    </html>
  );
}
