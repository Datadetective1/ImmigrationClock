import { SITE } from "@/lib/site";

/**
 * Site-wide JSON-LD: Organization + WebSite with a SearchAction so Google can
 * surface ImmigrationClock with a sitelinks search box (search-engine
 * findability is core to being the go-to immigration data site).
 */
export function StructuredData() {
  const twitterHandle = SITE.twitter.replace(/^@/, "");
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      logo: `${SITE.url}/og.svg`,
      description: SITE.subtitle,
      sameAs: [`https://twitter.com/${twitterHandle}`],
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
