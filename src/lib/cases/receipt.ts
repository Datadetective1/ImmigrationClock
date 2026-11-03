// =============================================================================
// USCIS RECEIPT NUMBERS
//
// Three letters for the office that received the case, then ten digits:
// "IOE0912345678", "EAC2190012345". People paste them with spaces, dashes and
// lower case, so the input is normalised before it is checked. Nothing else is
// accepted, which also means the field cannot be used to store free text.
// =============================================================================

export const RECEIPT_PATTERN = /^[A-Z]{3}\d{10}$/;

/** "eac-21-900-12345" -> "EAC2190012345". Null when it cannot be a receipt number. */
export function normalizeReceipt(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.toUpperCase().replace(/[\s\-–.]/g, "");
  return RECEIPT_PATTERN.test(cleaned) ? cleaned : null;
}

/** "EAC2190012345" -> "EAC•••••12345": enough to tell your cases apart in an email. */
export function maskReceipt(receipt: string): string {
  return `${receipt.slice(0, 3)}•••••${receipt.slice(-5)}`;
}
