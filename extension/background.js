// Once a day, read ImmigrationClock's public bulletin file. If it holds a
// newer month than the one this browser last showed, mark the toolbar icon
// and, if the person left it on, show one notification.

import { fetchFeed, formatCutoff, isNewer, pagesFor, pickLabel, store } from "./shared.js";

const ALARM = "daily-bulletin-check";

async function check() {
  let feed;
  try {
    feed = await fetchFeed();
  } catch {
    return; // Keep the last copy; try again at the next check.
  }
  const { seenId, choice, notify = true } = await store.get(["seenId", "choice", "notify"]);
  await store.set({ feed, fetchedAt: new Date().toISOString() });

  // First run: nothing to compare with, so nothing is "new" yet.
  if (!seenId) {
    await store.set({ seenId: feed.latest.id });
    return;
  }
  if (!isNewer(feed.latest.id, seenId)) return;

  await chrome.action.setBadgeBackgroundColor({ color: "#2D7FF9" });
  await chrome.action.setBadgeText({ text: "NEW" });

  const { notifiedId } = await store.get("notifiedId");
  if (notify && notifiedId !== feed.latest.id) {
    let message = "Open ImmigrationClock to see your dates.";
    if (choice) {
      const { cat, country } = pickLabel(feed, choice);
      const cell = feed.latest.dates?.[choice.section]?.[choice.row]?.[choice.country];
      if (cat && country && cell) {
        message = `${cat.label}, ${country.label}: final action ${formatCutoff(cell.finalAction)}, filing ${formatCutoff(cell.filing)}.`;
      }
    }
    chrome.notifications.create(`bulletin-${feed.latest.id}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: `${feed.latest.label} Visa Bulletin added`,
      message,
    });
    await store.set({ notifiedId: feed.latest.id });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 1 });
  check();
});

chrome.runtime.onStartup.addListener(async () => {
  if (!(await chrome.alarms.get(ALARM))) chrome.alarms.create(ALARM, { periodInMinutes: 24 * 60 });
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) check();
});

chrome.notifications.onClicked.addListener(async (id) => {
  const { feed, choice } = await store.get(["feed", "choice"]);
  const url = feed && choice ? pagesFor(feed, choice).detail : "https://immigrationclock.com/visa-bulletin";
  chrome.tabs.create({ url });
  chrome.notifications.clear(id);
});

// The popup asks for a fresh read when it has nothing stored yet.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "check-now") {
    check().then(() => reply({ ok: true }));
    return true;
  }
});
