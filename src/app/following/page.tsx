// =============================================================================
// /following — the follow feature's own address
//
// The panel already existed and worked; it was embedded on /what-changed behind
// an anchor, so the homepage CTA "Follow a country or visa" landed a reader on
// a page about something else and left them to spot a section. The feature was
// finished and unfindable.
//
// This page is deliberately thin: it reuses FollowingPanel and the follow
// engine unchanged. What it adds is the part a first-time visitor was missing —
// what this is for, and what it costs them, which is nothing.
//
// THE ORDER OF THE PAGE IS THE ARGUMENT IT MAKES
// ----------------------------------------------
// Choose, then see, then read the small print. The page used to run the digest
// above the picker (an empty box, for anyone who had not chosen yet) and spend
// two paragraphs on localStorage before the reader had any experience of the
// feature to attach them to. So: the picker first, with the primary action
// naming the categories out loud; the digest below it, where it fills in as
// soon as something is followed; and the privacy detail last, in full, where it
// answers a question the reader by then actually has.
//
// The panel renders no changes list of its own here (showChanges={false}) —
// ChangesForYou is the digest on this page, and two lists of the same events
// stacked would read as a bug — and it opens its picker for a reader who
// follows nothing (openWhenEmpty), because on THIS page choosing is the whole
// point. Both props are false everywhere else: /what-changed and /for-you are
// pages about something else with a follow panel on them.
//
// THE PRIVACY CLAIM IS THE FEATURE
// --------------------------------
// Follows live in localStorage and nowhere else. /methodology promises "no
// individual immigrant profiles", and a server-side record that a person
// follows Venezuela, TPS and asylum is exactly what that promise forbids. So
// the page says so plainly rather than burying it: personalization without a
// profile is the distinction, and a reader deciding whether to tell us what
// they care about deserves to know we are not keeping it.
// =============================================================================

import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { FollowingPanel } from "@/components/FollowingPanel";
import { ChangesForYou } from "@/components/ChangesForYou";
import { INDEX_COVERAGE } from "@/lib/event-index";

export const metadata = buildMetadata({
  title: "Follow what matters to you",
  description:
    "Choose countries, visas, agencies or immigration topics you care about. ImmigrationClock organizes relevant changes for you — stored in your browser, never on our servers.",
  path: "/following",
});

export default function FollowingPage() {
  return (
    // A div, not a main: the layout already renders <main id="main-content">,
    // and a second main landmark inside it gives screen reader users two "main"
    // targets to choose between. Every other page returns a div for this reason.
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        eyebrow="Personalized"
        title="Follow what matters to you"
        description="Choose countries, visas, agencies or immigration topics you care about. ImmigrationClock will organize relevant changes for you without creating a personal immigration profile."
      />

      {/* The primary interaction, first. */}
      <div className="mt-8">
        <FollowingPanel showChanges={false} openWhenEmpty />
      </div>

      {/* Then what following produced. Renders its own empty state, so it is
          never a blank box asking the reader to imagine the payoff. */}
      <div className="mt-6">
        <ChangesForYou />
      </div>

      {/* Then the small print — kept complete, moved out of the way. */}
      <section
        id="how-this-works"
        aria-labelledby="how-this-works-heading"
        className="mt-10 rounded-2xl border border-white/5 p-4 sm:p-5"
      >
        <h2 id="how-this-works-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          How this works
        </h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-400">
          <li>
            <span className="font-medium text-slate-200">Your choices stay on this device.</span> They
            are saved in your browser&rsquo;s local storage. We never receive them, so they are not
            attached to your email address and not attached to you.
          </li>
          <li>
            <span className="font-medium text-slate-200">That means they do not sync.</span> Follow
            something here and it will not appear on your phone. Syncing would require us to hold the
            list, and a record of who follows which immigration topics is precisely what{" "}
            <a href="/methodology" className="link-accent">
              our methodology
            </a>{" "}
            promises we will not keep.
          </li>
          <li>
            <span className="font-medium text-slate-200">Nothing is emailed.</span> The weekly
            Immigration Pulse is the same issue for everyone — it is not personalized from what you
            follow here, and subscribing to it tells us nothing about your interests.
          </li>
          <li>
            <span className="font-medium text-slate-200">We match against the archive we have.</span>{" "}
            {INDEX_COVERAGE.indexed.toLocaleString()} events are searchable
            {INDEX_COVERAGE.oldest ? `, back to ${INDEX_COVERAGE.oldest}` : ""}. A quiet week here
            describes what our sources published, not what happened everywhere.
          </li>
        </ul>
      </section>
    </div>
  );
}
