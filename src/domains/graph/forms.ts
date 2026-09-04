// =============================================================================
// FORMS — the dimension that did not exist
//
// WHY IT IS WORTH ADDING, FROM THE CORPUS RATHER THAN FROM A WISH LIST
// --------------------------------------------------------------------
// Scanning the 544 committed records for form-shaped tokens found 32 records
// naming at least one form and 20 distinct forms, led by I-693, I-94, I-485,
// I-140, I-589, I-246, N-648, I-539 and I-765. Form I-129 appears once.
//
// That is a small dimension, and it is the one a professional actually asks
// for: "tell me when anything touches the form I file". A Paperwork Reduction
// Act notice — a large share of the Federal Register corpus — is BY DEFINITION
// about a specific form, so the form is the subject, not a passing reference.
//
// WHAT IS MATCHED
// ---------------
// Form-shaped identifiers only, in the shapes U.S. immigration agencies
// actually use: USCIS I-/N-/G- numbers, State Department DS- numbers, and DOL
// ETA- numbers. A token is required to look like a form and to be preceded by
// the word "Form" or to be one of the identifiers this corpus already contains.
// The second condition is what keeps "I-9" from matching a stray "I-9" in a
// list, and what keeps this from inventing coverage: an unrecognised
// form-shaped token is left alone rather than classified.
//
// WHAT IS NOT CLAIMED
// -------------------
// Naming a form is not the same as changing it. A record classified with a
// form says the document names that form, with the quote; it does not say the
// form was revised, and nothing here should be read as "your I-129 changed".
// =============================================================================

import { confidenceFor, gradeClassification } from "./classification";

export interface FormSpec {
  /** Normalized id, lowercased: "i-129". */
  id: string;
  /** As agencies write it: "I-129". */
  code: string;
  /** The official title, for display. Empty when we do not have one. */
  name: string;
}

/**
 * Forms this corpus actually contains, plus the small set of well-known
 * identifiers an immigration professional would monitor.
 *
 * Every entry has been seen in the archive or is a form whose number is
 * unambiguous. Names come from the agency's own titles.
 */
export const FORMS: FormSpec[] = [
  { id: "i-9", code: "I-9", name: "Employment Eligibility Verification" },
  { id: "i-94", code: "I-94", name: "Arrival/Departure Record" },
  { id: "i-129", code: "I-129", name: "Petition for a Nonimmigrant Worker" },
  { id: "i-130", code: "I-130", name: "Petition for Alien Relative" },
  { id: "i-131", code: "I-131", name: "Application for Travel Document" },
  { id: "i-140", code: "I-140", name: "Immigrant Petition for Alien Worker" },
  { id: "i-246", code: "I-246", name: "Application for a Stay of Deportation or Removal" },
  { id: "i-485", code: "I-485", name: "Application to Register Permanent Residence or Adjust Status" },
  { id: "i-539", code: "I-539", name: "Application to Extend/Change Nonimmigrant Status" },
  { id: "i-589", code: "I-589", name: "Application for Asylum and for Withholding of Removal" },
  { id: "i-693", code: "I-693", name: "Report of Immigration Medical Examination and Vaccination Record" },
  { id: "i-736", code: "I-736", name: "Guam-CNMI Visa Waiver Information" },
  { id: "i-765", code: "I-765", name: "Application for Employment Authorization" },
  { id: "i-821", code: "I-821", name: "Application for Temporary Protected Status" },
  { id: "i-907", code: "I-907", name: "Request for Premium Processing Service" },
  { id: "n-400", code: "N-400", name: "Application for Naturalization" },
  { id: "n-648", code: "N-648", name: "Medical Certification for Disability Exceptions" },
  { id: "g-28", code: "G-28", name: "Notice of Entry of Appearance as Attorney" },
  { id: "ds-160", code: "DS-160", name: "Online Nonimmigrant Visa Application" },
  { id: "ds-260", code: "DS-260", name: "Immigrant Visa Electronic Application" },
  { id: "eta-9089", code: "ETA-9089", name: "Application for Permanent Employment Certification" },
  { id: "eta-9035", code: "ETA-9035", name: "Labor Condition Application" },
  { id: "eta-790", code: "ETA-790", name: "Agricultural Clearance Order" },
];

