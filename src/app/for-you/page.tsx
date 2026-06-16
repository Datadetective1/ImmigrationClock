import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { AdSlot } from "@/components/AdSlot";
import { MethodologyNote } from "@/components/MethodologyNote";
import { PersonaRelevance } from "@/components/PersonaRelevance";
import { personaSummaries } from "@/lib/relevance";

export const metadata = buildMetadata({
  title: "What This Means For You — Immigration Data by Situation",
  description:
    "Pick your situation — H-1B worker, international student, employer, or employment-based green-card applicant — and see what the latest U.S. immigration data means for you. Sourced and labelled, never advice.",
  path: "/for-you",
  keywords: [
    "what does H-1B data mean for me",
    "F-1 student immigration data",
    "employer H-1B trends",
    "employment-based green card data",
  ],
});

export default function ForYouPage() {
  const personas = personaSummaries();

  return (
    <div>
      <PageHeader
        eyebrow="For you"
        title="What does this mean for you?"
        description="The same data, read for your situation. Choose who you are and get the figures that actually affect you — each one sourced and labelled. This is data context, not legal advice."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/for-you", label: "For you" },
        ]}
        share
      />

      <div className="container-page max-w-3xl space-y-8 py-10">
        <PersonaRelevance personas={personas} />

        <AdSlot format="in-content" />

        <MethodologyNote>
          These summaries are computed automatically from the same public datasets used across the site
          (USCIS, the State Department, BLS, CBP, and Texas WARN). They describe direction and magnitude,
          not cause, and are not a substitute for advice from a qualified immigration professional.
        </MethodologyNote>
      </div>
    </div>
  );
}
