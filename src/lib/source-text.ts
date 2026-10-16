// =============================================================================
// THE SOURCE TEXT STORE — the authoritative document, kept
//
// THE PROBLEM THIS EXISTS TO FIX
// ------------------------------
// The Federal Register and executive-action adapters fetch the full text of
// every document they ingest, hand it to extractImpact() once, and drop it. The
// text is never stored, so nothing afterwards can re-read it: not a classifier
// improved six months later, not a reviewer checking a claim, not a customer
// asking why a record says what it says.
//
// Measured, that cost was large. Of the documents genuinely about a form, 82 of
// 121 name it only in the body. Four of the H-1B recall misses are documents
// that change several programmes and mention H-1B only in the body. Country
// designations found in bodies had to be marked weak because there was no way
// to re-examine them. Every one of those is the same defect: the evidence was
// in our hands and we let go of it.
//
// WHY ONE FILE PER DOCUMENT, OUTSIDE src/
// ---------------------------------------
// A single bundled JSON would be rewritten in full on every data refresh, so
// git would store a fresh 15MB blob each time. One file per document means a
// refresh writes only the documents it actually added — federal documents are
// immutable once published, so an existing file never changes and git stores
// its blob exactly once.
//
// It lives in data/ rather than src/ so nothing in the application can import
// it, deliberately: Next.js traces imports to decide what ships, and a stray
// import of a 15MB directory would end up inside a serverless bundle.
//
// THE SEPARATION THIS PRESERVES
// -----------------------------
//   1. RAW / SOURCE EVIDENCE       this store, plus its provenance index
//   2. NORMALIZED INTELLIGENCE     ImmigrationEvent in events.json
//   3. PUBLIC EVIDENCE EXCERPTS    the quotes on each classification
//
// The public API serves 2 and 3. It does not serve 1. A whole government
// document is available from the government at the canonical URL every record
// already carries; republishing it would add nothing and would make this a
// document host rather than an intelligence layer.
//
// WHAT IS STORED IS NORMALIZED, AND THAT IS DELIBERATE
// ----------------------------------------------------
// Raw Federal Register text carries its own markup — "<bullet>", inline
// anchors, entities. Storing it raw would mean every consumer re-implements the
// same cleaning, and evidence quotes cut from it leak markup, which has already
// happened once. The store holds richText()-normalized text, and the content
// hash is of the normalized form, so the hash means "the text we classified"
// rather than "the bytes we happened to receive".
//
// REVISIONS ARE KEPT, NOT OVERWRITTEN
// -----------------------------------
// Federal documents are meant to be immutable, but the text we retrieve is not
// guaranteed to be: an agency can correct a page in place, and our own
// normalization can change. When a document's normalized text changes, the
// previous text moves to _versions/<file-stem>/ under its own hash and the
// index records it. Nothing is ever deleted. A version records the adapter that
// read it, so a later comparison can tell "the source changed" apart from "our
// processing changed" instead of presenting one as the other.
//
// Versions exist only from the day this shipped. Earlier revisions were not
// kept, and nothing here reconstructs them.
// =============================================================================

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Where the store lives. Outside src/ so the app cannot import it. */
export const SOURCE_TEXT_DIR = resolve("data/source-text");
const VERSIONS_DIR = "_versions";
const indexPath = (dir: string) => join(dir, "_index.json");

/**
 * Provenance for one retained document.
 *
 * Everything here answers a question a professional will eventually ask: where
 * did this come from, when did you get it, is it still the same text, and which
 * version of our code read it.
 */
export interface SourceDocumentRef {
  /** The event id this text belongs to. */
  id: string;
  /** Filename within the store. Derived from the id, stable. */
  file: string;
  /** The URL the text itself came from. Not the HTML page — the text. */
  textUrl: string;
  /** sha256 of the NORMALIZED text, so it names what was classified. */
  contentHash: string;
  /** Characters of normalized text. */
  characters: number;
  /** When we retrieved it. ISO date. */
  retrievedAt: string;
  /** Which adapter produced it, and at what version of its extraction rules. */
  adapter: string;
  /**
   * Earlier texts of this document, oldest first. Absent until the text first
   * changes. Each was the current text until `supersededAt`.
   */
  versions?: SourceTextVersion[];
}

/** A previous text of one document, kept when the current text replaced it. */
export interface SourceTextVersion {
  /** Path within the store, under _versions/. */
  file: string;
  contentHash: string;
  characters: number;
  /** When that text was retrieved. */
  retrievedAt: string;
  /** When we retrieved the text that replaced it. */
  supersededAt: string;
  /** The adapter that read that text. A different adapter than the next version's means our processing changed too. */
  adapter: string;
}

export interface SourceTextIndex {
  /** Bumped when the normalization or the hash definition changes. */
  storeVersion: number;
  documents: Record<string, SourceDocumentRef>;
}

const STORE_VERSION = 1;

/** A filename that survives every filesystem and is derivable from the id. */
export function safeFileName(id: string): string {
  return `${id.replace(/[^A-Za-z0-9._-]/g, "_")}.txt`;
}

export function hashText(normalized: string): string {
  return `sha256:${createHash("sha256").update(normalized, "utf8").digest("hex")}`;
}

export function readIndex(dir: string = SOURCE_TEXT_DIR): SourceTextIndex {
  if (!existsSync(indexPath(dir))) return { storeVersion: STORE_VERSION, documents: {} };
  return JSON.parse(readFileSync(indexPath(dir), "utf8")) as SourceTextIndex;
}

