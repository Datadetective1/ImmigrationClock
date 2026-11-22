// =============================================================================
// "TWO DATES, NOT ONE": A 30-SECOND EXPLAINER VIDEO
//
// Final action date vs date for filing. The video names no month and no real
// cut-off date, so it never goes stale. preload="none" with a poster means the
// page downloads only the small poster image; the video itself loads when the
// visitor taps play. Captions are burned into the video, so it works muted.
// =============================================================================

export const TWO_DATES_VIDEO = "/videos/visa-bulletin-two-dates.mp4";
export const TWO_DATES_POSTER = "/videos/visa-bulletin-two-dates-poster.jpg";

export function TwoDatesExplainer() {
  return (
    <section aria-labelledby="two-dates-heading" className="panel p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <video
          className="mx-auto w-full max-w-[220px] shrink-0 rounded-xl border border-white/10 bg-[#0A1B2D] sm:mx-0"
          controls
          preload="none"
          playsInline
          poster={TWO_DATES_POSTER}
          width={540}
          height={960}
          aria-describedby="two-dates-summary"
        >
          <source src={TWO_DATES_VIDEO} type="video/mp4" />
        </video>
        <div>
          <div className="eyebrow mb-1 text-accent">Explained in 30 seconds</div>
          <h2 id="two-dates-heading" className="text-lg font-bold text-white sm:text-xl">
            Two dates, not one
          </h2>
          <p id="two-dates-summary" className="mt-1 text-sm text-slate-400">
            Every month the bulletin lists two dates for your category and country. If your priority date is earlier
            than the final action date, your green card can be approved. If it is earlier than the date for filing, you
            may be able to file early, in the months USCIS accepts that chart.
          </p>
          <p className="mt-2 text-xs text-slate-500">Captions are on screen, so it works with the sound off.</p>
        </div>
      </div>
    </section>
  );
}
