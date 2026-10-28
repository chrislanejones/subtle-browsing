import { mountRuleForm } from "./rule-form.js";
import { mountSiteControls } from "./controls.js";
import { getBlockedUrls, onBlockedUrlsChanged } from "./blocklist.js";
import {
  getPauseState,
  getAllPausedSites,
  getSettings,
  onPausedEverywhereChanged,
  onPausedSitesChanged,
  onSettingsChanged,
  siteKey,
  updateSettings,
} from "./settings.js";

const urlInput = document.getElementById("urlInput");
const addButton = document.getElementById("addButton");
const selectorButton = document.getElementById("selectorButton");
const statusMessage = document.getElementById("statusMessage");

// The full lists live on the settings page; the popup shows counts
const manageSummary = document.getElementById("manageSummary");
let counts = {
  urls: (await getBlockedUrls()).length,
  sites: (await getAllPausedSites()).length,
};
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function renderSummary() {
  manageSummary.textContent = `${plural(counts.urls, "blocked URL")} · ${plural(counts.sites, "paused site")}`;
}
renderSummary();
onBlockedUrlsChanged((urls) => {
  counts.urls = urls.length;
  renderSummary();
});
async function renderPauseCount() {
  counts.sites = (await getAllPausedSites()).length;
  renderSummary();
}
onPausedSitesChanged(renderPauseCount);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.temporaryPauses) renderPauseCount();
});
document.getElementById("manageButton").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// Show the shortcuts, which may have been changed at chrome://extensions/shortcuts
const commands = await chrome.commands.getAll();
for (const [name, id] of [
  ["start-picker", "pickerShortcut"],
  ["toggle-site", "toggleShortcut"],
]) {
  const shortcut = commands.find((command) => command.name === name)?.shortcut;
  if (!shortcut) continue;
  const key = document.getElementById(id);
  key.textContent = shortcut;
  key.hidden = false;
}

// Blocking switches, saved as soon as they change
const toggles = {
  videoAdRules: document.getElementById("videoAdRulesToggle"),
  autoplayGuard: document.getElementById("autoplayGuardToggle"),
  heavyAds: document.getElementById("heavyAdsToggle"),
  notificationRules: document.getElementById("notificationRulesToggle"),
  adChurnRules: document.getElementById("adChurnRulesToggle"),
  refreshThrottle: document.getElementById("refreshThrottleToggle"),
  adRedirectGuard: document.getElementById("adRedirectGuardToggle"),
  pinnedAds: document.getElementById("pinnedAdsToggle"),
  aggressiveHeavyAds: document.getElementById("aggressiveHeavyAdsToggle"),
  annoyanceRules: document.getElementById("annoyanceRulesToggle"),
};
const settings = await getSettings();
for (const [key, checkbox] of Object.entries(toggles)) {
  checkbox.checked = settings[key];
  checkbox.addEventListener("change", async () => {
    try {
      await updateSettings({ [key]: checkbox.checked });
      statusMessage.textContent =
        "Default saved. Reload open pages to apply all changes.";
    } catch (error) {
      checkbox.checked = !checkbox.checked;
      statusMessage.textContent = error.message;
    }
  });
}

onSettingsChanged((settings) => {
  for (const [key, checkbox] of Object.entries(toggles))
    checkbox.checked = settings[key];
});

// On / Off on site / Off / 10 min off. The two site choices need a web page,
// and a timed pause can only start while blocking is on.
const [activeTab] = await chrome.tabs.query({
  active: true,
  currentWindow: true,
});
const site = /^https?:/.test(activeTab?.url ?? "")
  ? siteKey(new URL(activeTab.url).hostname)
  : null;
const powerInputs = [...document.querySelectorAll('input[name="power"]')];
const powerState = document.getElementById("powerState");
const powerDesc = document.getElementById("powerDesc");
const powerStatus = document.getElementById("powerStatus");
const clock = (time) =>
  new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

let confirmedPower = "on";
function enablePower() {
  for (const input of powerInputs)
    input.disabled =
      (input.value === "site" && !site) ||
      (input.value === "temporary" &&
        (!site || !["on", "temporary"].includes(confirmedPower)));
}
async function renderPower() {
  const state = await getPauseState(site);
  confirmedPower =
    state.mode === "site" && state.until && !state.permanent
      ? "temporary"
      : state.mode;
  for (const input of powerInputs)
    input.checked = input.value === confirmedPower;
  enablePower();
  powerState.textContent = {
    on: "On",
    site: "Off on this site",
    everywhere: "Off everywhere",
    temporary: `Off until ${clock(state.until)}`,
  }[confirmedPower];
  powerState.classList.toggle("off", confirmedPower !== "on");
  const name = document.createElement("b");
  name.textContent = site;
  if (state.mode === "everywhere")
    powerDesc.textContent = "Nothing is blocked on any site.";
  else if (state.mode === "site") {
    powerDesc.replaceChildren("Nothing is blocked on ", name, ".");
    if (state.until) powerDesc.append(` Resumes at ${clock(state.until)}.`);
    if (state.inheritedFrom)
      powerDesc.append(
        ` Paused by ${state.inheritedFrom}. On also resumes that parent site and its subdomains.`,
      );
  } else if (site)
    powerDesc.replaceChildren(
      "Blocking on ",
      name,
      ". Changes reload the tab.",
    );
  else powerDesc.textContent = "Blocking on every site.";
}
await renderPower();
onPausedSitesChanged(renderPower);
onPausedEverywhereChanged(renderPower);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.temporaryPauses) renderPower();
});
async function changePower(mode) {
  for (const input of powerInputs) {
    input.checked = input.value === confirmedPower;
    input.disabled = true;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      action: "setPower",
      mode,
      site: site ?? undefined,
      tabId: site ? activeTab.id : undefined,
    });
    if (!response?.ok)
      throw new Error(response?.error ?? "Could not change blocking.");
    powerStatus.textContent = site ? "Saved. Tab reloaded." : "Saved.";
  } catch (error) {
    powerStatus.textContent = error.message;
  } finally {
    await renderPower();
  }
}
for (const input of powerInputs)
  input.addEventListener("change", () => changePower(input.value));

// The daily count needs the debug event, which only unpacked installs have
const blockedToday = document.getElementById("blockedToday");
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  const renderBlockedToday = (record) => {
    const today = new Date().toLocaleDateString("en-CA");
    const count = record?.date === today ? record.count : 0;
    const number = document.createElement("b");
    number.textContent = count.toLocaleString();
    const label = document.createElement("span");
    label.textContent = "blocked today";
    blockedToday.replaceChildren(number, " ", label);
  };
  renderBlockedToday(
    (await chrome.storage.local.get("blockedToday")).blockedToday,
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.blockedToday) {
      renderBlockedToday(changes.blockedToday.newValue);
    }
  });
  blockedToday.hidden = false;
}

mountRuleForm(urlInput, addButton, statusMessage, {
  modeSlot: document.getElementById("ruleModeSlot"),
  placeholders: {
    domain: "example.com",
    exact: "https://example.com/page",
    pattern: "||ads.example.com^",
  },
});

selectorButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const response = await chrome.runtime.sendMessage({
    action: "startSelector",
    tabId: tab.id,
  });
  if (response?.error) {
    statusMessage.textContent = "The selector can't run on this page.";
    return;
  }

  // Close the popup so the page can be clicked
  window.close();
});

await mountSiteControls(document.getElementById("siteControls"), activeTab);
