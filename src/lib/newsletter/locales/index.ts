// =============================================================================
// LOCALE REGISTRY
//
// ADDING A LANGUAGE IS TWO LINES.
//
//   1. Write locales/<code>.ts satisfying LocaleStrings. TypeScript will not let
//      you omit a key, so a partial translation cannot ship.
//   2. Add the code to `Locale` in ../types.ts and the entry below.
//
// Nothing in the renderer, the selector, the validator or the send pipeline
// knows how many languages exist.
// =============================================================================

import type { Locale } from "../types";
import { DEFAULT_LOCALE } from "../types";
import type { LocaleStrings } from "./strings";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ar } from "./ar";

export const STRINGS: Record<Locale, LocaleStrings> = { en, es, fr, ar };

/** Never throws: an unknown locale falls back rather than failing a send. */
export function stringsFor(locale: Locale): LocaleStrings {
  return STRINGS[locale] ?? STRINGS[DEFAULT_LOCALE];
}

export type { LocaleStrings };
