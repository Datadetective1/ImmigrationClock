import { SITE } from "@/lib/site";

/**
 * The public contact address, or an honest placeholder when none is configured.
 *
 * Founder Directive Part 2 Pillar 4 requires a way for readers to challenge what
 * we publish, and Part 7 requires that a page never leave the reader guessing.
 * Rendering `mailto:` with an empty address satisfies neither — it looks like a
 * contact route and silently isn't one. So when no inbox is configured we say so
 * plainly instead of shipping a dead link.
 *
 * Configure with NEXT_PUBLIC_CONTACT_EMAIL.
 */
export function ContactLink({ className = "link-accent" }: { className?: string }) {
  const email = SITE.contactEmail.trim();
  if (!email) {
    return (
      <span className="text-slate-400">
        a public contact address is being set up — until then, corrections can be raised as an issue on
        the project repository
      </span>
    );
  }
  return (
    <a href={`mailto:${email}`} className={className}>
      {email}
    </a>
  );
}
