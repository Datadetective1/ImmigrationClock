# Visa Bulletin history (final action dates)

Past final action dates, one CSV per bulletin month, used only to measure how
fast each line has moved for the priority date forecast
(`src/lib/visa-bulletin/forecast.ts`). Pages never show these values as the
current bulletin; the current months come from the hand-checked
`src/lib/visa-bulletin/data.ts`, which wins whenever a month is in both.

## Source

Every file names its official travel.state.gov bulletin on the first line
(`source,<url>`). The build refuses any other source.

## How the values were read

Each bulletin's final action charts were read twice, independently. A cell
was kept only when both reads agreed; a cell they disagreed on is `??` and is
skipped by the build. `C` is current, `U` is unavailable. Dates are written as
on the bulletin (`01JAN22`).

## Format

```
source,https://travel.state.gov/...
section,family
F1,<all>,<china>,<india>,<mexico>,<philippines>
...
section,employment
EB1,...
```

## Gaps

Some months are missing because the site refused automated reads at the
time. The forecast takes the first dated month at or after the start of each
1, 2 and 3 year window, so a missing month moves a window's start slightly; it
does not invent values. Add a month by saving its CSV here and running:

```
npx tsx scripts/build-bulletin-history.ts
```
