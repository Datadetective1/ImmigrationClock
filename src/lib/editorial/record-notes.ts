// =============================================================================
// RECORD NOTES — editor-written additions to a few high-traffic change records
//
// The records themselves are machine-built from the source document, and a
// Federal Register title ("Optional Practical Training Fees") is not what a
// reader searches for. A note supplies, for one record:
//
//   • a search title and description — metadata only; the page still leads
//     with the document's own title;
//   • the comment deadline and docket, copied from the document's DATES and
//     ADDRESSES sections (data/source-text holds the text each was taken from);
//   • a few onward links an editor chose.
//
// Every figure here must appear in the source document. A note never says a
// proposal is in force: the record's stage line already says what it is.
// =============================================================================

export interface RecordNote {
  /** <title> and og:title. Under ~65 characters. */
  searchTitle: string;
  /** Meta description. Facts from the document only. */
  searchDescription: string;
  comments?: {
    /** "Comments must be received on or before …", YYYY-MM-DD. */
    closes: string;
    docket: string;
    /** Where comments are filed. */
    url: string;
  };
  readNext: { href: string; label: string }[];
}

export const RECORD_NOTES: Record<string, RecordNote> = {
  // DATES: "Comments must be received on or before November 9, 2026."
  // [DHS Docket No. ICEB-2026-0100]
  "federal_register:2026-20660": {
    searchTitle: "Proposed $70,000 OPT Fee: DHS Rule, Comments Due Nov 9, 2026",
    searchDescription:
      "DHS proposed on Oct 8, 2026 a fee of $70,000 for initial OPT and $30,000 for any subsequent OPT, paid by SEVP-certified schools. A proposal, not in force. Comments are due Nov 9, 2026 (docket ICEB-2026-0100).",
    comments: {
      closes: "2026-11-09",
      docket: "ICEB-2026-0100",
      url: "https://www.regulations.gov/docket/ICEB-2026-0100",
    },
    readNext: [
      { href: "/explained/opt-in-plain-terms", label: "OPT in plain terms" },
      { href: "/key-dates#opt-window", label: "The OPT filing window" },
    ],
  },
  // DATES: "Written comments on the notice of proposed rulemaking (NPRM) must be
  // submitted on or before November 10, 2026." [DHS Docket No. USCIS-2026-0364]
  "federal_register:2026-18631": {
    searchTitle: "DHS Proposes Ending the 60-Day Grace Period for H-1B and Others",
    searchDescription:
      "Proposed Sept 11, 2026: remove the up-to-60-day grace period after employment ends for E-1, E-2, E-3, H-1B, H-1B1, L-1, O-1 and TN workers. Not final. Comments are due Nov 10, 2026 (docket USCIS-2026-0364).",
    comments: {
      closes: "2026-11-10",
      docket: "USCIS-2026-0364",
      url: "https://www.regulations.gov/docket/USCIS-2026-0364",
    },
    readNext: [
      { href: "/layoffs-vs-h1b", label: "Layoffs vs H-1B sponsorship" },
      { href: "/explained/h1b-cap-and-registration", label: "How the H-1B cap works" },
    ],
  },
};

export function recordNote(id: string): RecordNote | undefined {
  return RECORD_NOTES[id];
}

/** Records with a comment period still open on `today` (YYYY-MM-DD), soonest first. */
export function openCommentPeriods(today: string): { id: string; note: RecordNote }[] {
  return Object.entries(RECORD_NOTES)
    .filter(([, note]) => note.comments && note.comments.closes >= today)
    .map(([id, note]) => ({ id, note }))
    .sort((a, b) => a.note.comments!.closes.localeCompare(b.note.comments!.closes));
}
