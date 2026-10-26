// On/off switches and paused sites, shared by the background, popup and
// settings page. Stored in chrome.storage.sync like the block list.

const STORAGE_KEY = "settings";
const PAUSED_SITES_KEY = "pausedSites";
export const DEFAULTS = {
  videoAdRules: true, // rules/video-ads.json
  autoplayGuard: true, // autoplay-guard.js
  annoyanceRules: false, // newsletter offers
  notificationRules: false,
  adChurnRules: false, // rules/ad-churn.json
  aggressiveHeavyAds: false,
  heavyAds: true, // heavy-ad-guard.js and the download count in background.js
};

export async function getSettings() {
  const { [STORAGE_KEY]: settings } =
    await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeSettings(settings);
}

export async function updateSettings(changes) {
  await chrome.storage.sync.set({
    [STORAGE_KEY]: { ...(await getSettings()), ...changes },
  });
}

export function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[STORAGE_KEY]) {
      callback(normalizeSettings(changes[STORAGE_KEY].newValue));
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

// Older installs had one switch for both lists. Preserve that choice until
// the user explicitly changes the new notification switch.
export function normalizeSettings(settings = {}) {
  return {
    ...DEFAULTS,
    ...settings,
    notificationRules:
      settings.notificationRules ?? settings.annoyanceRules ?? false,
  };
}
export const FEATURES = {
  videoAdRules: "Video ad companies",
  autoplayGuard: "Muted autoplay videos",
  heavyAds: "Heavy ads",
  annoyanceRules: "Newsletter offers",
  notificationRules: "Notification requests",
  adChurnRules: "Ad refresh and sync frames",
  aggressiveHeavyAds: "All heavy third-party embeds",
};
export async function getSiteSettings() {
  return (await chrome.storage.sync.get("siteSettings")).siteSettings ?? {};
}
export function validSite(site) {
  return (
    typeof site === "string" &&
    /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(
      site,
    ) &&
    site.length <= 253
  );
}
export async function setSiteSetting(site, key, value) {
  if (
    !validSite(site) ||
    !(key in FEATURES) ||
    ![true, false, null].includes(value)
  )
    throw new Error("Invalid site setting.");
  const sites = await getSiteSettings();
  const entry = { ...sites[site] };
  if (value === null) delete entry[key];
  else entry[key] = value;
  if (Object.keys(entry).length) sites[site] = entry;
  else delete sites[site];
  await chrome.storage.sync.set({ siteSettings: sites });
}
