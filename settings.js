// On/off switches for the built-in video ad blocking, shared by the
// background and the popup.

const STORAGE_KEY = "settings";
const DEFAULTS = {
  videoAdRules: true, // rules/video-ads.json
  autoplayGuard: true, // autoplay-guard.js
};

export async function getSettings() {
  const { [STORAGE_KEY]: settings } = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULTS, ...settings };
}

export async function updateSettings(changes) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: { ...(await getSettings()), ...changes },
  });
}

export function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      callback({ ...DEFAULTS, ...changes[STORAGE_KEY].newValue });
    }
  });
}
