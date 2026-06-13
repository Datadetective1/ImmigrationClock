import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
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
  const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  return (
    <html lang="en">
      <body className="min-h-screen">
        {adsenseId ? (
          <Script
            id="adsbygoogle-init"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseId}`}
          />
        ) : null}
        <Navbar />
        <main className="min-h-[60vh]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
