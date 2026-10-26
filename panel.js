import {
  addBlockedUrl,
  getBlockedUrls,
  onBlockedUrlsChanged,
  removeBlockedUrl,
} from "./blocklist.js";

const urlInput = document.getElementById("urlInput");
const addButton = document.getElementById("addButton");
const blockedUrlsList = document.getElementById("blockedUrlsList");
const logsContainer = document.getElementById("logsContainer");
const refreshButton = document.getElementById("refreshButton");
const clearLogsButton = document.getElementById("clearLogsButton");
const noLogsMessage = document.getElementById("noLogsMessage");
const selectorButton = document.getElementById("selectorButton");
const stopSelectorButton = document.getElementById("stopSelectorButton");
const openInspectorButton = document.getElementById("openInspectorButton");
const statusMessage = document.getElementById("statusMessage");

// URL display configuration
const MAX_DISPLAYED_URLS = 10;
let showAllUrls = false;

renderBlockedUrls(await getBlockedUrls());
onBlockedUrlsChanged(renderBlockedUrls);

// Logs redraw when background.js saves new entries, instead of polling
loadBlockedLogs();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.blockedUrlLogs) {
    renderBlockedLogs(changes.blockedUrlLogs.newValue || []);
  }
});

async function addUrl() {
  const url = urlInput.value.trim();
  if (!url) return;

  const added = await addBlockedUrl(url);
  statusMessage.textContent = added ? "" : "This URL is already blocked.";
  if (added) urlInput.value = "";
}

addButton.addEventListener("click", addUrl);
urlInput.addEventListener("keyup", (event) => {
  if (event.key === "Enter") addUrl();
});

refreshButton.addEventListener("click", loadBlockedLogs);
clearLogsButton.addEventListener("click", () =>
  chrome.storage.local.set({ blockedUrlLogs: [] })
);

function setSelectorActive(isActive) {
  selectorButton.style.display = isActive ? "none" : "inline-flex";
  stopSelectorButton.style.display = isActive ? "inline-flex" : "none";
  selectorButton.classList.toggle("active", isActive);
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

// Chrome DevTools has no API to switch to another panel, so show instructions
openInspectorButton.addEventListener("click", () => {
  statusMessage.textContent =
    "Click 'Select Element to Block', then click the ad on the page.";
});

function renderBlockedUrls(blockedUrls) {
  if (blockedUrls.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No URLs blocked yet.";
    blockedUrlsList.replaceChildren(empty);
    return;
  }

  const displayedUrls = showAllUrls
    ? blockedUrls
    : blockedUrls.slice(0, MAX_DISPLAYED_URLS);

  const tags = displayedUrls.map((url) => {
    const urlTag = document.createElement("div");
    urlTag.className = "url-tag";

    const urlText = document.createElement("span");
    urlText.textContent = url;

    const removeButton = document.createElement("button");
    removeButton.textContent = "×";
    removeButton.title = "Remove";
    removeButton.addEventListener("click", () => removeBlockedUrl(url));

    urlTag.append(urlText, removeButton);
    return urlTag;
  });

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
    tags.push(showMoreButton);
  }

  blockedUrlsList.replaceChildren(...tags);
}

async function loadBlockedLogs() {
  const { blockedUrlLogs = [] } =
    await chrome.storage.local.get("blockedUrlLogs");
  renderBlockedLogs(blockedUrlLogs);
}

function renderBlockedLogs(logs) {
  if (logs.length === 0) {
    noLogsMessage.style.display = "block";
    logsContainer.replaceChildren(noLogsMessage);
    return;
  }

  noLogsMessage.style.display = "none";

  // Most recent first
  const entries = logs.toReversed().map((log) => {
    const logEntry = document.createElement("div");
    logEntry.className = "log-entry";

    const logTime = document.createElement("span");
    logTime.className = "log-time";
    logTime.textContent = new Date(log.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const logUrl = document.createElement("span");
    logUrl.className = "log-url";
    logUrl.textContent = log.url;

    logEntry.append(logTime, logUrl);
    return logEntry;
  });

  logsContainer.replaceChildren(...entries);
}

// Only "URL Blocking" exists so far
const sidebarItems = document.querySelectorAll(".sidebar-item");
for (const item of sidebarItems) {
  item.addEventListener("click", () => {
    sidebarItems.forEach((other) => other.classList.toggle("active", other === item));
    const section = item.textContent.trim();
    statusMessage.textContent =
      section === "URL Blocking" ? "" : `${section} isn't built yet.`;
  });
}
