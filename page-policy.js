// One policy cache per isolated frame, shared by the small content scripts.
(() => {
  if (globalThis.subtlePolicy) return;
  let site = location.hostname.replace(/^www\./, "");
  try {
    const origins = location.ancestorOrigins;
    if (origins?.length)
      site = new URL(origins[origins.length - 1]).hostname.replace(
        /^www\./,
        "",
      );
  } catch {}
  const defaults = {
    videoAdRules: true,
    autoplayGuard: true,
    heavyAds: true,
    annoyanceRules: false,
    notificationRules: false,
    adChurnRules: false,
    refreshThrottle: false,
    adRedirectGuard: false,
    aggressiveHeavyAds: false,
    cosmetic: true,
  };
  let state = {};
  let temporaryPauses = {};
  const policy = (globalThis.subtlePolicy = {
    site,
    enabled(key) {
      if (
        state.pausedEverywhere === true ||
        Object.entries(temporaryPauses).some(
          ([s, until]) =>
            until > Date.now() && (site === s || site.endsWith(`.${s}`)),
        ) ||
        (state.pausedSites ?? []).some(
          (s) => site === s || site.endsWith(`.${s}`),
        )
      )
        return false;
      const custom = Object.assign(
        {},
        ...Object.entries(state.siteSettings ?? {})
          .filter(([host]) => site === host || site.endsWith(`.${host}`))
          .sort(([a], [b]) => a.length - b.length)
          .map(([, value]) => value),
      );
      return custom[key] ?? state.settings?.[key] ?? defaults[key];
    },
  });
  policy.ready = Promise.all([
    chrome.storage.sync.get([
      "settings",
      "siteSettings",
      "pausedSites",
      "pausedEverywhere",
    ]),
    chrome.storage.local.get("temporaryPauses"),
  ]).then(([value, local]) => {
    state = value;
    temporaryPauses = local.temporaryPauses ?? {};
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.temporaryPauses)
      temporaryPauses = changes.temporaryPauses.newValue ?? {};
    if (area !== "sync") return;
    for (const key of [
      "settings",
      "siteSettings",
      "pausedSites",
      "pausedEverywhere",
    ])
      if (changes[key]) state[key] = changes[key].newValue;
  });
})();
