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
const HEAVY_AD_GUARD_ID = "heavy-ad-guard";
const FRAME_COLLAPSE_ID = "frame-collapse";
// Chrome's own heavy ad rule unloads ad frames past this much download
const HEAVY_AD_BYTES = 4 * 1024 * 1024;
// Block rules use IDs 1..N, so the paused-sites rule sits far above them
const PAUSED_SITES_RULE_ID = 1_000_000;
const BADGE_COLOR = "#3a6d45";
const MIDNIGHT_ALARM = "midnight";
const PICKER_COMMAND = "start-picker";

// Only fires for unpacked installs with the declarativeNetRequestFeedback permission
const canCountBlocks = Boolean(chrome.declarativeNetRequest.onRuleMatchedDebug);

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Block ad element",
    contexts: ["all"],
  });

  queue(moveSettingsToSync);
  queue(syncDynamicRules);
  // An update resets rulesets to their manifest defaults, so reapply
  queue(async () => applySettings(await getSettings()));
  setUpBadge();
});

chrome.runtime.onStartup.addListener(setUpBadge);

onBlockedUrlsChanged(() => queue(syncDynamicRules));
onPausedSitesChanged(() => queue(syncDynamicRules));
onSettingsChanged((settings) => {
  heavyAdsOn = settings.heavyAds;
  queue(() => applySettings(settings));
});

// Rule and log updates read, then write. Running them one at a time stops two
// quick changes from overwriting each other.
let pending = Promise.resolve();
function queue(task) {
  pending = pending.then(task).catch((error) => console.error(error));
  return pending;
}

// 1.5.0 moved these from storage.local to storage.sync. On a second
// computer sync may already hold the first one's data: lists are merged so
// neither computer loses entries, and the synced switches win.
const SYNCED_KEYS = ["blockedUrls", "settings", "pausedSites"];
async function moveSettingsToSync() {
  const local = await chrome.storage.local.get(SYNCED_KEYS);
  const keys = Object.keys(local);
  if (keys.length === 0) return;

  const synced = await chrome.storage.sync.get(keys);
  const updates = {};
  for (const key of keys) {
    if (synced[key] === undefined) {
      updates[key] = local[key];
    } else if (Array.isArray(synced[key]) && Array.isArray(local[key])) {
      updates[key] = [...new Set([...synced[key], ...local[key]])];
    }
  }
  // If this throws (sync full), local keeps the data for the next try
  if (Object.keys(updates).length > 0) await chrome.storage.sync.set(updates);
  await chrome.storage.local.remove(keys);
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

async function applySettings({ videoAdRules, autoplayGuard, annoyanceRules, heavyAds }) {
  const rulesets = {
    [VIDEO_AD_RULESET_ID]: videoAdRules,
    [ANNOYANCES_RULESET_ID]: annoyanceRules,
  };
  const ids = Object.keys(rulesets);
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: ids.filter((id) => rulesets[id]),
    disableRulesetIds: ids.filter((id) => !rulesets[id]),
  });

  await setFrameScript(AUTOPLAY_GUARD_ID, "autoplay-guard.js", autoplayGuard);
  await setFrameScript(HEAVY_AD_GUARD_ID, "heavy-ad-guard.js", heavyAds);
  // Both of those can unload a frame and ask its parent to hide the box
  await setFrameScript(FRAME_COLLAPSE_ID, "frame-collapse.js", autoplayGuard || heavyAds);
}

// Registered rather than listed in the manifest, so turning one off removes
// it from every page
async function setFrameScript(id, file, enabled) {
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (enabled && registered.length === 0) {
    await chrome.scripting.registerContentScripts([
      {
        id,
        js: [file],
        matches: ["<all_urls>"],
        allFrames: true, // Ads usually run inside iframes
        matchOriginAsFallback: true, // Includes about:blank ad frames
        runAt: "document_start",
      },
    ]);
  } else if (!enabled && registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
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
  scheduleMidnightReset();
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

// Clears the badge at local midnight instead of waiting for the first block
// of the new day. The stored count needs no reset: it's tied to its date.
function scheduleMidnightReset() {
  const nextMidnight = new Date();
  nextMidnight.setHours(24, 0, 1, 0); // Rolls into tomorrow, DST included
  chrome.alarms.create(MIDNIGHT_ALARM, { when: nextMidnight.getTime() });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== MIDNIGHT_ALARM) return;
  scheduleMidnightReset();
  if (canCountBlocks) chrome.action.setBadgeText({ text: "" });
});

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

