import { mountSiteControls, mountSavedRules } from "./controls.js";
import {
  addBlockedUrl,
  getBlockedUrls,
  onBlockedUrlsChanged,
} from "./blocklist.js";
import {
  getPausedSites,
  getSettings,
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
  sites: (await getPausedSites()).length,
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
onPausedSitesChanged((sites) => {
  counts.sites = sites.length;
  renderSummary();
});
document.getElementById("manageButton").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// Show the picker shortcut, which may have been changed at chrome://extensions/shortcuts
const [pickerCommand] = await chrome.commands
  .getAll()
  .then((commands) =>
    commands.filter(
      (command) => command.name === "start-picker" && command.shortcut,
    ),
  );
if (pickerCommand) {
  const pickerShortcut = document.getElementById("pickerShortcut");
  pickerShortcut.textContent = pickerCommand.shortcut;
  pickerShortcut.hidden = false;
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
  aggressiveHeavyAds: document.getElementById("aggressiveHeavyAdsToggle"),
  annoyanceRules: document.getElementById("annoyanceRulesToggle"),
};
const settings = await getSettings();
for (const [key, checkbox] of Object.entries(toggles)) {
  checkbox.checked = settings[key];
  checkbox.addEventListener("change", async () => {
    try {
      await updateSettings({ [key]: checkbox.checked });
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

// "Pause on this site", for web pages only
const [activeTab] = await chrome.tabs.query({
  active: true,
  currentWindow: true,
});
if (/^https?:/.test(activeTab?.url ?? "")) {
  const site = siteKey(new URL(activeTab.url).hostname);
  const pauseSiteToggle = document.getElementById("pauseSiteToggle");
  document.getElementById("siteName").textContent = site;
  pauseSiteToggle.checked = (await getPausedSites()).includes(site);
  document.getElementById("siteRow").hidden = false;

  // background.js updates the rules, then reloads the tab
  pauseSiteToggle.addEventListener("change", () => {
    chrome.runtime.sendMessage({
      action: "pauseSite",
      site,
      paused: pauseSiteToggle.checked,
      tabId: activeTab.id,
    });
  });
}

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

async function addUrl() {
  const url = urlInput.value.trim();
  if (!url) return;

  try {
    const added = await addBlockedUrl(url);
    statusMessage.textContent = added ? "" : "This URL is already blocked.";
    if (added) urlInput.value = "";
  } catch (error) {
    statusMessage.textContent = error.message;
  }
}

addButton.addEventListener("click", addUrl);
urlInput.addEventListener("keyup", (event) => {
  if (event.key === "Enter") addUrl();
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