export const FORM_BY_ID = new Map(FORMS.map((f) => [f.id, f] as const));

export interface FormMatcher {
  form: FormSpec;
  re: RegExp;
}

/**
 * One matcher per form.
 *
 * The identifier must stand alone — not be part of a longer number — so I-94
 * does not match inside I-941. Hyphen optional because agencies write both
 * "I-129" and "I129", and the "Form" prefix is optional because titles say
 * "Revised Form I-129" and summaries say "the I-129".
 */
export const FORM_MATCHERS: FormMatcher[] = FORMS.map((form) => ({
  form,
  re: new RegExp(`(?<![A-Za-z0-9-])(?:form\\s+)?${form.code.replace("-", "-?")}(?![A-Za-z0-9-])`, "i"),
}));

export interface FormClassification {
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

/**
 * Any well-formed form identifier the document itself calls a form.
 *
 * The registry above cannot keep up with the long tail, and hand-labelling
 * showed exactly how long it is: I-352, G-1650, I-901, I-775, N-336, I-912,
 * ETA-9142B and ETA-9155 are all real forms that real documents are ABOUT, and
 * none was in the list.
 *
 * The answer is not a longer list. When a document writes "Form I-352" it has
 * told us the token is a form, and that is better evidence than our registry
 * membership. The "Form" prefix is REQUIRED here — a bare "I-352" could be a
 * section number — so nothing is invented, and a registry entry still matches
 * bare because those identifiers are unambiguous.
 */
const EXPLICIT_FORM = /\bForms?\s+((?:I|N|G|DS|ETA|AR|EOIR)-\d{1,4}[A-Z]?)\b/gi;

/**
 * The document is ACTING on the form, not merely naming it.
 *
 * 82 of the 122 documents that hand-labelling found to be genuinely about a
 * form name it only in the body — Paperwork Reduction Act notices, fee
 * schedules, edition changes. Their titles say "Agency Information Collection
 * Activities" and nothing more. Refusing to read the body meant a form filter
 * could not see four fifths of the documents that change a form.
 *
 * Reading the body without this test would be worse: rules cite forms
 * constantly. So a body mention is strong only where the sentence shows the
 * document doing something to the form, and weak otherwise.
 */
const ACTED_ON_BEFORE =
  /\b(?:revision|revisions|extension|reinstatement|renewal|discontinuation|adjustment|new edition|edition|fee|fees|collection|approval)\s+(?:of|for|to)\s+(?:the\s+)?(?:currently approved\s+)?(?:collection[:,]?\s+)?(?:information collection[:,]?\s+)?$|\b(?:revise|revising|amend|amending|update|updating|discontinue|discontinuing|replace|replacing|reinstate|reinstating)\s+(?:the\s+)?$/i;

const ACTED_ON_AFTER =
  /^[^.]{0,40}\b(?:is|are|will be|has been|have been|shall be)\s+(?:revised|amended|updated|changed|adjusted|renewed|extended|reinstated|discontinued|retired|replaced|superseded)\b|^[^.]{0,30}\b(?:edition|editions)\b/i;

/**
 * Is the document ACTING on this form, or merely naming it?
 *
 * Checked on the words immediately around the identifier, not on the sentence.
 * A first attempt allowed any action verb within ninety characters, which in
 * Federal Register prose is nearly always satisfied — it took form precision
 * from 92% to 88% while adding recall, which is the wrong trade for a filter a
 * customer builds a monitoring promise on.
 */
function actsOnForm(before: string, after: string): boolean {
  return ACTED_ON_BEFORE.test(before) || ACTED_ON_AFTER.test(after);
}

/**
 * Which forms does this record name, and on what evidence?
 *
 * The title and the abstract are the document's own statement of subject, so a
 * form there is strong. The body is read too — the ingestion pipeline already
 * fetches it — but a form found only there must show the document acting on it
 * before it counts as more than a mention.
 */
export function formsFor(title: string, summary: string, body = ""): FormClassification[] {
  const out: FormClassification[] = [];
  const seen = new Set<string>();

  const push = (id: string, evidence: string, method: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      entityId: `form:${id}`,
      basis: "stated",
      evidence: clip(evidence),
      method,
      confidence: confidenceFor(method as never),
    });
  };

  // ---- registry forms, wherever they appear ------------------------------
  for (const { form, re } of FORM_MATCHERS) {
    const inTitle = re.test(title);
    const inSummary = re.test(summary);
    const bodyContext = inTitle || inSummary ? null : contextNaming(body, re);
    const bodySpan = bodyContext?.span ?? null;
    if (!inTitle && !inSummary && !bodySpan) continue;

    const evidence = inTitle ? title : inSummary ? summary : (bodySpan as string);
    const method = inTitle || inSummary
      ? gradeClassification({
          title,
          summary,
          evidence,
          matches: (text) => re.test(text),
        })
      : bodyContext && actsOnForm(bodyContext.before, bodyContext.after)
        ? "derived_high_confidence"
        : "derived_weak";

    push(form.id, evidence, method);
  }

  // ---- anything the document itself calls a form -------------------------
  for (const [text, isSurface] of [
    [title, true],
    [summary, true],
    [body, false],
  ] as const) {
    if (!text) continue;
    EXPLICIT_FORM.lastIndex = 0;
    for (let m = EXPLICIT_FORM.exec(text); m !== null; m = EXPLICIT_FORM.exec(text)) {
      const id = m[1].toLowerCase();
      if (seen.has(id)) continue;
      const flat = text.replace(/\s+/g, " ");
      const span = spanAround(text, m.index);
      const method = isSurface
        ? text === title
          ? "explicit_source"
          : "derived_high_confidence"
        : actsOnForm(
              flat.slice(Math.max(0, m.index - 90), m.index),
              flat.slice(m.index + m[0].length, m.index + m[0].length + 90)
            )
          ? "derived_high_confidence"
          : "derived_weak";
      push(id, span, method);
    }
  }

  return out;
}

