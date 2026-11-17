// Shared by the popup and the background worker. No network code runs from
// anywhere but this file, and it only ever reads one public file.

export const SITE = "https://immigrationclock.com";
export const FEED_URL = `${SITE}/api/v1/visa-bulletin`;
export const TRIAL_URL = `${SITE}/trial`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isDate = (c) => typeof c === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c);

/** "2013-11-01" -> "Nov 1, 2013". "C" -> "Current". */
export function formatCutoff(c) {
  if (c === "C") return "Current";
  if (c === "U") return "Unavailable";
  if (!isDate(c)) return "Not listed";
  const [y, m, d] = c.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "2026-11-01" -> "Nov 1, 2026", for verifiedAt. */
export const formatDay = (d) => (isDate(d) ? formatCutoff(d) : "");

function gap(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  let months = (by - ay) * 12 + (bm - am);
  let days = bd - ad;
  if (days < 0) {
    months -= 1;
    days += new Date(Date.UTC(by, bm - 1, 0)).getUTCDate();
  }
  const parts = [];
  const years = Math.floor(months / 12);
  if (years) parts.push(`${years} yr`);
  if (months % 12) parts.push(`${months % 12} mo`);
  if (days || parts.length === 0) parts.push(`${days} d`);
  return parts.join(" ");
}

/** How one cell moved from the previous month, in plain words. */
export function movementWords(prev, cur, prevLabel) {
  if (prev === undefined || cur === undefined) return "";
  const since = prevLabel ? ` since ${prevLabel.split(" ")[0]}` : "";
  if (prev === cur) return `No change${since}`;
  if (cur === "C") return `Became current${since}`;
  if (cur === "U") return `Became unavailable${since}`;
  if (!isDate(prev)) return `Now dated${since}`;
  if (cur > prev) return `Moved ahead ${gap(prev, cur)}${since}`;
  return `Moved back ${gap(cur, prev)}${since}`;
}

/** Is month id a (e.g. "2026-12") newer than b? */
export const isNewer = (a, b) => typeof a === "string" && (!b || a > b);

export async function fetchFeed() {
  const res = await fetch(FEED_URL, { cache: "no-store", credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const feed = await res.json();
  if (feed?.schema !== 1 || !feed.latest?.id) throw new Error("Unexpected feed");
  return feed;
}

export const store = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (obj) => chrome.storage.local.set(obj),
};

export function pickLabel(feed, choice) {
  const cat = feed.categories.find((c) => c.section === choice.section && c.row === choice.row);
  const country = feed.countries.find((c) => c.key === choice.country);
  return { cat, country };
}

export function pagesFor(feed, choice) {
  const key = `${choice.section}:${choice.row}:${choice.country}`;
  const wait = feed.waitTimePages?.[key];
  return {
    detail: `${SITE}${wait ?? feed.latest.path}`,
    detailLabel: wait ? "Wait time for this category" : `${feed.latest.label} bulletin`,
    source: feed.latest.pdfUrl ?? feed.latest.sourceUrl,
  };
}
