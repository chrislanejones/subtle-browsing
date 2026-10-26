import {
  addBlockedUrl,
  getBlockedUrls,
  onBlockedUrlsChanged,
  removeBlockedUrl,
} from "./blocklist.js";
import { getSettings, updateSettings } from "./settings.js";

const urlInput = document.getElementById("urlInput");
const addButton = document.getElementById("addButton");
const urlList = document.getElementById("urlList");
const selectorButton = document.getElementById("selectorButton");
const statusMessage = document.getElementById("statusMessage");

// URL display configuration
const MAX_DISPLAYED_URLS = 5;
let showAllUrls = false;

renderBlockedUrls(await getBlockedUrls());
onBlockedUrlsChanged(renderBlockedUrls);

// Video ad switches, saved as soon as they change
const toggles = {
  videoAdRules: document.getElementById("videoAdRulesToggle"),
  autoplayGuard: document.getElementById("autoplayGuardToggle"),
};
const settings = await getSettings();
for (const [key, checkbox] of Object.entries(toggles)) {
  checkbox.checked = settings[key];
  checkbox.addEventListener("change", () =>
    updateSettings({ [key]: checkbox.checked })
  );
}

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

function renderBlockedUrls(blockedUrls) {
  if (blockedUrls.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No URLs blocked yet.";
    urlList.replaceChildren(empty);
    return;
  }

  const displayedUrls = showAllUrls
    ? blockedUrls
    : blockedUrls.slice(0, MAX_DISPLAYED_URLS);

  const items = displayedUrls.map((url) => {
    const urlItem = document.createElement("div");
    urlItem.className = "url-item";

    const urlText = document.createElement("span");
    urlText.textContent = url;

    const removeButton = document.createElement("button");
    removeButton.className = "remove-btn";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => removeBlockedUrl(url));

    urlItem.append(urlText, removeButton);
    return urlItem;
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
    items.push(showMoreButton);
  }

  urlList.replaceChildren(...items);
}
