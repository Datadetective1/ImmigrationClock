// =============================================================================
// PROCESSES — the dimension that makes employment developments retrievable
//
// THE PROBLEM, MEASURED
// ---------------------
// A visa filter is precise and it is not enough. Of the 25 USCIS newsroom
// records whose text concerns employment, 21 were reachable through an
// employment visa or an employment form. The four that were not:
//
//   DHS Ends Automatic Extension of Employment Authorization
//   USCIS Increases Screening, Vetting of Aliens Working in U.S.
//   USCIS Announces Employment Authorization Document Application Procedures
//     for Certain Hong Kong Residents
//   DHS Streamlines the Filing Process for Certain Agricultural Workers
//
// None of them names a visa category, and a mobility team that misses them has
// missed real operational changes. The dimension a professional actually
// filters on is the process they administer, so the first three are now
// reachable through process:employment-authorization and retrieval on that
// sample went from 21/25 to 24/25.
//
// THE ONE THAT IS STILL NOT REACHABLE, AND WHY IT STAYS THAT WAY
// --------------------------------------------------------------
// "DHS Streamlines the Filing Process for Certain Agricultural Workers" says
// "temporary agricultural worker petitions" and never says H-2A. Everyone in
// the field knows which visa that is. Encoding that knowledge here would mean
// classifying a document by what we believe rather than by what it says, which
// is the one thing this layer must not do — so the record stays unclassified
// and the gap is reported by `npm run intelligence:quality` instead of being
// quietly closed.
//
// WHY NOT A TOPIC TAXONOMY
// ------------------------
// The store already carries topic entities and they cannot do this job: of 544
// records, 408 are `topic:policy-changes`. A filter that returns three quarters
// of the archive is not a filter. Inventing a second, better topic vocabulary
// would have meant assigning labels to records by judgement, which is the kind
// of unverifiable classification this product exists not to make.
//
// WHAT IS HERE INSTEAD
// --------------------
// Six processes, each one a phrase that appears verbatim in the corpus, each
// with its measured support:
//
//   labor-certification                   20 records
//   employment-authorization              15
//   cap-registration                      18
//   prevailing-wage                        9
//   employment-eligibility-verification    5
//   premium-processing                     2
//
// The list is deliberately short and deliberately employment-shaped, because
// that is the retrieval problem that was posed. Other processes have support in
// the corpus and are NOT included, so that adding one later is a decision with
// a number attached rather than a habit: naturalization 21, asylum 15,
// adjustment of status 10, public charge 9, biometrics 6, removal proceedings 5.
//
// TWO FALSE-POSITIVE CLASSES WERE FOUND AND FIXED
// -----------------------------------------------
//   An agency's name is not a subject. "Office of Foreign Labor Certification"
//   contains "labor certification", and matching on it pulled in a mailing
//   address change and a record-retention notice. Organization names are
//   removed from the text before matching.
//
//   A word needs its context. "Registration" alone matched TPS re-registration
//   periods, which have nothing to do with the H-1B or H-2B cap. The cap
//   process therefore requires a cap or H-1B mention in the same text.
//
// WHAT A PROCESS CLASSIFICATION CLAIMS
// ------------------------------------
// That the document names this process, with the quote. Not that the process
// changed, not that anyone's filing is affected, and nothing about any person.
// =============================================================================

import { confidenceFor, gradeClassification } from "./classification";

export interface ProcessSpec {
  /** Normalized id: "labor-certification". */
  id: string;
  /** How to say it in a sentence. */
  name: string;
  /** Any one of these appearing is a match. */
  surfaces: RegExp[];
  /**
   * When present, the text must ALSO match this. Used where a surface is a
   * common word that only means the process in context — "registration" is
   * about the cap only alongside a cap or H-1B mention.
   */
  requires?: RegExp;
}

/**
 * Names of organizations that contain a process phrase.
 *
 * Removed from the text before matching. Who published a notice is already a
 * field on the record; letting it decide what the notice is about produced
 * three wrong classifications, including a change of mailing address filed as
 * a labor certification development.
 */
const ORGANIZATION_NAMES = /\boffice of foreign labor certification\b|\bOFLC\b/gi;

export const PROCESSES: ProcessSpec[] = [
  {
    id: "labor-certification",
    name: "Labor certification",
    surfaces: [
      /\blabor certification\b/i,
      /\bpermanent employment certification\b/i,
      /\bPERM\b/,
    ],
  },
  {
    id: "employment-authorization",
    name: "Employment authorization",
    surfaces: [
      /\bemployment authoriz(?:ation|ed)\b/i,
      /\bemployment authorization document\b/i,
      /\bEAD\b/,
    ],
  },
  {
    id: "cap-registration",
    name: "Cap registration and selection",
    // Named for what it covers rather than for H-1B alone: the H-2B cap works
    // the same way and a record about reaching it belongs here.
    surfaces: [/\bcap[-\s]subject\b/i, /\bregistration\b/i, /\bcap\b/i],
    // Bare "cap" is deliberately absent from this guard. It is a surface, so a
    // record naming a cap still matches — but only when the text also names the
    // visa programme the cap belongs to. Without that, a future "cap on filing
    // fees" would be filed as an H-1B cap development.
    requires: /\bH-1B\b|\bH-2B\b|\bcap[-\s]subject\b/i,
  },
  {
    id: "prevailing-wage",
    name: "Prevailing wage determination",
    surfaces: [/\bprevailing wage\b/i, /\badverse effect wage rate\b/i, /\bAEWR\b/],
  },
  {
    id: "employment-eligibility-verification",
    name: "Employment eligibility verification",
    surfaces: [/\bemployment eligibility verification\b/i, /\bE-Verify\b/i],
  },
  {
    id: "premium-processing",
    name: "Premium processing",
    surfaces: [/\bpremium processing\b/i],
  },
];

export const PROCESS_BY_ID = new Map(PROCESSES.map((p) => [p.id, p] as const));

export interface ProcessClassification {
  entityId: string;
  basis: "stated";
  evidence: string;
  method: string;
  confidence: number;
}

function clip(text: string, max = 300): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/** Text with organization names removed, so a publisher cannot become a subject. */
function subjectText(text: string): string {
  return text.replace(ORGANIZATION_NAMES, " ");
}

function matchesSpec(spec: ProcessSpec, text: string): boolean {
  const subject = subjectText(text);
  if (!spec.surfaces.some((re) => re.test(subject))) return false;
  if (spec.requires && !spec.requires.test(subject)) return false;
  return true;
}

/**
 * Which processes does this record name, and on what evidence?
 *
 * Title and summary only, graded by the same model as every other dimension:
 * a title match is explicit, a summary match is high confidence, and a summary
 * sentence that reads as history is weak.
 */
export function processesFor(title: string, summary: string): ProcessClassification[] {
  const out: ProcessClassification[] = [];
  for (const spec of PROCESSES) {
    const inTitle = matchesSpec(spec, title);
    const inSummary = matchesSpec(spec, summary);
    if (!inTitle && !inSummary) continue;

    const evidence = clip(inTitle ? title : summary);
    const method = gradeClassification({
      title,
      summary,
      evidence,
      matches: (text) => matchesSpec(spec, text),
    });

    out.push({
      entityId: `process:${spec.id}`,
      basis: "stated",
      evidence,
      method,
      confidence: confidenceFor(method),
    });
  }
  return out;
}
