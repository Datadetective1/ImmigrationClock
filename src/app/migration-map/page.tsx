import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { MigrationMap } from "@/components/MigrationMap";
import { ResourcePanel } from "@/components/ResourcePanel";
import { MethodologyNote } from "@/components/MethodologyNote";
import { partnersByIds } from "@/lib/partners";
import { mapFiscalYear } from "@/lib/migration-map";

export const metadata = buildMetadata({
  title: "Where America's Immigrants Come From — Visa Origin Map",
  description:
    "An interactive map of the top origin countries for U.S. H-1B workers and F-1 students, sized by volume. Pick a visa type and explore each country's full visa and remittance picture. Sourced and labelled — not live tracking.",
  path: "/migration-map",
  keywords: [
    "where do H-1B workers come from",
    "F-1 students by country",
    "immigration origin countries map",
    "H-1B by country",
    "US visa map",
  ],
});

export default function MigrationMapPage() {
  const fy = mapFiscalYear();

  return (
    <div>
      <PageHeader
        eyebrow="Origins"
        title="Where America's immigrants come from"
        description={`The top origin countries for U.S. work and student visas, FY${fy}. Pick a visa type, see the flows, and open any country for its full picture. This animates the latest annual data — it is not a live feed.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/migration-map", label: "Origin map" },
        ]}
        share
      />

      <div className="container-page max-w-5xl space-y-8 py-10">
        <MigrationMap />

        <ResourcePanel
          partners={partnersByIds(["wise", "remitly", "boundless"])}
          placement="migration-map"
          title="Sending money home — or bringing family over?"
          subtitle="Move money at the real exchange rate, and get attorney-reviewed help with family and work visas."
        />

        <MethodologyNote>
          Country figures combine USCIS H-1B statistics (reported) with apportioned State Department visa
          totals (estimated for F-1). The map&rsquo;s motion is an illustrative flourish over annual data; it
          does not represent real-time movement, and ImmigrationClock never tracks individuals. See the{" "}
          <Link href="/visa/f1-student-visas" className="link-accent">
            visa tracker
          </Link>{" "}
          and{" "}
          <Link href="/methodology" className="link-accent">
            methodology
          </Link>{" "}
          for definitions.
        </MethodologyNote>
      </div>
    </div>
  );
}
