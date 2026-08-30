"use client";

// A Link that reports the click, and nothing else.
//
// It exists so a SERVER component can measure a click without becoming a client
// component itself. That distinction is not academic here: RelatedSponsors
// imports @/lib/employers for displayEmployer, and that module loads the
// 489 kB employers.json at its top level — marking the whole block "use client"
// would have shipped the entire USCIS directory to the browser on all 2,614
// employer pages, to record one event. This file imports next/link and the
// analytics module, which pulls in no data at all.

import Link from "next/link";
import { trackRelatedClick } from "@/lib/analytics";

export function TrackedLink({
  href,
  surface,
  relation,
  className,
  children,
}: {
  href: string;
  /** Which block the link sits in, e.g. "related-sponsors". */
  surface: string;
  /** Why the link was offered, e.g. "volume" or "state". */
  relation: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => trackRelatedClick(surface, relation)}>
      {children}
    </Link>
  );
}
