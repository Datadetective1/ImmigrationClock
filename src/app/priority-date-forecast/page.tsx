// =============================================================================
// /priority-date-forecast : when might my priority date be reached?
//
// One form, one answer, and three short lines on how the estimate is made.
// The free answer is in years; Pro adds the month range, the pace and a chart.
// =============================================================================

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { PriorityDateForecast } from "@/components/PriorityDateForecast";
import { buildMetadata } from "@/lib/seo";
import { ogImagePath } from "@/lib/share";
import { FORECAST_PATH, VISA_BULLETIN_PATH, latestBulletin } from "@/lib/visa-bulletin";
import { historyRange } from "@/lib/visa-bulletin/history";
import { formatMonth } from "@/lib/visa-bulletin/forecast-format";

export const metadata = buildMetadata({
  title: "Priority Date Forecast: When Will My Green Card Date Be Current?",
  description:
    "Estimate when your priority date may become current, by category and country, from how fast the official Visa Bulletin final action dates have moved.",
  path: FORECAST_PATH,
  image: ogImagePath("page", "visa-bulletin"),
  keywords: [
    "priority date forecast",
    "priority date predictor",
    "when will my priority date be current",
    "visa bulletin predictions",
    "EB-2 India priority date forecast",
    "EB-3 priority date forecast",
    "F2A priority date",
  ],
});

const STEPS = [
  { n: "1", title: "Real bulletins", text: "Final action dates from official State Department bulletins." },
  { n: "2", title: "Measured pace", text: "How far the line moved over the past 1, 2 and 3 years." },
  { n: "3", title: "A range", text: "Your gap divided by that pace. Fast pace, slow pace, typical pace." },
];

export default function PriorityDateForecastPage() {
  const latest = latestBulletin();
  const range = historyRange();
  return (
    <div>
      <PageHeader
        eyebrow="Visa Bulletin"
        title="When will my date be current?"
        description="Pick your category, country and priority date. See when the line may reach it."
        crumbs={[
          { href: "/", label: "Home" },
          { href: VISA_BULLETIN_PATH, label: "Visa Bulletin" },
          { href: FORECAST_PATH, label: "Forecast" },
        ]}
      />
      <div className="container-page max-w-3xl space-y-6 py-8">
        <PriorityDateForecast />

        <section aria-labelledby="how-heading">
          <h2 id="how-heading" className="text-base font-bold text-white">
            How it works
          </h2>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">{s.n}</span>
                <p className="mt-2 text-sm font-semibold text-white">{s.title}</p>
                <p className="mt-1 text-xs text-slate-400">{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-slate-500">
            {range ? `Based on bulletins from ${formatMonth(range.from)} to ${formatMonth(range.to)}. ` : null}
            Not legal advice. A new law, a surge in demand or a retrogression can change everything.{" "}
            {latest ? (
              <Link href={VISA_BULLETIN_PATH} className="text-accent underline">
                See the {latest.label} bulletin
              </Link>
            ) : null}
          </p>
        </section>
      </div>
    </div>
  );
}
