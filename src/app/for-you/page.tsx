import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { MethodologyNote } from "@/components/MethodologyNote";
import { SourceBadge } from "@/components/SourceBadge";
import { LAST_REFRESHED } from "@/lib/data";
import { FollowingPanel } from "@/components/FollowingPanel";
import { SearchBar } from "@/components/SearchBar";
import { PulseSignup } from "@/components/PulseSignup";
import { SituationHub } from "@/components/SituationHub";
import { buildSituationHub } from "@/lib/situation-hub";

export const metadata = buildMetadata({
  title: "What This Means For You: Immigration Data by Situation",
  description:
    "H-1B worker, student, employer or green-card applicant: see what the latest U.S. immigration data means for your situation. Sourced, never advice.",
  path: "/for-you",
  keywords: [
    "what does H-1B data mean for me",
    "F-1 student immigration data",
    "employer H-1B trends",
    "employment-based green card data",
  ],
});

export default function ForYouPage() {
  const situations = buildSituationHub();

  return (
    <div>
      <PageHeader
        eyebrow="For you"
        title="What does this mean for you?"
        description="Start from a situation, or look up any visa, country or topic. Each change, date and figure links its source. Data and records, not legal advice."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/for-you", label: "For you" },
        ]}
        share
      />

      <div className="container-page max-w-3xl space-y-8 py-8">
        <SituationHub situations={situations} />

        {/* Situations are starting points, not a box to fit into. Anyone can
            look up their own visa, country or topic, and follow it. */}
        <section className="space-y-3">
          <h2 className="section-title">Or look up anything</h2>
          <SearchBar />
        </section>

        <FollowingPanel />

        <PulseSignup variant="inline" placement="for_you" />

        <SourceBadge
          sourceName="All sources used on this site"
          sourceUrl="https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub"
          sourceUpdatedAt={LAST_REFRESHED}
        />

        <MethodologyNote>
          Changes are listed under a situation only when the document itself names that visa category
          among those affected. Figures are computed from the same public datasets used across the site
          (USCIS, the State Department, BLS, CBP, and Texas WARN); they describe direction and magnitude,
          not cause, and are not a substitute for advice from a qualified immigration professional.
        </MethodologyNote>
      </div>
    </div>
  );
}