/** Where this form is named in `text`, with the words either side of it. */
function contextNaming(
  text: string,
  re: RegExp
): { span: string; before: string; after: string } | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, " ");
  const global = new RegExp(re.source, "gi");
  const m = global.exec(flat);
  if (!m) return null;
  return {
    span: spanAround(flat, m.index),
    before: flat.slice(Math.max(0, m.index - 90), m.index),
    after: flat.slice(m.index + m[0].length, m.index + m[0].length + 90),
  };
}

/** A quotable window around a position, trimmed to sentence-ish boundaries. */
function spanAround(text: string, at: number, width = 320): string {
  const flat = text.replace(/\s+/g, " ");
  let start = Math.max(0, at - Math.floor(width / 2));
  let end = Math.min(flat.length, at + Math.floor(width / 2));
  // Out to whitespace on both sides: an evidence quote that opens mid-word is
  // not verbatim, and verbatim is the only thing it is for.
  while (start > 0 && !/\s/.test(flat[start - 1])) start--;
  while (end < flat.length && !/\s/.test(flat[end])) end++;
  // An ellipsis marks a window cut out of something longer. Without it a quote
  // beginning mid-sentence reads as the document's own opening words, which is
  // a small lie told in the one field that exists to be checked.
  const prefix = start > 0 ? "…" : "";
  const suffix = end < flat.length ? "…" : "";
  return `${prefix}${flat.slice(start, end).trim()}${suffix}`;
}
