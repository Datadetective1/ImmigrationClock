"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "framer-motion";

/**
 * Shows `value`, counting up to it when it first scrolls into view.
 *
 * The real value is the initial state, so the server-rendered HTML — what
 * search engines, link previews and readers without JavaScript see — carries
 * the figure, not 0. A counter already on screen when the page loads is left
 * alone (counting it down to 0 and back would only flicker); one further down
 * counts up from 0 when it arrives. prefers-reduced-motion never animates.
 */
export function AnimatedCounter({
  value,
  duration = 1.4,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(value);
  // Set once the counter has been shown in its final form, by animating or by
  // being visible from the start, so it never animates twice.
  const settled = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) settled.current = true;
  }, []);

  useEffect(() => {
    if (!inView || settled.current) return;
    settled.current = true;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    // An interrupted count (unmount, or a re-run) must still end on the value.
    return () => {
      controls.stop();
      setDisplay(value);
    };
  }, [inView, value, duration]);

  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(display);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
