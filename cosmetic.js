// CSS handles new matching elements without a mutation observer or polling.
(() => {
  const style = document.createElement("style");
  const pinned = document.createElement("style");
  // Pinned ads: an ad that turns position: fixed as you scroll stays where it
  // started, at the top of the page, and scrolls away like a banner. Jetpack's
  // masthead, Google ad containers, and anything fixed that carries IAS or Moat
  // verification trackers (only ad units carry those).
  // Hearst's bottom rail is an ad only when it contains a marked sticky slot.
  // A generic .sticky-bottom can also be a site's own navigation or controls.
  const newsBottomAd = '.sticky-bottom:has(> .ad-sticky-container [data-ad-container="true"][data-type="sticky"])';
  const PINNED_CSS = `#jpmasthead,
div[id^="google_ads_iframe_"][id$="__container__"][style*="position: fixed"],
:is(div, aside, section)[style*="position: fixed"]:has(> .ias_trackable, > .moat_trackable) {
  position: absolute !important;
}
/* Graham/MileTech: retain the ad's space and creative, release its sticky box. */
[id^="MileTech_"].fixedAd,
/* Release an ad-only sidebar too; mixed editorial sidebars keep their layout. */
aside:has(> div:only-child > .adWrapper:only-child > [id^="MileTech_"].fixedAd),
/* TEGNA: keep the existing height placeholder, anchor the ad and close control to it. */
.universal-ad[data-module="universal-ad"],
/* Hearst: the bottom ad becomes an ordinary in-flow banner. */
${newsBottomAd},
${newsBottomAd} [data-type="sticky"],
${newsBottomAd} .st-adunit-ad {
  position: relative !important;
  inset: auto !important;
  transform: none !important;
}
.universal-ad[data-module="universal-ad"] > :is(.universal-ad__ad, .universal-ad__close-button) {
  position: absolute !important;
}
${newsBottomAd} .background-inscreen-display {
  display: none !important;
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
