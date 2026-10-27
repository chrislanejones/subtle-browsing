// Slows ad refresh. Runs in the page's own world, where Google's ad tag
// (googletag) lives, so it can wrap pubads().refresh(). Ad scripts like
// Browsi and Prebid call refresh() every 30 seconds or so, and each round
// loads new creatives into the page's memory. Here each slot refreshes at most
// once every 2 minutes, and not while the tab is hidden. A slot's first load
// always goes through, so pages that load ads with refresh() still show them.
// page-world-policy.js tells this script whether the site has it switched on;
// the page world can't read the extension's settings itself.
(() => {
  const MIN_GAP_MS = 2 * 60 * 1000;
  const lastRefresh = new WeakMap(); // slot -> { at, element }
  let on = false;
  window.addEventListener("subtle-page-policy", (event) => {
    on = event.detail?.refreshThrottle === true;
  });

  // The box a slot fills. Infinite-scroll pages reuse one slot object for
  // each new article's box, and a new box should get its first load.
  const elementOf = (slot) =>
    document.getElementById(slot.getSlotElementId?.()) ?? null;

  function due(slot, now) {
    const last = lastRefresh.get(slot);
    if (!last || last.element !== elementOf(slot)) return true;
    return !document.hidden && now - last.at >= MIN_GAP_MS;
  }

  function wrap(pubads) {
    const refresh = pubads.refresh;
    if (typeof refresh !== "function" || refresh.subtleThrottled) return;
    const throttled = function (slots, options) {
      if (!on) return refresh.call(this, slots, options);
      const now = Date.now();
      const allowed = [];
      for (const slot of slots ?? pubads.getSlots())
        if (due(slot, now)) {
          // Also drops a slot listed twice
          lastRefresh.set(slot, { at: now, element: elementOf(slot) });
          allowed.push(slot);
        }
      if (allowed.length) return refresh.call(this, allowed, options);
    };
    throttled.subtleThrottled = true;
    pubads.refresh = throttled;
  }

  // The page's own `googletag = googletag || { cmd: [] }` keeps this queue,
  // and Google's tag runs it once pubads() exists
  window.googletag = window.googletag || { cmd: [] };
  window.googletag.cmd.push(() => wrap(window.googletag.pubads()));
})();
