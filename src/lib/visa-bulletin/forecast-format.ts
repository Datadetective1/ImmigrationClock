// Formatting for the forecast, kept apart from forecast.ts so a client
// component can use it without pulling the bulletin history into the bundle.

import type { Pace } from "./forecast";

const AVG_MONTH_DAYS = 30.4375;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2029-03" -> "March 2029". */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** "2029-03" -> "2029". */
export function yearOf(month: string): string {
  return month.slice(0, 4);
}

/** Average pace as plain words: "about 2 months of dates per month". */
export function describePace(p: Pace): string {
  const monthsPerMonth = p.daysPerMonth / AVG_MONTH_DAYS;
  if (p.daysPerMonth <= 0) return p.daysPerMonth === 0 ? "no movement" : "went backwards";
  if (monthsPerMonth >= 0.95) return `about ${Math.round(monthsPerMonth * 10) / 10} months of dates per month`;
  return `about ${Math.round(p.daysPerMonth)} days of dates per month`;
}
