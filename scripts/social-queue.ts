// =============================================================================
// scripts/social-queue.ts — what the account could say, and what became of it
//
//   npm run social:queue                 the committed queue, by status
//   npm run social:queue -- --refresh    rebuild against today's candidates first
//                                        (in memory; writes nothing)
//   npm run social:queue -- --status=ready
//
// Reads the editorial queue and prints it as an editor would want it: what is
// ready to go, what is waiting for a window, what was rejected and why. No model
// is called and nothing is written.
// =============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EVENT_INDEX } from "../src/lib/event-index";
import { candidatesFor } from "../src/lib/social/select";
import { chicagoParts } from "../src/lib/social/slots";
import { hashFacts } from "../src/lib/social/run";
import {
  EMPTY_QUEUE,
  parseQueue,
  refreshQueue,
  summarizeQueue,
  type EditorialQueue,
  type QueueStatus,
} from "../src/lib/social/queue";

const DEFAULT_QUEUE = "src/lib/generated/social-queue.json";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

function main() {
  const path = resolve(process.env.SOCIAL_QUEUE_PATH || DEFAULT_QUEUE);
  let raw: string | null = null;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    raw = null;
  }
  let queue: EditorialQueue = parseQueue(raw) ?? EMPTY_QUEUE;
  if (raw !== null && parseQueue(raw) === null) console.log(`WARNING: ${path} is unreadable; showing an empty queue.`);

  const now = new Date();
  const today = chicagoParts(now).date;

  if (process.argv.includes("--refresh")) {
    const r = refreshQueue(queue, candidatesFor(EVENT_INDEX, today), now, today, hashFacts);
    queue = r.queue;
    console.log(`Refreshed against ${today}: +${r.added} added, ${r.superseded} superseded, ${r.expired} expired (in memory only).\n`);
  }

  const only = arg("status") as QueueStatus | undefined;
  const s = summarizeQueue(queue);
  console.log("═".repeat(78));
  console.log(`EDITORIAL QUEUE — ${queue.items.length} item(s), updated ${queue.updatedAt}`);
  console.log(`ready ${s.ready} · scheduled ${s.scheduled} · verified ${s.verified} · published ${s.published} · rejected ${s.rejected} · superseded ${s.superseded}`);
  console.log("═".repeat(78));

  const order: QueueStatus[] = ["ready", "scheduled", "verified", "published", "superseded", "rejected"];
  for (const status of order) {
    if (only && status !== only) continue;
    const items = queue.items.filter((i) => i.status === status).sort((a, b) => b.priority - a.priority);
    if (!items.length) continue;
    console.log(`\n── ${status.toUpperCase()} (${items.length})`);
    for (const i of items) {
      console.log(`  ${i.contentType.padEnd(16)} ${i.tier.padEnd(10)} rv ${String(i.readerValue).padStart(3)}  ${i.headline.slice(0, 70)}`);
      console.log(`      ${i.shareUrl}`);
      if (i.suggestedPost) console.log(`      ready copy (${i.suggestedPost.structure ?? "?"}): ${i.suggestedPost.x.split("\n")[0].slice(0, 90)}`);
      const last = i.history[i.history.length - 1];
      if (last && (status === "rejected" || status === "superseded" || status === "scheduled")) console.log(`      ${last.reason}`);
      console.log(`      expires ${i.freshness.expiresAt}${i.scheduledFor ? ` · scheduled for ${i.scheduledFor}` : ""}`);
    }
  }
}

main();