function writeIndex(index: SourceTextIndex, dir: string): void {
  mkdirSync(dir, { recursive: true });
  const ordered: Record<string, SourceDocumentRef> = {};
  for (const key of Object.keys(index.documents).sort()) ordered[key] = index.documents[key];
  writeFileSync(
    indexPath(dir),
    `${JSON.stringify({ storeVersion: index.storeVersion, documents: ordered }, null, 2)}\n`
  );
}

/**
 * Store one document's normalized text, and return its provenance.
 *
 * Idempotent by content: re-storing identical text rewrites nothing, so a data
 * refresh that re-reads an unchanged document produces no git diff. When the
 * text HAS changed, the file is rewritten and the hash moves — which is the
 * signal that a government document was revised in place, and worth noticing.
 */
export function putSourceText(input: {
  id: string;
  normalized: string;
  textUrl: string;
  retrievedAt: string;
  adapter: string;
}, dir: string = SOURCE_TEXT_DIR): SourceDocumentRef {
  const { id, normalized, textUrl, retrievedAt, adapter } = input;
  mkdirSync(dir, { recursive: true });

  const file = safeFileName(id);
  const path = join(dir, file);
  const contentHash = hashText(normalized);

  const index = readIndex(dir);
  const existing = index.documents[id];
  const changed = existing !== undefined && existing.contentHash !== contentHash;
  let versions = existing?.versions ?? [];

  // The text changed: keep the old one before replacing it. Only when the old
  // file is present and still matches its recorded hash — a version is a
  // claim about what a document said, and a file that no longer hashes to its
  // record cannot back that claim.
  if (changed && existsSync(path)) {
    const previous = readFileSync(path, "utf8");
    if (hashText(previous) === existing.contentHash) {
      const stem = file.replace(/\.txt$/, "");
      const versionFile = join(VERSIONS_DIR, stem, `${existing.contentHash.slice("sha256:".length, "sha256:".length + 16)}.txt`);
      mkdirSync(join(dir, VERSIONS_DIR, stem), { recursive: true });
      if (!existsSync(join(dir, versionFile))) writeFileSync(join(dir, versionFile), previous);
      if (!versions.some((v) => v.contentHash === existing.contentHash)) {
        versions = [
          ...versions,
          {
            file: versionFile,
            contentHash: existing.contentHash,
            characters: existing.characters,
            retrievedAt: existing.retrievedAt,
            supersededAt: retrievedAt,
            adapter: existing.adapter,
          },
        ];
      }
    }
  }

  if (!existing || changed || !existsSync(path)) {
    writeFileSync(path, normalized);
  }

  const ref: SourceDocumentRef = {
    id,
    file,
    textUrl,
    contentHash,
    characters: normalized.length,
    // An unchanged document keeps its original retrieval date. Re-stamping it
    // on every refresh would turn "when we got this" into "when we last ran",
    // which is a different and much less useful fact.
    retrievedAt: existing && !changed ? existing.retrievedAt : retrievedAt,
    adapter,
    ...(versions.length > 0 ? { versions } : {}),
  };

  index.documents[id] = ref;
  index.storeVersion = STORE_VERSION;
  writeIndex(index, dir);
  return ref;
}

/** Every retained text of one document, oldest first, current last. Empty when never stored. */
export function sourceVersionsFor(
  id: string,
  dir: string = SOURCE_TEXT_DIR
): { contentHash: string; retrievedAt: string; adapter: string; current: boolean; text: string | null }[] {
  const ref = readIndex(dir).documents[id];
  if (!ref) return [];
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : null);
  return [
    ...(ref.versions ?? []).map((v) => ({
      contentHash: v.contentHash,
      retrievedAt: v.retrievedAt,
      adapter: v.adapter,
      current: false,
      text: read(v.file),
    })),
    { contentHash: ref.contentHash, retrievedAt: ref.retrievedAt, adapter: ref.adapter, current: true, text: read(ref.file) },
  ];
}

/** The normalized text for one record, or null when we never retained it. */
export function sourceTextFor(id: string, dir: string = SOURCE_TEXT_DIR): string | null {
  const path = join(dir, safeFileName(id));
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Every id the store holds. */
export function storedIds(dir: string = SOURCE_TEXT_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => f.replace(/\.txt$/, ""));
}

/**
 * Does the stored text still hash to what the index claims?
 *
 * Run in the test suite. A store whose contents have drifted from their hashes
 * is worse than no store: every evidence quote drawn from it becomes a claim
 * about a document nobody can identify.
 */
export function verifyStore(dir: string = SOURCE_TEXT_DIR): { checked: number; mismatched: string[]; missing: string[] } {
  const index = readIndex(dir);
  const mismatched: string[] = [];
  const missing: string[] = [];
  let checked = 0;

  for (const [id, ref] of Object.entries(index.documents)) {
    // The current text, then every kept version: each must still be the text
    // its hash names.
    const entries = [{ file: ref.file, contentHash: ref.contentHash, label: id }, ...(ref.versions ?? []).map((v) => ({ file: v.file, contentHash: v.contentHash, label: `${id}@${v.contentHash.slice(7, 19)}` }))];
    for (const e of entries) {
      const path = join(dir, e.file);
      if (!existsSync(path)) {
        missing.push(e.label);
        continue;
      }
      checked++;
      if (hashText(readFileSync(path, "utf8")) !== e.contentHash) mismatched.push(e.label);
    }
  }
  return { checked, mismatched, missing };
}
