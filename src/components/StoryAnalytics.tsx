"use client";

// A story page was opened. The page itself is a server component that must
// stay one — it renders the full event record — so the single client-side
// concern, firing `what_changed_view` once with `entry: "story"`, lives in
// this null-rendering component. The ref survives React's development-mode
// double effect, so the event fires exactly once per mount in every mode.

import { useEffect, useRef } from "react";
import { trackStoryView } from "@/lib/analytics";

export function StoryAnalytics({ story, category }: { story: string; category: string }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackStoryView(story, category);
  }, [story, category]);
  return null;
}
