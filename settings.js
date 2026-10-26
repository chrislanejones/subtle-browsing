// On/off switches and paused sites, shared by the background, popup and
// settings page. Stored in chrome.storage.sync like the block list.

const STORAGE_KEY = "settings";
const PAUSED_SITES_KEY = "pausedSites";
const DEFAULTS = {
  videoAdRules: true, // rules/video-ads.json
  autoplayGuard: true, // autoplay-guard.js
  annoyanceRules: false, // rules/annoyances.json
  heavyAds: true, // heavy-ad-guard.js and the download count in background.js
};

export async function getSettings() {
  const { [STORAGE_KEY]: settings } = await chrome.storage.sync.get(STORAGE_KEY);
  return { ...DEFAULTS, ...settings };
}

export async function updateSettings(changes) {
  await chrome.storage.sync.set({
    [STORAGE_KEY]: { ...(await getSettings()), ...changes },
  });
}

export function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[STORAGE_KEY]) {
      callback({ ...DEFAULTS, ...changes[STORAGE_KEY].newValue });
    }
  });
}

// A site is stored without "www." and covers its subdomains
export function siteKey(hostname) {
  return hostname.replace(/^www\./, "");
}

export async function getPausedSites() {
  const { [PAUSED_SITES_KEY]: pausedSites = [] } =
    await chrome.storage.sync.get(PAUSED_SITES_KEY);
  return pausedSites;
}

export async function setSitePaused(site, paused) {
  const pausedSites = (await getPausedSites()).filter((item) => item !== site);
  if (paused) pausedSites.push(site);
  await chrome.storage.sync.set({ [PAUSED_SITES_KEY]: pausedSites });
}

export function onPausedSitesChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[PAUSED_SITES_KEY]) {
      callback(changes[PAUSED_SITES_KEY].newValue || []);
    }
  });
}