// Heavy ads: adds up what each third-party frame downloads, counting nested
// frames toward the frame directly under the page, and unloads it past
// HEAVY_AD_BYTES. heavy-ad-guard.js covers CPU use from inside the frame.
// The listener has to be added at startup to wake the worker, so the
// setting is checked inside it.
let heavyAdsOn = true;
getSettings().then((settings) => (heavyAdsOn = settings.heavyAds));

const frameTrees = new Map(); // tabId -> { parents, bytes, removed }
const MAX_FRAME_DEPTH = 20;

chrome.tabs.onRemoved.addListener((tabId) => frameTrees.delete(tabId));

chrome.webRequest.onHeadersReceived.addListener(
  countFrameBytes,
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

function countFrameBytes(details) {
  if (!heavyAdsOn || details.tabId < 0) return;
  if (details.type === "main_frame") {
    frameTrees.delete(details.tabId); // New page, new frames
    return;
  }
  if (details.frameId === 0) return; // The page's own requests

  let tree = frameTrees.get(details.tabId);
  if (!tree) {
    tree = { parents: new Map(), bytes: new Map(), removed: new Set() };
    frameTrees.set(details.tabId, tree);
  }
  tree.parents.set(details.frameId, details.parentFrameId);

  let adFrame = details.frameId;
  for (let depth = 0; depth < MAX_FRAME_DEPTH; depth++) {
    const parent = tree.parents.get(adFrame);
    if (!parent) break; // 0 is the page, undefined is unknown
    adFrame = parent;
  }
  if (tree.removed.has(adFrame)) return;

  const header = details.responseHeaders?.find(
    (h) => h.name.toLowerCase() === "content-length"
  );
  const size = Number(header?.value) || 0;
  if (size === 0) return;

  const total = (tree.bytes.get(adFrame) ?? 0) + size;
  tree.bytes.set(adFrame, total);
  if (total >= HEAVY_AD_BYTES) {
    tree.removed.add(adFrame);
    removeHeavyFrame(details.tabId, adFrame, total).catch(() => {
      // The frame may already be gone
    });
  }
}

async function removeHeavyFrame(tabId, frameId, bytes) {
  const [{ result: url } = {}] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: unloadThirdPartyFrame,
    args: [await getPausedSites()],
  });
  if (url) logBlockedUrl(`Heavy ad (${(bytes / 1048576).toFixed(1)} MB): ${url}`);
}

// Runs inside the frame. Returns its URL if it was unloaded.
function unloadThirdPartyFrame(pausedSites) {
  const siteOf = (origin) => new URL(origin).hostname.replace(/^www\./, "");
  let frameSite = "";
  let topSite = "";
  try {
    frameSite = siteOf(self.origin);
    topSite = siteOf(location.ancestorOrigins[location.ancestorOrigins.length - 1]);
  } catch {
    // Opaque origin: a sandboxed ad frame
  }
  const sameSite =
    frameSite &&
    (frameSite === topSite || frameSite.endsWith(`.${topSite}`) || topSite.endsWith(`.${frameSite}`));
  const paused = pausedSites.some((site) => topSite === site || topSite.endsWith(`.${site}`));
  // A frame the user clicked (a video they started) is never unloaded
  if (sameSite || paused || navigator.userActivation.hasBeenActive) return null;

  const url = location.href;
  parent.postMessage("url-blocker:collapse-frame", "*"); // frame-collapse.js hides the box
  location.replace("about:blank"); // Stops every script and download in it
  return url;
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

// Keyboard shortcut (Alt+Shift+K unless changed at chrome://extensions/shortcuts)
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== PICKER_COMMAND || !(tab?.id >= 0)) return;
  sendToTab(tab.id, { action: "startSelector" }).catch((error) =>
    console.warn("Can't start the selector on this page:", error.message)
  );
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !(tab?.id >= 0)) return;
  sendToTab(tab.id, { action: "startSelector" }).catch((error) =>
    console.warn("Can't start the selector on this page:", error.message)
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "blockUrl":
      addBlockedUrl(message.url)
        .then((added) => sendResponse({ added }))
        .catch((error) => sendResponse({ error: error.message }));
      return true; // Keep the channel open for the async response

    case "startSelector":
    case "stopSelector":
      sendToTab(message.tabId, { action: message.action })
        .then(sendResponse)
        .catch((error) => sendResponse({ error: error.message }));
      return true;

    case "heavyAdRemoved":
      logBlockedUrl(`Heavy ad (${message.reason}): ${message.url}`);
      return;

    case "pauseSite":
      pauseSite(message.site, message.paused, message.tabId)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ error: error.message }));
      return true;
  }
});
