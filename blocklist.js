// Shared block list helpers for the background, popup and DevTools panel.

const STORAGE_KEY = "blockedUrls";

// Strip protocol, "www." and a trailing slash so the same site is only stored once
export function normalizeUrl(url) {
  return url
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?/, "")
    .replace(/\/$/, "");
}

export async function getBlockedUrls() {
  const { [STORAGE_KEY]: blockedUrls = [] } =
    await chrome.storage.local.get(STORAGE_KEY);
  return blockedUrls;
}

// Returns false when the URL was empty or already blocked
export async function addBlockedUrl(url) {
  const normalizedUrl = normalizeUrl(url);
  const blockedUrls = await getBlockedUrls();
  if (!normalizedUrl || blockedUrls.includes(normalizedUrl)) return false;

  // background.js turns this storage change into blocking rules
  await chrome.storage.local.set({
    [STORAGE_KEY]: [...blockedUrls, normalizedUrl],
  });
  return true;
}

export async function removeBlockedUrl(url) {
  const blockedUrls = await getBlockedUrls();
  await chrome.storage.local.set({
    [STORAGE_KEY]: blockedUrls.filter((item) => item !== url),
  });
}

// Calls back with the new list whenever it changes, from any page
export function onBlockedUrlsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      callback(changes[STORAGE_KEY].newValue || []);
    }
  });
}
