// Shared block list helpers for the background, popup, settings page and
// DevTools panel. The list lives in chrome.storage.sync, so it follows the
// user to every Chrome they're signed into.

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
    await chrome.storage.sync.get(STORAGE_KEY);
  return blockedUrls;
}

// Sync storage caps one item at 8 KB, roughly 300 domains
export const SYNC_FULL_MESSAGE =
  "Your block list is full (Chrome sync allows about 300 entries). Remove a few and try again.";

// Returns false when the URL was empty or already blocked. Throws
// SYNC_FULL_MESSAGE when the list no longer fits in sync storage.
export async function addBlockedUrl(url) {
  const normalizedUrl = normalizeUrl(url);
  const blockedUrls = await getBlockedUrls();
  if (!normalizedUrl || blockedUrls.includes(normalizedUrl)) return false;

  // background.js turns this storage change into blocking rules
  try {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: [...blockedUrls, normalizedUrl],
    });
  } catch {
    throw new Error(SYNC_FULL_MESSAGE);
  }
  return true;
}

export async function removeBlockedUrl(url) {
  const blockedUrls = await getBlockedUrls();
  await chrome.storage.sync.set({
    [STORAGE_KEY]: blockedUrls.filter((item) => item !== url),
  });
}

// Calls back with the new list whenever it changes, from any page
export function onBlockedUrlsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[STORAGE_KEY]) {
      callback(changes[STORAGE_KEY].newValue || []);
    }
  });
}
