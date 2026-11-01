// =============================================================================
// VISA BULLETIN MONTHS, TYPED FROM THE OFFICIAL STATE DEPARTMENT PDFs
//
// Every cell below was taken from the official bulletin PDF for its month and
// checked against the printed table on the day in verifiedAt. Dates are the
// bulletin's DDMMMYY written as YYYY-MM-DD (22JAN21 -> 2021-01-22).
//
// To add a month, see the note at the top of ./index.ts.
// =============================================================================

import type { Bulletin } from "./types";

export const BULLETINS: Bulletin[] = [
  {
    id: "2026-11",
    label: "November 2026",
    sourceUrl: "https://travel.state.gov/content/dam/visas/Bulletins/visabulletin_November2026.pdf",
    verifiedAt: "2026-11-01",
    // Department of State publication date printed on the bulletin: CA/VO: October 5, 2026.
    family: {
      finalAction: {
        F1: { all: "2021-01-22", china: "2021-01-22", india: "2021-01-22", mexico: "2008-09-22", philippines: "2013-11-01" },
        F2A: { all: "2026-10-22", china: "2026-10-22", india: "2026-10-22", mexico: "2026-04-22", philippines: "2026-10-22" },
        F2B: { all: "2020-08-22", china: "2020-08-22", india: "2020-08-22", mexico: "2010-05-15", philippines: "2013-10-01" },
        F3: { all: "2015-10-22", china: "2015-10-22", india: "2015-10-22", mexico: "2001-07-15", philippines: "2006-07-22" },
        F4: { all: "2012-10-22", china: "2012-10-22", india: "2006-12-15", mexico: "2001-04-22", philippines: "2008-05-15" },
      },
      filing: {
        F1: { all: "2021-02-01", china: "2021-02-01", india: "2021-02-01", mexico: "2008-12-01", philippines: "2015-04-22" },
        F2A: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
        F2B: { all: "2020-09-01", china: "2020-09-01", india: "2020-09-01", mexico: "2011-03-22", philippines: "2014-10-01" },
        F3: { all: "2015-11-01", china: "2015-11-01", india: "2015-11-01", mexico: "2002-12-01", philippines: "2006-10-22" },
        F4: { all: "2012-11-01", china: "2012-11-01", india: "2007-02-01", mexico: "2001-04-30", philippines: "2009-03-22" },
      },
    },
    employment: {
      finalAction: {
        EB1: { all: "C", china: "2023-08-01", india: "2023-02-01", mexico: "C", philippines: "C" },
        EB2: { all: "2025-04-01", china: "2021-10-01", india: "2013-11-01", mexico: "2025-04-01", philippines: "2025-04-01" },
        EB3: { all: "2024-06-15", china: "2022-01-22", india: "2014-01-22", mexico: "2024-06-15", philippines: "2023-08-15" },
        EW: { all: "2022-06-01", china: "2019-10-01", india: "2014-01-22", mexico: "2022-06-01", philippines: "2022-01-01" },
        EB4: { all: "2022-12-15", china: "2022-12-15", india: "2022-12-15", mexico: "2022-12-15", philippines: "2022-12-15" },
        SR: { all: "2022-12-15", china: "2022-12-15", india: "2022-12-15", mexico: "2022-12-15", philippines: "2022-12-15" },
        EB5U: { all: "C", china: "2016-12-01", india: "2023-12-01", mexico: "C", philippines: "C" },
        EB5R: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
        EB5H: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
        EB5I: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
      },
      filing: {
        EB1: { all: "C", china: "2024-07-01", india: "2024-07-01", mexico: "C", philippines: "C" },
        EB2: { all: "2026-03-15", china: "2023-01-01", india: "2015-01-15", mexico: "2026-03-15", philippines: "2026-03-15" },
        EB3: { all: "2024-08-01", china: "2024-04-01", india: "2015-01-15", mexico: "2024-08-01", philippines: "2024-01-01" },
        EW: { all: "2022-07-01", china: "2020-10-01", india: "2015-01-15", mexico: "2022-07-01", philippines: "2022-06-01" },
        EB4: { all: "2025-01-01", china: "2025-01-01", india: "2025-01-01", mexico: "2025-01-01", philippines: "2025-01-01" },
        SR: { all: "2025-01-01", china: "2025-01-01", india: "2025-01-01", mexico: "2025-01-01", philippines: "2025-01-01" },
        EB5U: { all: "C", china: "2021-03-01", india: "2024-05-01", mexico: "C", philippines: "C" },
        EB5R: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
        EB5H: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
        EB5I: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
      },
    },
  },
  {
    id: "2026-10",
    label: "October 2026",
    sourceUrl: "https://travel.state.gov/content/dam/visas/Bulletins/visabulletin_October2026.pdf",
    verifiedAt: "2026-11-01",
    // Department of State publication date printed on the bulletin: CA/VO: September 4, 2026.
    family: {
      finalAction: {
        F1: { all: "2020-01-22", china: "2020-01-22", india: "2020-01-22", mexico: "2008-09-08", philippines: "2013-11-01" },
        F2A: { all: "2026-09-22", china: "2026-09-22", india: "2026-09-22", mexico: "2026-03-22", philippines: "2026-09-22" },
        F2B: { all: "2019-08-22", china: "2019-08-22", india: "2019-08-22", mexico: "2010-05-15", philippines: "2013-10-01" },
        F3: { all: "2014-10-22", china: "2014-10-22", india: "2014-10-22", mexico: "2001-07-01", philippines: "2006-07-22" },
        F4: { all: "2011-10-22", china: "2011-10-22", india: "2006-12-15", mexico: "2001-04-22", philippines: "2008-05-15" },
      },
      filing: {
        F1: { all: "2020-02-01", china: "2020-02-01", india: "2020-02-01", mexico: "2008-12-01", philippines: "2015-04-22" },
        F2A: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
        F2B: { all: "2019-09-01", china: "2019-09-01", india: "2019-09-01", mexico: "2011-03-22", philippines: "2014-10-01" },
        F3: { all: "2014-11-01", china: "2014-11-01", india: "2014-11-01", mexico: "2002-12-01", philippines: "2006-10-22" },
        F4: { all: "2011-11-01", china: "2011-11-01", india: "2007-02-01", mexico: "2001-04-30", philippines: "2009-03-22" },
      },
    },
    employment: {
      finalAction: {
        EB1: { all: "C", china: "2023-07-01", india: "2023-02-01", mexico: "C", philippines: "C" },
        EB2: { all: "2025-01-01", china: "2021-10-01", india: "2013-11-01", mexico: "2025-01-01", philippines: "2025-01-01" },
        EB3: { all: "2024-05-15", china: "2022-01-08", india: "2014-01-01", mexico: "2024-05-15", philippines: "2023-08-15" },
        EW: { all: "2022-01-01", china: "2019-10-01", india: "2014-01-01", mexico: "2022-01-01", philippines: "2022-01-01" },
        EB4: { all: "2022-12-15", china: "2022-12-15", india: "2022-12-15", mexico: "2022-12-15", philippines: "2022-12-15" },
        SR: { all: "2022-12-15", china: "2022-12-15", india: "2022-12-15", mexico: "2022-12-15", philippines: "2022-12-15" },
        EB5U: { all: "C", china: "2016-12-01", india: "2023-12-01", mexico: "C", philippines: "C" },
        EB5R: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
        EB5H: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
        EB5I: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
      },
      filing: {
        EB1: { all: "C", china: "2024-07-01", india: "2024-07-01", mexico: "C", philippines: "C" },
        EB2: { all: "2026-03-15", china: "2023-01-01", india: "2015-01-15", mexico: "2026-03-15", philippines: "2026-03-15" },
        EB3: { all: "2024-08-01", china: "2024-04-01", india: "2015-01-15", mexico: "2024-08-01", philippines: "2024-01-01" },
        EW: { all: "2022-06-01", china: "2020-10-01", india: "2015-01-15", mexico: "2022-06-01", philippines: "2022-06-01" },
        EB4: { all: "2025-01-01", china: "2025-01-01", india: "2025-01-01", mexico: "2025-01-01", philippines: "2025-01-01" },
        SR: { all: "2025-01-01", china: "2025-01-01", india: "2025-01-01", mexico: "2025-01-01", philippines: "2025-01-01" },
        EB5U: { all: "C", china: "2021-03-01", india: "2024-05-01", mexico: "C", philippines: "C" },
        EB5R: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
        EB5H: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
        EB5I: { all: "C", china: "C", india: "C", mexico: "C", philippines: "C" },
      },
    },
  },
];
