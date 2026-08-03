import { SITE } from "@/lib/site";
import { jsonLd } from "@/lib/seo";

/**
 * Site-wide JSON-LD: Organization + WebSite with a SearchAction so Google can
 * surface ImmigrationClock with a sitelinks search box (search-engine
 * findability is core to being the go-to immigration data site).
 */
export function StructuredData() {
  // `sameAs` is a claim of account ownership. Emit it only when a handle is
  // actually configured — never point search engines at an account we may not
  // control. Same rule as any other unsourced assertion.
  const twitterHandle = SITE.twitter.replace(/^@/, "").trim();
  const sameAs = twitterHandle ? [`https://twitter.com/${twitterHandle}`] : undefined;
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      logo: `${SITE.url}/og.svg`,
      description: SITE.subtitle,
      ...(sameAs ? { sameAs } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE.name,
      url: SITE.url,
      description: SITE.subtitle,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE.url}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ];

  return (
    <script
      type="application/ld+json"
      // JSON.stringify of our own static config — safe, not user input.
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}
