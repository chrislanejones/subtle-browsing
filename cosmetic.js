// CSS handles new matching elements without a mutation observer or polling.
(() => {
  const style = document.createElement("style");
  const pinned = document.createElement("style");
  // Pinned ads: an ad that turns position: fixed as you scroll stays where it
  // started, at the top of the page, and scrolls away like a banner. Jetpack's
  // masthead, Google ad containers, and anything fixed that carries IAS or Moat
  // verification trackers (only ad units carry those).
  const PINNED_CSS = `#jpmasthead,
div[id^="google_ads_iframe_"][id$="__container__"][style*="position: fixed"],
:is(div, aside, section)[style*="position: fixed"]:has(> .ias_trackable, > .moat_trackable) {
  position: absolute !important;
}`;
  const attach = (sheet) => {
    if (!sheet.textContent) sheet.remove();
    else if (!sheet.isConnected && document.documentElement)
      document.documentElement.append(sheet);
  };
  async function render() {
    await subtlePolicy.ready;
    // Pinning only matters in the top page; inside an ad frame it does nothing
    pinned.textContent =
      window === top && subtlePolicy.enabled("pinnedAds") ? PINNED_CSS : "";
    attach(pinned);
    const off = !subtlePolicy.enabled("cosmetic");
    style.textContent = off
      ? ""
      : subtlePolicy.hiddenElements
          .filter((r) => r.site === location.hostname.replace(/^www\./, ""))
          .filter((r) => {
            try {
              document.querySelector(r.selector);
              return !/[{}]/.test(r.selector);
            } catch {
              return false;
            }
          })
          .map((r) => `${r.selector}{display:none!important}`)
          .join("\n");
    attach(style);
  }
  subtlePolicy.ready.then(render);
  subtlePolicy.subscribe(render);
  document.addEventListener("DOMContentLoaded", render, { once: true });
})();
