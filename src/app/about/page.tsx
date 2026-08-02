import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { ContactLink } from "@/components/ContactLink";
import { SITE } from "@/lib/site";
import Link from "next/link";

export const metadata = buildMetadata({
  title: "About & Contact",
  description:
    "About ImmigrationClock — a neutral, fact-based dashboard of U.S. immigration, visa, enforcement, and workforce data, with every number sourced.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <div>
      <PageHeader
        eyebrow="About"
        title="About ImmigrationClock"
        description={SITE.positioning}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/about", label: "About" },
        ]}
      />

      <div className="container-page max-w-3xl space-y-8 py-10 text-sm leading-relaxed text-slate-300 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_a]:text-accent">
        <section className="space-y-3">
          <h2>What this is</h2>
          <p>
            {SITE.name} turns scattered U.S. government datasets into one readable dashboard: immigration
            enforcement, visas, border activity, H-1B sponsorship, wages, and layoffs. It is inspired by
            live-counter sites like the U.S. Debt Clock, rebuilt with a modern interface and a strict rule —{" "}
            <strong>every number links to its official public source.</strong>
          </p>
        </section>

        <section className="space-y-3">
          <h2>Our approach</h2>
          <p>
            We are neutral by design. The site does not tell you what to think; it shows the public numbers and
            explains exactly what each one means. We do not profile or identify individuals, report enforcement
            operations, or claim that immigrants caused specific job losses. Where data is estimated rather than
            directly published, we say so.
          </p>
          <p>
            Read the <Link href="/methodology">methodology</Link> for definitions and caveats, and the{" "}
            <Link href="/sources">sources page</Link> for the full dataset list (USCIS, ICE, DHS, CBP, the
            Department of State, BLS, and state WARN portals).
          </p>
        </section>

        <section className="space-y-3">
          <h2>How it stays current</h2>
          <p>
            Headline figures reflect the latest published federal releases. An automated pipeline refreshes the
            underlying datasets on a schedule, and the live <Link href="/admin/refresh-status">refresh status</Link>{" "}
            page shows when each source was last updated.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Contact</h2>
          <p>
            Corrections, source suggestions, or questions are welcome at{" "}
            <ContactLink />. If you spot a number that doesn&rsquo;t
            match its source, please tell us.
          </p>
        </section>
      </div>
    </div>
  );
}
