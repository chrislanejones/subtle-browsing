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
  getSiteSettings,
  setSiteSetting,
  validSite,
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
const REFRESH_THROTTLE_ID = "refresh-throttle";
const AD_REDIRECT_GUARD_ID = "ad-redirect-guard";
const PAGE_WORLD_POLICY_ID = "page-world-policy";
// Chrome's own heavy ad rule unloads ad frames past this much download
const HEAVY_AD_BYTES = 4 * 1024 * 1024;
// Block rules use IDs 1..N, so the paused-sites rule sits far above them
const PAUSED_SITES_RULE_ID = 1_000_000;
const BADGE_COLOR = "#3a6d45";
const MIDNIGHT_ALARM = "midnight";
const BADGE_WINDOW_ALARM = "badge-window";
// The count shows for the first this-many minutes of each hour, then the
// badge clears and only the icon shows
const BADGE_MINUTES = 7;
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
  queue(() => applySettings(settings));
});

// Rule and log updates read, then write. Running them one at a time stops two
// quick changes from overwriting each other.
let pending = Promise.resolve();
function queue(task) {
  const result = pending.then(task);
  pending = result.catch((error) => console.error(error));
  return result;
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
      priority: 3,
      action: { type: "block" },
      condition: { urlFilter, resourceTypes: RESOURCE_TYPES },
    }));

  // Lets everything on a paused site's pages through, including the
  // built-in lists, because it outranks every block rule
  if (pausedSites.length > 0) {
    addRules.push({
      id: PAUSED_SITES_RULE_ID,
      priority: 10,
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

async function applySettings({
  videoAdRules,
  autoplayGuard,
  annoyanceRules,
  notificationRules,
  adChurnRules,
  refreshThrottle,
  adRedirectGuard,
  heavyAds,
}) {
  const overrides = Object.values(await getSiteSettings());
  heavyAdsOn = heavyAds || overrides.some((s) => s.heavyAds);
  const rulesets = {
    [VIDEO_AD_RULESET_ID]: videoAdRules,
    [ANNOYANCES_RULESET_ID]: annoyanceRules,
    notifications: notificationRules,
    ad_churn: adChurnRules,
  };
  const ids = Object.keys(rulesets);
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: ids.filter((id) => rulesets[id]),
    disableRulesetIds: ids.filter((id) => !rulesets[id]),
  });

  await setFrameScript(
    AUTOPLAY_GUARD_ID,
    "autoplay-guard.js",
    autoplayGuard || overrides.some((s) => s.autoplayGuard),
  );
  await setFrameScript(
    HEAVY_AD_GUARD_ID,
    "heavy-ad-guard.js",
    heavyAds || overrides.some((s) => s.heavyAds),
  );
  // Both of those can unload a frame and ask its parent to hide the box
  await setFrameScript(
    FRAME_COLLAPSE_ID,
    "frame-collapse.js",
    autoplayGuard ||
      heavyAds ||
      overrides.some((s) => s.autoplayGuard || s.heavyAds),
  );
  // Google's ad tag runs in the top page, and only the page's own world can
  // wrap it; the isolated half passes in this site's on/off choice
  const throttleOn = refreshThrottle || overrides.some((s) => s.refreshThrottle);
  await setFrameScript(REFRESH_THROTTLE_ID, "refresh-throttle.js", throttleOn, {
    world: "MAIN",
    allFrames: false,
  });
  // Watches the top page's own navigations, so it lives in that world too
  const guardOn = adRedirectGuard || overrides.some((s) => s.adRedirectGuard);
  await setFrameScript(AD_REDIRECT_GUARD_ID, "ad-redirect-guard.js", guardOn, {
    world: "MAIN",
    allFrames: false,
  });
  await setFrameScript(
    PAGE_WORLD_POLICY_ID,
    "page-world-policy.js",
    throttleOn || guardOn,
    { allFrames: false },
  );
  // Renamed to page-world-policy.js; drop the old registration
  await setFrameScript("refresh-policy", "page-world-policy.js", false);
  await setFrameScript("cosmetic", "cosmetic.js", true);
  await syncSiteRules();
}

// Registered rather than listed in the manifest, so turning one off removes
// it from future pages; existing listeners consult the shared live policy
async function setFrameScript(id, file, enabled, options = {}) {
  // The page's world can't use chrome.storage, so it gets no policy cache
  const js = options.world === "MAIN" ? [file] : ["page-policy.js", file];
  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [id],
  });
  if (enabled && registered.length === 0) {
    await chrome.scripting.registerContentScripts([
      {
        id,
        js,
        matches: ["<all_urls>"],
        allFrames: true, // Ads usually run inside iframes
        matchOriginAsFallback: true, // Includes about:blank ad frames
        runAt: "document_start",
        ...options,
      },
    ]);
  } else if (enabled) {
    await chrome.scripting.updateContentScripts([
      { id, js },
    ]);
  } else if (!enabled && registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  }
}

chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(
  ({ request, rule }) => {
    // The paused-sites rule lets requests through; it doesn't block them
    if (rule.rulesetId === "_dynamic" && rule.ruleId === PAUSED_SITES_RULE_ID)
      return;
    if (rule.rulesetId === "_session" && sessionAllowIds.has(rule.ruleId))
      return;
    logBlockedUrl(request.url);
  },
);

// Local date, so "today" rolls over at the user's midnight
function today() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function badgeWindowOpen() {
  return new Date().getMinutes() < BADGE_MINUTES;
}

function badgeText(count) {
  if (count === 0 || !badgeWindowOpen()) return "";
  return count < 1000 ? String(count) : `${Math.floor(count / 1000)}k`;
}

async function getBlockedToday() {
  const { blockedToday } = await chrome.storage.local.get("blockedToday");
  return blockedToday?.date === today() ? blockedToday.count : 0;
}

async function setUpBadge() {
  scheduleMidnightReset();
  scheduleBadgeWindow();
  if (canCountBlocks)
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  await showBadge();
}

async function showBadge() {
  if (!canCountBlocks) {
    // Without the debug event there's no daily total, so let Chrome show
    // each tab's own blocked count instead
    await chrome.declarativeNetRequest.setExtensionActionOptions({
      displayActionCountAsBadgeText: badgeWindowOpen(),
    });
    return;
  }
  await chrome.action.setBadgeText({
    text: badgeText(await getBlockedToday()),
  });
}

// Wakes the worker when the count's window opens (the top of the hour) or
// closes (BADGE_MINUTES past), so the badge changes on time
function scheduleBadgeWindow() {
  const next = new Date();
  const closes = new Date(next).setMinutes(BADGE_MINUTES, 0, 0);
  if (Date.now() < closes) next.setTime(closes);
  else next.setHours(next.getHours() + 1, 0, 1, 0);
  chrome.alarms.create(BADGE_WINDOW_ALARM, { when: next.getTime() });
}

// Clears the badge at local midnight instead of waiting for the first block
// of the new day. The stored count needs no reset: it's tied to its date.
function scheduleMidnightReset() {
  const nextMidnight = new Date();
  nextMidnight.setHours(24, 0, 1, 0); // Rolls into tomorrow, DST included
  chrome.alarms.create(MIDNIGHT_ALARM, { when: nextMidnight.getTime() });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BADGE_WINDOW_ALARM) {
    scheduleBadgeWindow();
    showBadge();
    return;
  }
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
Promise.all([getSettings(), getSiteSettings()]).then(([settings, sites]) => {
  heavyAdsOn =
    settings.heavyAds || Object.values(sites).some((s) => s.heavyAds);
});

const frameTrees = new Map(); // tabId -> { parents, bytes, removed }
const MAX_FRAME_DEPTH = 20;

chrome.tabs.onRemoved.addListener((tabId) => frameTrees.delete(tabId));

chrome.webRequest.onHeadersReceived.addListener(
  countFrameBytes,
  { urls: ["<all_urls>"] },
  ["responseHeaders"],
);

