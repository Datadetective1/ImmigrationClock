import { Suspense } from "react";
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
      <div className="container-page max-w-3xl py-10">
        <Suspense fallback={<p className="text-sm text-slate-400">Loading search…</p>}>
          <SearchPageClient />
        </Suspense>
      </div>
    </div>
  );
}
