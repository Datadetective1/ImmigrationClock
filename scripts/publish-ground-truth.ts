// =============================================================================
// scripts/publish-ground-truth.ts — move labels from scratch into the repository
//
//   npx tsx scripts/publish-ground-truth.ts <labelsDir>
//
// A benchmark that lives in a temporary directory is not a benchmark, it is a
// number somebody once saw. This writes the hand labels into fixtures/ with the
// provenance attached to each file: how the pool was drawn, who judged it, what
// was verified, and — where it applies — what was NOT verified.
//
// The last part matters. The form and employment reviewers did not finish, so
// those labels carry one judgement each rather than two. Publishing them
// without saying so would present a single opinion as a checked one.
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = process.argv[2];
if (!DIR) {
  console.error("usage: tsx scripts/publish-ground-truth.ts <labelsDir>");
  process.exit(1);
}

const FIXTURES = resolve("fixtures");

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, name), "utf8")) as T;
}

function publish(sourceName: string, targetName: string, readme: string[]) {
  const data = load<Record<string, unknown>>(sourceName);
  writeFileSync(
    join(FIXTURES, targetName),
    `${JSON.stringify({ _readme: readme, labelledOn: "2026-09-03", ...data }, null, 2)}\n`
  );
  console.log(`wrote fixtures/${targetName}`);
}

const HOW_THE_POOL_WAS_DRAWN = [
  "HOW THE POOL WAS DRAWN, AND WHY IT IS NOT THE CLASSIFIER'S OUTPUT.",
  "",
  "Candidates come from the DOCUMENTS, not from what the classifier claimed.",
  "Full Federal Register texts were fetched for all 348 records that have one,",
  "and every record whose title, abstract or body names the value became a",
  "candidate. Scoring against your own output can only measure precision, and",
  "it measures it against the thing being tested.",
  "",
  "Each judgement was made from the document's own words — title, abstract, and",
  "the body passages containing the mention — with the deciding span quoted. The",
  "annotator was not shown what the classifier decided.",
  "",
  "THE HOLDOUT. Every record carries a `holdout` flag, set by hashing its id, so",
  "the split is stable and independent of both content and classifier answer.",
  "Nothing may be tuned against the holdout half. It exists to catch the",
  "overfitting that fixing a classifier against its own benchmark produces.",
];

publish("h1b-labels.json", "h1b-expanded-ground-truth.json", [
  "HAND-LABELLED GROUND TRUTH FOR H-1B RELEVANCE — the expanded set.",
  "",
  "The question asked of each record: should a professional monitoring the H-1B",
  "programme receive this in their feed? Not 'does it mention H-1B'.",
  "",
  ...HOW_THE_POOL_WAS_DRAWN,
  "",
  "This is the COMPLETE population of records in the corpus whose text names",
  "H-1B anywhere, so recall here is recall over everything knowable, not an",
  "estimate. Every label was independently reviewed by a second reader whose",
  "instruction was to refute it; none was overturned.",
  "",
  "It supersedes nothing: fixtures/h1b-ground-truth.json holds the original",
  "21-record set and is still scored separately, because a benchmark that gets",
  "quietly replaced when it stops flattering the classifier is not a benchmark.",
  "",
  "`mentionKind` records HOW H-1B appears, so the failure classes stay visible:",
  "subject_of_document, one_of_several_programmes, affects_h1b_indirectly,",
  "statutory_citation, historical_reference, comparison_with_other_programme,",
  "background_only.",
]);

publish("country-labels.json", "country-expanded-ground-truth.json", [
  "HAND-LABELLED GROUND TRUTH FOR COUNTRY CLASSIFICATION.",
  "",
  "Each (record, country) pair carries a RELATION rather than a yes or no,",
  "because the failures were never about whether the country appeared:",
  "",
  "  nationals_of        coverage defined by nationality or citizenship   SCOPE",
  "  present_in          coverage defined by presence in, or travel from  SCOPE",
  "  designated_list     an item in an enumerated list of countries       SCOPE",
  "  title_subject       the document's own title names it                SCOPE",
  "  post_location       a US consular post is located there              not scope",
  "  document_population who holds a document the rule merely lists       not scope",
  "  agreement_party     named inside the title of a cited agreement      not scope",
  "  contextual          history, comparison, background                  not scope",
  "  part_of_other_name  'Mexico Boulevard', 'New Mexico', a US state     not a country",
  "  territory_confusion 'American Samoa' is not Samoa                    not a country",
  "",
  ...HOW_THE_POOL_WAS_DRAWN,
  "",
  "`contested` holds pairs where the reviewer disagreed with the annotator.",
  "They are EXCLUDED from the benchmark rather than resolved by rule, because a",
  "disputed label is not ground truth. Resolving them by always siding with the",
  "reviewer, or always with the positive, would settle a factual question by",
  "procedure.",
  "",
  "`recordsWithNoCountry` are records an annotator read and found no country",
  "scope in. They are the evidence a false negative would contradict.",
]);

publish("form-labels.json", "form-ground-truth.json", [
  "HAND-LABELLED GROUND TRUTH FOR FORM CLASSIFICATION.",
  "",
  "The question for each (record, form) pair: is the document ABOUT this form —",
  "revising it, changing its fee or edition, changing how it is filed — or does",
  "it merely name it? A filter that returns every document containing the string",
  "'I-129' is not a filter anyone can monitor on.",
  "",
  ...HOW_THE_POOL_WAS_DRAWN,
  "",
  "NOT INDEPENDENTLY REVIEWED. The reviewers for this dimension did not run to",
  "completion, so all but one of these labels carry a single annotator's",
  "judgement rather than two. That is a weaker basis than the H-1B and country",
  "sets and it is stated here rather than left for someone to discover.",
  "",
  "`onlyInBody` is the field that answers a specific question: can an archive",
  "that keeps only titles and abstracts see this at all? For 82 of the 121",
  "documents genuinely about a form, the answer is no.",
]);

publish("employment-labels.json", "employment-ground-truth.json", [
  "HAND-LABELLED GROUND TRUTH FOR EMPLOYMENT RELEVANCE.",
  "",
  "The question: would a corporate immigration or global mobility team act on",
  "this record? Employment visas, labor certification, employment authorization,",
  "prevailing wage, E-Verify and I-9, the caps, premium processing — yes. Asylum,",
  "naturalization, family immigration, enforcement and statistics — no, unless",
  "the document also changes something an employer or a work-authorized person",
  "must do.",
  "",
  ...HOW_THE_POOL_WAS_DRAWN,
  "",
  "NOT INDEPENDENTLY REVIEWED. As with the form set, the reviewers did not run",
  "to completion. These are single-annotator labels.",
  "",
  "Note that several Temporary Protected Status records are labelled",
  "employment-related, because terminating TPS ends work authorization. That is",
  "a defensible reading and an arguable one; the reasons are recorded per record",
  "so it can be argued with.",
]);

console.log("\nGround truth published to fixtures/.");
