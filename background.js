import {
  addBlockedUrl,
  getBlockedUrls,
  onBlockedUrlsChanged,
} from "./blocklist.js";

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

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Block ad element",
    contexts: ["all"],
  });

  queue(async () => updateBlockRules(await getBlockedUrls()));
});

onBlockedUrlsChanged((blockedUrls) => queue(() => updateBlockRules(blockedUrls)));

// Rule and log updates read, then write. Running them one at a time stops two
// quick changes from overwriting each other.
let pending = Promise.resolve();
function queue(task) {
  pending = pending.then(task).catch((error) => console.error(error));
}

// A bare domain blocks the site and its subdomains, but not look-alikes such
// as notexample.com. Anything with a path is matched as typed.
function toUrlFilter(entry) {
  const filter = /^[\w.-]+$/.test(entry) ? `||${entry}^` : entry;
  // Chrome rejects the whole rule set if one filter has non-ASCII characters
  return /^[\x20-\x7e]+$/.test(filter) ? filter : null;
}

async function updateBlockRules(blockedUrls) {
  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  const addRules = blockedUrls
    .map(toUrlFilter)
    .filter(Boolean)
    .map((urlFilter, index) => ({
      id: index + 1, // Rule IDs must be > 0
      priority: 1,
      action: { type: "block" },
      condition: { urlFilter, resourceTypes: RESOURCE_TYPES },
    }));

  // One call swaps the old rules for the new ones
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRules.map((rule) => rule.id),
    addRules,
  });
}

// Only fires for unpacked installs with the declarativeNetRequestFeedback permission
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(({ request }) =>
  logBlockedUrl(request.url)
);

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
  await chrome.storage.local.set({
    blockedUrlLogs: [...blockedUrlLogs, ...entries].slice(-MAX_LOG_ENTRIES),
  });
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
  }
});