function countFrameBytes(details) {
  if (details.tabId < 0) return;
  if (details.type === "main_frame") {
    frameTrees.delete(details.tabId); // New page, new frames
    return;
  }
  if (!heavyAdsOn || details.frameId === 0) return; // The page's own requests

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
    (h) => h.name.toLowerCase() === "content-length",
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
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (reason) => {
      if (window.top === window || navigator.userActivation.hasBeenActive)
        return;
      parent.postMessage(
        { type: "subtle:heavy", reason, url: location.href },
        "*",
      );
    },
    args: [`${(bytes / 1048576).toFixed(1)} MB`],
  });
}

// Tab-scoped exceptions also cover third-party subframes. A broad site pause
// still wins; personal URL rules outrank these category-only allows.
let sessionAllowIds = new Set();
const categoryFiles = {
  videoAdRules: "video-ads",
  annoyanceRules: "annoyances",
  notificationRules: "notifications",
  adChurnRules: "ad-churn",
};
const builtinRules = Promise.all(
  Object.entries(categoryFiles).map(async ([key, name]) => [
    key,
    await (await fetch(chrome.runtime.getURL(`rules/${name}.json`))).json(),
  ]),
);
function overridesFor(host, sites) {
  return Object.assign(
    {},
    ...Object.entries(sites)
      .filter(([site]) => host === site || host.endsWith(`.${site}`))
      .sort(([a], [b]) => a.length - b.length)
      .map(([, value]) => value),
  );
}
async function syncSiteRules() {
  const [settings, sites, tabs, old, lists] = await Promise.all([
    getSettings(),
    getSiteSettings(),
    chrome.tabs.query({}),
    chrome.declarativeNetRequest.getSessionRules(),
    builtinRules,
  ]);
  const rules = [];
  const allows = new Set();
  for (const tab of tabs) {
    if (!/^https?:/.test(tab.url ?? "")) continue;
    const custom = overridesFor(
      new URL(tab.url).hostname.replace(/^www\./, ""),
      sites,
    );
    for (const [key, list] of lists) {
      if (typeof custom[key] !== "boolean" || custom[key] === settings[key])
        continue;
      for (const rule of list) {
        const id = rules.length + 1;
        if (!custom[key]) allows.add(id);
        rules.push({
          ...rule,
          id,
          priority: custom[key] ? 1 : 2,
          action: custom[key] ? rule.action : { type: "allow" },
          condition: { ...rule.condition, tabIds: [tab.id] },
        });
      }
    }
  }
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: old.map((r) => r.id),
    addRules: rules,
  });
  sessionAllowIds = allows;
}
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.url || change.status === "loading") queue(syncSiteRules);
});
chrome.tabs.onRemoved.addListener(() => queue(syncSiteRules));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.siteSettings)
    queue(async () => applySettings(await getSettings()));
});
queue(syncSiteRules);

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
    console.warn("Can't start the selector on this page:", error.message),
  );
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !(tab?.id >= 0)) return;
  sendToTab(tab.id, { action: "startSelector" }).catch((error) =>
    console.warn("Can't start the selector on this page:", error.message),
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "setSiteSetting":
      queue(async () => {
        await setSiteSetting(message.site, message.key, message.value);
        await applySettings(await getSettings());
        if (Number.isInteger(message.tabId))
          await chrome.tabs.reload(message.tabId);
      })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ error: error.message }));
      return true;

    case "hideElement":
      // The host comes from the sender, never from page-supplied text.
      queue(async () => {
        const site = new URL(sender.url).hostname.replace(/^www\./, "");
        if (
          !validSite(site) ||
          typeof message.selector !== "string" ||
          message.selector.length > 2000 ||
          /[{}]/.test(message.selector)
        )
          throw new Error("Invalid element rule.");
        const { hiddenElements = [] } =
          await chrome.storage.sync.get("hiddenElements");
        if (
          !hiddenElements.some(
            (r) => r.site === site && r.selector === message.selector,
          )
        ) {
          await chrome.storage.sync.set({
            hiddenElements: [
              ...hiddenElements,
              { site, selector: message.selector },
            ],
          });
        }
      })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ error: error.message }));
      return true;

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
