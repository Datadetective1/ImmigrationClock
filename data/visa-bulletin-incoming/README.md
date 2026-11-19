# New Visa Bulletin months

One file per month, named `YYYY-MM.txt`, typed from the official bulletin on
travel.state.gov exactly as printed. `scripts/add-bulletin.ts` reads it and adds
the month to `src/lib/visa-bulletin/data.ts`, which every bulletin surface reads:
the Visa Bulletin page, the 16 green card wait-time pages and their index, the
forecast, the Chrome extension feed (`/api/v1/visa-bulletin`) and the free email
alerts.

1. Copy `TEMPLATE.txt` to `2026-12.txt` (the month the dates apply to).
2. Fill in `id`, `label`, `source` (the PDF on travel.state.gov) and `note`.
3. Type every cell from the four charts as printed: `22JAN21`, `C` or `U`.
   Columns are: all other countries, China, India, Mexico, Philippines.
4. Read every row back against the PDF, then set `verified` to today's date.
5. Check: `npx tsx scripts/add-bulletin.ts data/visa-bulletin-incoming/2026-12.txt`
   It refuses any missing or unreadable cell and prints the new date for each
   wait-time page next to how it moved, for one more read-back.
6. Write: add `--write`. Run `npm test`, open a PR, and merge only after review.

Nothing is fetched or parsed from a web page: a mistyped priority date is a
confidently wrong fact someone will act on.
