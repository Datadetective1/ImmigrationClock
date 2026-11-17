import {
  TRIAL_URL,
  formatCutoff,
  formatDay,
  isNewer,
  movementWords,
  pagesFor,
  pickLabel,
  store,
} from "./shared.js";

const $ = (id) => document.getElementById(id);
const show = (id) => {
  for (const s of ["loading", "error", "setup", "card"]) $(s).hidden = s !== id;
};

async function loadFeed() {
  let { feed } = await store.get("feed");
  if (!feed) {
    await chrome.runtime.sendMessage({ type: "check-now" }).catch(() => {});
    ({ feed } = await store.get("feed"));
  }
  return feed;
}

function fillSetup(feed, choice, notify) {
  const cat = $("category");
  cat.innerHTML = "";
  for (const [section, title] of [["employment", "Employment-based"], ["family", "Family-sponsored"]]) {
    const group = document.createElement("optgroup");
    group.label = title;
    for (const c of feed.categories.filter((x) => x.section === section)) {
      const o = document.createElement("option");
      o.value = `${c.section}:${c.row}`;
      o.textContent = `${c.label}: ${c.hint}`;
      group.append(o);
    }
    cat.append(group);
  }
  const country = $("country");
  country.innerHTML = "";
  for (const c of feed.countries) {
    const o = document.createElement("option");
    o.value = c.key;
    o.textContent = c.label;
    country.append(o);
  }
  cat.value = choice ? `${choice.section}:${choice.row}` : "employment:EB2";
  country.value = choice?.country ?? "all";
  $("notify").checked = notify !== false;
  show("setup");
}

function fillCard(feed, choice, isNew, fetchedAt) {
  const { cat, country } = pickLabel(feed, choice);
  const cell = feed.latest.dates?.[choice.section]?.[choice.row]?.[choice.country];
  if (!cat || !country || !cell) return false;
  const prev = feed.previous?.dates?.[choice.section]?.[choice.row]?.[choice.country];
  const pages = pagesFor(feed, choice);

  $("new-flag").hidden = !isNew;
  $("pair-label").textContent = `${cat.label} · ${country.label}`;
  $("month").textContent = `${feed.latest.label} Visa Bulletin`;
  $("final").textContent = formatCutoff(cell.finalAction);
  $("filing").textContent = formatCutoff(cell.filing);
  $("final-move").textContent = movementWords(prev?.finalAction, cell.finalAction, feed.previous?.label);
  $("filing-move").textContent = movementWords(prev?.filing, cell.filing, feed.previous?.label);
  $("detail").href = pages.detail;
  $("detail").textContent = pages.detailLabel;
  $("source").href = pages.source;
  $("trial").href = TRIAL_URL;

  const checked = formatDay(feed.latest.verifiedAt);
  const read = fetchedAt ? new Date(fetchedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  $("foot").textContent =
    `Checked against the official bulletin on ${checked}. ` +
    "This extension looks for a new month on ImmigrationClock once a day; new months appear here " +
    "after we check them, usually some days after the State Department publishes." +
    (read ? ` Last looked ${read}.` : "");
  show("card");
  return true;
}

async function render() {
  show("loading");
  const feed = await loadFeed();
  if (!feed?.latest) return show("error");
  const { choice, seenId, notify, fetchedAt } = await store.get(["choice", "seenId", "notify", "fetchedAt"]);
  const isNew = Boolean(seenId) && isNewer(feed.latest.id, seenId);

  // Opening the popup counts as seeing the month.
  await store.set({ seenId: feed.latest.id });
  await chrome.action.setBadgeText({ text: "" });

  if (!choice || !fillCard(feed, choice, isNew, fetchedAt)) fillSetup(feed, choice, notify);

  $("change").onclick = () => fillSetup(feed, choice, notify);
  $("save").onclick = async () => {
    const [section, row] = $("category").value.split(":");
    const next = { section, row, country: $("country").value };
    await store.set({ choice: next, notify: $("notify").checked });
    const { fetchedAt: f } = await store.get("fetchedAt");
    fillCard(feed, next, false, f);
    $("change").onclick = () => fillSetup(feed, next, $("notify").checked);
  };
}

render();
