import { mountRuleForm } from "./rule-form.js";
import {
  mountSiteControls,
  mountGlobalControls,
  mountSavedRules,
} from "./controls.js";
import {
  getBlockedUrls,
  ruleLabel,
  onBlockedUrlsChanged,
  removeBlockedUrl,
} from "./blocklist.js";

const urlInput = document.getElementById("urlInput");
const addButton = document.getElementById("addButton");
const blockedUrlsList = document.getElementById("blockedUrlsList");
const logsContainer = document.getElementById("logsContainer");
const logCount = document.getElementById("logCount");
const refreshButton = document.getElementById("refreshButton");
const clearLogsButton = document.getElementById("clearLogsButton");
const noLogsMessage = document.getElementById("noLogsMessage");
const selectorButton = document.getElementById("selectorButton");
const stopSelectorButton = document.getElementById("stopSelectorButton");
const statusMessage = document.getElementById("statusMessage");

// URL display configuration
const MAX_DISPLAYED_URLS = 10;
let showAllUrls = false;

// One formatter for every row; toLocaleTimeString builds a new one per call
const timeFormat = new Intl.DateTimeFormat([], {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

// Logs redraw when background.js saves new entries, instead of polling.
// While the panel is hidden, keep only the newest list and draw it on return.
let pendingLogs = null;
let renderedLogsKey = "";

// document.hidden only covers a hidden DevTools window. devtools.js calls this
// when another DevTools tab (Elements, Console...) comes to the front. Set
// before any await so an early call isn't missed.
let panelShown = true;
const isPanelHidden = () => document.hidden || !panelShown;
globalThis.setPanelShown = (shown) => {
  panelShown = shown;
  drawPendingLogs();
};

function drawPendingLogs() {
  if (isPanelHidden() || !pendingLogs) return;
  const logs = pendingLogs;
  pendingLogs = null;
  renderBlockedLogs(logs);
}

renderBlockedUrls(await getBlockedUrls());
onBlockedUrlsChanged(renderBlockedUrls);

if (!chrome.declarativeNetRequest.onRuleMatchedDebug) {
  document.getElementById("logHeading").textContent = "Content interventions";
  const note = document.createElement("p");
  note.className = "row-desc";
  note.textContent =
    "Network logs are unavailable in this install. Chrome shows this tab’s request count on the toolbar. This log contains observed heavy-content removals.";
  document.getElementById("logHeading").closest(".pane-head").after(note);
}
loadBlockedLogs();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.blockedUrlLogs) {
    showBlockedLogs(changes.blockedUrlLogs.newValue || []);
  }
});
document.addEventListener("visibilitychange", drawPendingLogs);

mountRuleForm(urlInput, addButton, statusMessage);

refreshButton.addEventListener("click", loadBlockedLogs);
clearLogsButton.addEventListener("click", () =>
  chrome.storage.local.set({ blockedUrlLogs: [] }),
);

function setSelectorActive(isActive) {
  selectorButton.hidden = isActive;
  stopSelectorButton.hidden = !isActive;
}

// background.js loads the picker into the inspected tab and forwards these
async function sendSelectorMessage(action) {
  return chrome.runtime.sendMessage({
    action,
    tabId: chrome.devtools.inspectedWindow.tabId,
  });
}

selectorButton.addEventListener("click", async () => {
  const response = await sendSelectorMessage("startSelector");
  if (response?.status === "Selector activated") {
    statusMessage.textContent = "";
    setSelectorActive(true);
  } else {
    statusMessage.textContent = "The selector can't run on this page.";
  }
});

stopSelectorButton.addEventListener("click", async () => {
  await sendSelectorMessage("stopSelector");
  setSelectorActive(false);
});

// The picker reports back when it finishes, after a pick or Esc
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "selectorStopped") setSelectorActive(false);
});

function renderBlockedUrls(blockedUrls) {
  if (blockedUrls.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No URLs blocked yet.";
    blockedUrlsList.replaceChildren(empty);
    return;
  }

  const displayedUrls = showAllUrls
    ? blockedUrls
    : blockedUrls.slice(0, MAX_DISPLAYED_URLS);

  const rows = document.createDocumentFragment();
  for (const url of displayedUrls) {
    const urlRow = document.createElement("div");
    urlRow.className = "url-row";

    const urlText = document.createElement("span");
    urlText.textContent = ruleLabel(url);
    urlText.title = url;

    const removeButton = document.createElement("button");
    removeButton.textContent = "×";
    removeButton.title = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${url}`);
    removeButton.addEventListener("click", async () => {
      removeButton.disabled = true;
      try {
        await removeBlockedUrl(url);
      } catch (error) {
        statusMessage.textContent = error.message;
        removeButton.disabled = false;
      }
    });

    urlRow.append(urlText, removeButton);
    rows.append(urlRow);
  }

  if (blockedUrls.length > MAX_DISPLAYED_URLS) {
    const showMoreButton = document.createElement("button");
    showMoreButton.className = "show-more-btn";
    showMoreButton.textContent = showAllUrls
      ? "Show fewer URLs"
      : `Show all URLs (${blockedUrls.length})`;
    showMoreButton.addEventListener("click", () => {
      showAllUrls = !showAllUrls;
      renderBlockedUrls(blockedUrls);
    });
    rows.append(showMoreButton);
  }

  blockedUrlsList.replaceChildren(rows);
}

async function loadBlockedLogs() {
  const { blockedUrlLogs = [] } =
    await chrome.storage.local.get("blockedUrlLogs");
  showBlockedLogs(blockedUrlLogs);
}

function showBlockedLogs(logs) {
  if (isPanelHidden()) {
    pendingLogs = logs;
    return;
  }
  pendingLogs = null;
  renderBlockedLogs(logs);
}

function renderBlockedLogs(logs) {
  // Same length and same newest entry means nothing new to draw
  const newest = logs.at(-1);
  const key = newest ? `${logs.length}|${newest.timestamp}|${newest.url}` : "0";
  if (key === renderedLogsKey) return;
  renderedLogsKey = key;

  logCount.textContent = logs.length ? logs.length.toLocaleString() : "";

  if (!chrome.declarativeNetRequest.onRuleMatchedDebug) {
    noLogsMessage.textContent =
      "Detailed network logs are unavailable in this install. Chrome shows this tab’s request count on the toolbar. Heavy-content removals appear here when observed.";
  }
  if (logs.length === 0) {
    logsContainer.hidden = true;
    logsContainer.replaceChildren();
    noLogsMessage.hidden = false;
    return;
  }

  // Most recent first, built off-document and swapped in once
  const rows = document.createDocumentFragment();
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    const logEntry = document.createElement("li");
    logEntry.className = "log-entry";

    const logTime = document.createElement("span");
    logTime.className = "log-time";
    logTime.textContent = timeFormat.format(new Date(log.timestamp));

    const logUrl = document.createElement("span");
    logUrl.className = "log-url";
    logUrl.textContent = log.url;
    logUrl.title = log.url;

    logEntry.append(logTime, logUrl);
    rows.append(logEntry);
  }

  logsContainer.replaceChildren(rows);
  noLogsMessage.hidden = true;
  logsContainer.hidden = false;
}

await mountGlobalControls(document.getElementById("globalControls"));
await mountSavedRules(document.getElementById("savedRules"));
if (chrome.devtools?.inspectedWindow) {
  const tab = await chrome.tabs.get(chrome.devtools.inspectedWindow.tabId);
  await mountSiteControls(document.getElementById("siteControls"), tab);
  chrome.devtools.network.onNavigated.addListener(() => location.reload());
}
