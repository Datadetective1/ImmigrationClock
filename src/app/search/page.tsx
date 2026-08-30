import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { SearchPageClient } from "@/components/SearchPageClient";

export const metadata = buildMetadata({
  title: "Search Immigration Data",
  description:
    "Look up any tracked employer, U.S. state, country, visa type, or occupation and get a sourced, labelled immigration data page.",
  path: "/search",
  noindex: true, // query results page — keep thin URLs out of the index
});

export default function SearchPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Look it up"
        title="Search immigration data"
        description="One place to look up the immigration record behind an employer, state, country, visa type, or job — every result is a sourced, labelled data page."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/search", label: "Search" },
        ]}
      />
      {/* No Suspense boundary: SearchPageClient reads ?q= from location on mount
          instead of with useSearchParams, so the search box itself prerenders
          into the static HTML rather than appearing only after hydration. */}
      <div className="container-page max-w-3xl py-10">
        <SearchPageClient />
      </div>
    </div>
  );
}
