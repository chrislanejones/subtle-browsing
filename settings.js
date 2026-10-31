import { readSync, onSyncChanged } from "./sync-storage.js";
import { mutate } from "./storage-client.js";
// On/off switches and paused sites, shared by the background, popup and
// settings page. Stored in chrome.storage.sync like the block list.

const STORAGE_KEY = "settings";
const PAUSED_SITES_KEY = "pausedSites";
const PAUSED_EVERYWHERE_KEY = "pausedEverywhere";
export const DEFAULTS = {
  videoAdRules: true, // rules/video-ads.json
  autoplayGuard: true, // autoplay-guard.js
  annoyanceRules: false, // newsletter offers
  notificationRules: false,
  adChurnRules: false, // rules/ad-churn.json
  refreshThrottle: false, // refresh-throttle.js
  adRedirectGuard: false, // ad-redirect-guard.js
  pinnedAds: true, // cosmetic.js
  aggressiveHeavyAds: false,
  heavyAds: true, // heavy-ad-guard.js and the download count in background.js
};

export async function getSettings() {
  const { [STORAGE_KEY]: settings } =
    await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeSettings(settings);
}

export async function updateSettings(changes) {
  return mutate("settings", { changes });
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
    await readSync(PAUSED_SITES_KEY);
  return pausedSites;
}

export async function getAllPausedSites() {
  const [sites, local] = await Promise.all([
    getPausedSites(),
    chrome.storage.local.get("temporaryPauses"),
  ]);
  return [
    ...new Set([
      ...sites,
      ...Object.entries(local.temporaryPauses ?? {})
        .filter(([, until]) => until > Date.now())
        .map(([site]) => site),
    ]),
  ];
}

export async function setSitePaused(site, paused) {
  return mutate("pauseSite", { site, paused });
}
export const matchesSite = (site, parent) =>
  site === parent || site.endsWith(`.${parent}`);
export async function getPauseState(site) {
  const [sync, local] = await Promise.all([
    readSync(["pausedEverywhere", "pausedSites"]),
    chrome.storage.local.get("temporaryPauses"),
  ]);
  const parents = (sync.pausedSites ?? [])
    .filter((s) => site && matchesSite(site, s))
    .sort((a, b) => b.length - a.length);
  const temporary = Object.entries(local.temporaryPauses ?? {})
    .filter(([s, until]) => site && matchesSite(site, s) && until > Date.now())
    .sort((a, b) => b[1] - a[1]);
  return {
    mode: sync.pausedEverywhere
      ? "everywhere"
      : parents.length || temporary.length
        ? "site"
        : "on",
    inheritedFrom:
      parents.find((s) => s !== site) ??
      temporary.find(([s]) => s !== site)?.[0],
    until: temporary[0]?.[1],
    permanent: parents.length > 0,
  };
}

export function onPausedSitesChanged(callback) {
  onSyncChanged([PAUSED_SITES_KEY], (data) => callback(data[PAUSED_SITES_KEY] ?? []));
}

// The popup's "Off everywhere": one flag that pauses every site at once
export async function getPausedEverywhere() {
  const { [PAUSED_EVERYWHERE_KEY]: paused = false } =
    await chrome.storage.sync.get(PAUSED_EVERYWHERE_KEY);
  return paused === true;
}

export async function setPausedEverywhere(paused) {
  await chrome.storage.sync.set({ [PAUSED_EVERYWHERE_KEY]: paused === true });
}

export function onPausedEverywhereChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[PAUSED_EVERYWHERE_KEY]) {
      callback(changes[PAUSED_EVERYWHERE_KEY].newValue === true);
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
  autoplayGuard: "Autoplay videos",
  heavyAds: "Heavy ads",
  annoyanceRules: "Newsletter offers",
  notificationRules: "Notification requests",
  adChurnRules: "Ad refresh and sync frames",
  refreshThrottle: "Slow ad refresh",
  adRedirectGuard: "Stop ad redirects",
  pinnedAds: "Pinned ads",
  aggressiveHeavyAds: "All heavy third-party embeds",
};
export async function getSiteSettings() {
  return (await readSync("siteSettings")).siteSettings ?? {};
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
  return mutate("siteSetting", { site, key, value });
}
