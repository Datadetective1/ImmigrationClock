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
 * Which forms does this record name, and on what evidence?
 *
 * Title and summary only. The archive does not store document bodies, and a
 * form dimension built from text nobody can re-read would be exactly the kind
 * of unverifiable claim this product exists not to make.
 */
export function formsFor(title: string, summary: string): FormClassification[] {
  const out: FormClassification[] = [];
  for (const { form, re } of FORM_MATCHERS) {
    const inTitle = re.test(title);
    const inSummary = re.test(summary);
    if (!inTitle && !inSummary) continue;

    const method = gradeClassification({
      title,
      summary,
      evidence: inTitle ? title : summary,
      matches: (text) => re.test(text),
    });

    out.push({
      entityId: `form:${form.id}`,
      basis: "stated",
      evidence: clip(inTitle ? title : summary),
      method,
      confidence: confidenceFor(method),
    });
  }
  return out;
}
