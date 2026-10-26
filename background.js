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
  setSitePaused,
} from "./settings.js";

const RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "other",
];
const MAX_LOG_ENTRIES = 100;
const LOG_FLUSH_DELAY_MS = 1000;
const CONTEXT_MENU_ID = "block-ad-element";
const VIDEO_AD_RULESET_ID = "video_ads";
const ANNOYANCES_RULESET_ID = "annoyances";
const AUTOPLAY_GUARD_ID = "autoplay-guard";
// Block rules use IDs 1..N, so the paused-sites rule sits far above them
const PAUSED_SITES_RULE_ID = 1_000_000;
const BADGE_COLOR = "#3a6d45";

// Only fires for unpacked installs with the declarativeNetRequestFeedback permission
const canCountBlocks = Boolean(chrome.declarativeNetRequest.onRuleMatchedDebug);

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Block ad element",
    contexts: ["all"],
  });

  queue(syncDynamicRules);
  // An update resets rulesets to their manifest defaults, so reapply
  queue(async () => applySettings(await getSettings()));
  setUpBadge();
});

chrome.runtime.onStartup.addListener(setUpBadge);

onBlockedUrlsChanged(() => queue(syncDynamicRules));
onPausedSitesChanged(() => queue(syncDynamicRules));
onSettingsChanged((settings) => queue(() => applySettings(settings)));

// Rule and log updates read, then write. Running them one at a time stops two
// quick changes from overwriting each other.
let pending = Promise.resolve();
function queue(task) {
  pending = pending.then(task).catch((error) => console.error(error));
  return pending;
}

// A bare domain blocks the site and its subdomains, but not look-alikes such
// as notexample.com. Anything with a path is matched as typed.
function toUrlFilter(entry) {
  const filter = /^[\w.-]+$/.test(entry) ? `||${entry}^` : entry;
  // Chrome rejects the whole rule set if one filter has non-ASCII characters
  return /^[\x20-\x7e]+$/.test(filter) ? filter : null;
}

async function syncDynamicRules() {
  const [blockedUrls, pausedSites, oldRules] = await Promise.all([
    getBlockedUrls(),
    getPausedSites(),
    chrome.declarativeNetRequest.getDynamicRules(),
  ]);

  const addRules = blockedUrls
    .map(toUrlFilter)
    .filter(Boolean)
    .map((urlFilter, index) => ({
      id: index + 1, // Rule IDs must be > 0
      priority: 1,
      action: { type: "block" },
      condition: { urlFilter, resourceTypes: RESOURCE_TYPES },
    }));

  // Lets everything on a paused site's pages through, including the
  // built-in lists, because it outranks every block rule
  if (pausedSites.length > 0) {
    addRules.push({
      id: PAUSED_SITES_RULE_ID,
      priority: 2,
      action: { type: "allowAllRequests" },
      condition: {
        requestDomains: pausedSites,
        resourceTypes: ["main_frame", "sub_frame"],
      },
    });
  }

  // One call swaps the old rules for the new ones
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRules.map((rule) => rule.id),
    addRules,
  });
}

async function applySettings({ videoAdRules, autoplayGuard, annoyanceRules }) {
  const rulesets = {
    [VIDEO_AD_RULESET_ID]: videoAdRules,
    [ANNOYANCES_RULESET_ID]: annoyanceRules,
  };
  const ids = Object.keys(rulesets);
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: ids.filter((id) => rulesets[id]),
    disableRulesetIds: ids.filter((id) => !rulesets[id]),
  });

  // Registered rather than listed in the manifest, so turning it off
  // removes it from every page
  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [AUTOPLAY_GUARD_ID],
  });
  if (autoplayGuard && registered.length === 0) {
    await chrome.scripting.registerContentScripts([
      {
        id: AUTOPLAY_GUARD_ID,
        js: ["autoplay-guard.js"],
        matches: ["<all_urls>"],
        allFrames: true, // Video ads often play inside iframes
        matchOriginAsFallback: true, // Includes about:blank ad frames
        runAt: "document_start",
      },
    ]);
  } else if (!autoplayGuard && registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [AUTOPLAY_GUARD_ID] });
  }
}

chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(({ request, rule }) => {
  // The paused-sites rule lets requests through; it doesn't block them
  if (rule.rulesetId === "_dynamic" && rule.ruleId === PAUSED_SITES_RULE_ID) return;
  logBlockedUrl(request.url);
});

// Local date, so "today" rolls over at the user's midnight
function today() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function badgeText(count) {
  if (count === 0) return "";
  return count < 1000 ? String(count) : `${Math.floor(count / 1000)}k`;
}

async function getBlockedToday() {
  const { blockedToday } = await chrome.storage.local.get("blockedToday");
  return blockedToday?.date === today() ? blockedToday.count : 0;
}

async function setUpBadge() {
  if (!canCountBlocks) {
    // Without the debug event there's no daily total, so let Chrome show
    // each tab's own blocked count instead
    await chrome.declarativeNetRequest.setExtensionActionOptions({
      displayActionCountAsBadgeText: true,
    });
    return;
  }
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  await chrome.action.setBadgeText({ text: badgeText(await getBlockedToday()) });
}

// An ad-heavy page can trigger dozens of blocks a second, so entries are
// batched into one storage write instead of one write per blocked request
let unsavedLogs = [];
let flushTimer;
function logBlockedUrl(url) {
  unsavedLogs.push({ timestamp: new Date().toISOString(), url });
  flushTimer ??= setTimeout(() => queue(flushLogs), LOG_FLUSH_DELAY_MS);
}

async function flushLogs() {
  flushTimer = undefined;
  const entries = unsavedLogs;
  unsavedLogs = [];

  const { blockedUrlLogs = [] } =
    await chrome.storage.local.get("blockedUrlLogs");
  const count = (await getBlockedToday()) + entries.length;
  await chrome.storage.local.set({
    blockedUrlLogs: [...blockedUrlLogs, ...entries].slice(-MAX_LOG_ENTRIES),
    blockedToday: { date: today(), count },
  });
  await chrome.action.setBadgeText({ text: badgeText(count) });
}

// The picker only loads into a page when it's needed, which keeps every other
// tab lighter. content.js guards against being loaded twice.
async function sendToTab(tabId, message) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
  return chrome.tabs.sendMessage(tabId, message);
}

// Rules only affect new requests, so the tab reloads once they're in place
async function pauseSite(site, paused, tabId) {
  await setSitePaused(site, paused);
  await queue(syncDynamicRules);
  await chrome.tabs.reload(tabId);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !(tab?.id >= 0)) return;
  sendToTab(tab.id, { action: "startSelector" }).catch((error) =>
    console.warn("Can't start the selector on this page:", error.message)
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "blockUrl":
      addBlockedUrl(message.url).then((added) => sendResponse({ added }));
      return true; // Keep the channel open for the async response

    case "startSelector":
    case "stopSelector":
      sendToTab(message.tabId, { action: message.action })
        .then(sendResponse)
        .catch((error) => sendResponse({ error: error.message }));
      return true;

    case "pauseSite":
      pauseSite(message.site, message.paused, message.tabId)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ error: error.message }));
      return true;
  }
});
