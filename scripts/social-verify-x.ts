// =============================================================================
// scripts/social-verify-x.ts — does the X credential actually work?
//
//   npm run social:verify-x
//
// Makes ONE authenticated GET to X's identity endpoint and prints which account
// answered. It cannot publish: this script never imports XPublisher, and the
// only network call it makes is a GET.
//
// WHY THIS EXISTS RATHER THAN A CURL COMMAND
// ------------------------------------------
// The point is not to test the credentials. It is to test THIS REPOSITORY'S
// OAuth 1.0a signing against a live endpoint, which has never happened. The
// check therefore goes through the same buildAuthorizationHeader() the publisher
// uses, so a 200 means both the four values and the signature code are good. A
// curl would prove the former and nothing about the latter.
//
// NO SECRET IS EVER PRINTED. The script reports which variables are present and
// their lengths, never their values, and X's error text is truncated.
// =============================================================================

import { readXCredentials, verifyXCredentials } from "../src/lib/social/platforms/x";

const REQUIRED = [
  "X_API_KEY",
  "X_API_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_TOKEN_SECRET",
] as const;

async function main() {
  const line = "═".repeat(72);
  console.log(line);
  console.log("ImmigrationClock — X credential check (read-only, cannot publish)");
  console.log(line);

  // ---- presence, without values --------------------------------------------
  console.log("\n── Environment");
  const missing: string[] = [];
  for (const name of REQUIRED) {
    const value = process.env[name];
    if (!value) {
      missing.push(name);
      console.log(`  ${name.padEnd(24)} MISSING`);
    } else {
      // Length only. Enough to spot a truncated paste or a stray quote; never
      // enough to reconstruct anything.
      console.log(`  ${name.padEnd(24)} present (${value.length} chars)`);
      if (value !== value.trim()) {
        console.log(`  ${" ".repeat(24)} ⚠ has leading/trailing whitespace — X will reject this`);
      }
    }
  }

  if (missing.length) {
    console.log(`\n✗ ${missing.length} variable(s) missing from this shell: ${missing.join(", ")}`);
    console.log(
      `\nNote: credentials set in Vercel are NOT visible here. Vercel injects them into\n` +
        `its own builds and functions only — and nothing in the deployed app reads them.\n` +
        `See the deployment note in docs/social.md.`
    );
    process.exitCode = 1;
    return;
  }

  const creds = readXCredentials();
  if (!creds) {
    console.log("\n✗ readXCredentials() returned null despite all four being set.");
    process.exitCode = 1;
    return;
  }

  // ---- the live call --------------------------------------------------------
  console.log("\n── Authenticating");
  console.log("  GET https://api.x.com/2/users/me");
  console.log("  (signed with the same code path the publisher uses)");

  const result = await verifyXCredentials(creds);

  if (!result.ok) {
    console.log(`\n✗ AUTHENTICATION FAILED${result.status ? ` — HTTP ${result.status}` : ""}`);
    console.log(`  ${result.error}`);
    if (result.status === 401) {
      console.log(
        `\n  A 401 means one of: a wrong value, a value with stray whitespace, tokens\n` +
          `  from a different app than the API key, or tokens regenerated after the\n` +
          `  ones you copied. It does NOT indicate a missing write permission.`
      );
    }
    if (result.status === 403) {
      console.log(
        `\n  A 403 here usually means the app lacks the read permission or is not\n` +
          `  attached to a project in the X developer portal.`
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\n✓ AUTHENTICATED — HTTP ${result.status}`);
  console.log(`  Account : @${result.handle ?? "(handle not returned)"}`);
  console.log(`  Name    : ${result.displayName ?? "(not returned)"}`);
  console.log(`  User id : ${result.userId ?? "(not returned)"}`);

  console.log(`\n── What this does and does not prove`);
  console.log(`  PROVEN : the four values are valid, and this repository's OAuth 1.0a`);
  console.log(`           signing produces a signature X accepts.`);
  console.log(`  PROVEN : posts would go to @${result.handle ?? "?"} — check that is the right account.`);
  console.log(`  NOT PROVEN : that the token has WRITE permission. X does not expose the`);
  console.log(`           permission level here, so a read-only token passes this check and`);
  console.log(`           fails at the first post with HTTP 403. If you regenerated the`);
  console.log(`           tokens AFTER setting the app to Read and Write, you are fine —`);
  console.log(`           tokens issued before that change keep the old permission.`);

  console.log(`\nNothing was published. SOCIAL_POST_ENABLED is ${process.env.SOCIAL_POST_ENABLED === "true" ? "TRUE" : "not set — publishing remains disabled"}.`);
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
