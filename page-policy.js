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
    pinnedAds: true,
    aggressiveHeavyAds: false,
    cosmetic: true,
  };
  let state = { pausedEverywhere: true };
  let temporaryPauses = {};
  const listeners = new Set();
  const domListeners = [];
  let root = document.documentElement;
  // document.open() removes DOM listeners without creating a new extension
  // world. Watch only root replacement, never the page's subtree or a timer.
  new MutationObserver(() => {
    if (root === document.documentElement) return;
    root = document.documentElement;
    for (const [target, type, callback, options] of domListeners)
      target.addEventListener(type, callback, options);
    for (const callback of listeners) callback();
  }).observe(document, { childList: true });
  const policy = (globalThis.subtlePolicy = {
    listen(target, type, callback, options) {
      domListeners.push([target, type, callback, options]);
      target.addEventListener(type, callback, options);
    },
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    get hiddenElements() { return state.hiddenElements ?? []; },
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
  let refreshes = Promise.resolve();
  function refresh() {
    refreshes = refreshes.then(async () => {
      const [response, local] = await Promise.all([
        chrome.runtime.sendMessage({ action: "getPagePolicy" }),
        chrome.storage.local.get("temporaryPauses"),
      ]);
      if (response?.state) state = response.state;
      temporaryPauses = local.temporaryPauses ?? {};
      for (const callback of listeners) callback();
    }).catch(() => {}); // Reloaded extensions invalidate old content scripts.
    return refreshes;
  }
  policy.ready = refresh();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" || (area === "local" && changes.temporaryPauses)) refresh();
  });
})();
