// =============================================================================
// "SOMETHING ABOUT THE IDENTITY ON THIS BROWSER JUST CHANGED"
//
// THE PROBLEM, FOUND BY CLICKING SIGN OUT AND WATCHING THE HEADER NOT MOVE.
//
// The account control decides between "Sign in" and "Account" by reading the
// readable `ic_session` cookie, and it re-read that cookie on navigation. But
// signing out does not navigate: the button posts, the server expires the
// cookies, and `router.refresh()` re-renders the SERVER component underneath a
// client header that was never told anything happened. So the page said "Sign
// in with your email" while the header above it still offered "Account" — the
// exact wrong-identity-state failure the account work exists to remove.
//
// TWO AUDIENCES, TWO MECHANISMS, ONE CALL
// ---------------------------------------
//   THIS TAB gets a DOM event, synchronously. It is the tab that acted, so it
//   must not wait for anything.
//
//   OTHER TABS get a `storage` event, which the browser fires in every OTHER
//   tab of the origin when localStorage is written — and never in the one that
//   wrote it, which is precisely the split needed here. Cookies have no such
//   notification, so writing one byte of localStorage is what makes a
//   cross-tab signal possible at all.
//
// Focus and visibility are still watched by the control itself, as the backstop
// for a tab that was open before any of this and for browsers that throttle
// background events. This is the fast path, not the only one.
//
// WHAT IS BROADCAST: nothing. The value written is a timestamp, and the event
// carries no payload. Every listener re-reads the cookie for itself, and every
// real decision is still made server-side from the signed claim. A tab that is
// lied to by a forged event shows the wrong LABEL for one paint and links to a
// page that then asks the person to sign in.
// =============================================================================

/** Same-tab signal. A DOM event, never a network call. */
export const IDENTITY_EVENT = "immigrationclock:identity-changed";

/**
 * Cross-tab signal.
 *
 * Deliberately contentless — a timestamp, so that consecutive changes produce
 * distinct values and the `storage` event is not suppressed as a no-op write.
 * No address, no plan, no key: anyone reading this browser's storage learns
 * that an identity changed here, not whose.
 */
export const IDENTITY_PING_KEY = "immigrationclock.identity.v1";

/** Say that the identity on this browser changed. Safe to call anywhere. */
export function announceIdentityChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IDENTITY_PING_KEY, String(Date.now()));
  } catch {
    // Private browsing or a full quota. The same-tab event below still fires,
    // and other tabs fall back to correcting themselves on focus.
  }
  window.dispatchEvent(new Event(IDENTITY_EVENT));
}

/**
 * Listen for it, in this tab and in the others. Returns the unsubscribe.
 *
 * The `storage` handler filters on the key: this origin writes several other
 * things (follows, the sync stamp, cookie consent) and reacting to all of them
 * would make an unrelated write in another tab look like a sign-out.
 */
export function onIdentityChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const fromStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === IDENTITY_PING_KEY) handler();
  };
  window.addEventListener(IDENTITY_EVENT, handler);
  window.addEventListener("storage", fromStorage);
  return () => {
    window.removeEventListener(IDENTITY_EVENT, handler);
    window.removeEventListener("storage", fromStorage);
  };
}
