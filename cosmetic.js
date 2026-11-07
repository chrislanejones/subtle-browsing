// CSS handles new matching elements. Native modal dialogs also need closing
// to release the browser's implicit inert state on the rest of the document.
(() => {
  const style = document.createElement("style");
  const pinned = document.createElement("style");
  const ageGates = document.createElement("style");
  // Limit age-related selectors to these adult sites and their subdomains.
  // Never match by substring (e.g. chaturbate.com.example.org).
  const adultSites = [
    ["chaturbate.com", "#age_gate_home, #age_gate_overlay"],
    ["pornhub.com", "#js-ageDisclaimerMain, #ageDisclaimer"],
    ["pornhub.org", "#js-ageDisclaimerMain, #ageDisclaimer"],
    ["xvideos.com", "#disclaimer, .modal-adult"],
    ["xnxx.com", "#disclaimer, .modal-adult"],
    ["xhamster.com", '[data-role="age-verification"], [data-role="age-verification-modal"]'],
    ["stripchat.com", '[data-testid="age-verification-modal"]'],
    ["youporn.com", "#ageDisclaimer, #age-verification-wrapper"],
    ["redtube.com", "#ageDisclaimer, #age-verification-wrapper"],
  ];
  const adultSite = adultSites.find(
    ([domain]) => location.hostname === domain || location.hostname.endsWith(`.${domain}`),
  );
  let ageGateCss = "";
  let ageGateSelector = "";
  if (adultSite) {
    const gate = `:is(${adultSite[1]},
      #age-gate, #age_gate, #ageGate, #age-verification, #age_verification,
      #age-verification-container, #age-verification-modal,
      .age-gate, .age-gate-modal, .age-verification-modal,
      [data-testid="age-gate"], [data-testid="age-verification"],
      [data-modal="age-verification"]
    )`;
    ageGateSelector = gate;
    // Hide the containing dialog too, so a full-screen wrapper cannot keep
    // intercepting clicks. Only recognized wrappers that contain a gate match.
    const wrappers = `:is(dialog, [role="dialog"], [aria-modal="true"],
      .modal, .modal-wrapper, .modal-overlay, .overlay, #overlay,
      .lightbox, .lightbox-overlay)`;
    const wrapper = `${wrappers}:has(${gate})`;
    const backdrop = ":is(.modal-backdrop, .overlay-backdrop, .lightbox-backdrop)";
    ageGateCss = `
      ${gate}, ${wrapper},
      ${gate} ~ ${backdrop}, ${backdrop}:has(~ ${gate}),
      ${wrapper} ~ ${backdrop}, ${backdrop}:has(~ ${wrappers} ${gate}) {
        display: none !important;
      }
      ${gate}::backdrop, ${wrapper}::backdrop { display: none !important; }
      html:has(${gate}), body:has(${gate}) {
        overflow: auto !important;
      }
    `;
  }
  const closedAgeDialogs = new Map();
  function closeAgeDialogs() {
    for (const dialog of closedAgeDialogs.keys())
      if (!dialog.isConnected) closedAgeDialogs.delete(dialog);
    for (const dialog of document.querySelectorAll("dialog[open]")) {
      if (!dialog.matches(ageGateSelector) && !dialog.querySelector(ageGateSelector)) continue;
      closedAgeDialogs.set(dialog, dialog.matches(":modal"));
      dialog.close();
    }
  }
  // Only supported hosts need an observer, and only for added/opened native
  // dialogs. Ordinary CSS gates do not require scanning or polling.
  const ageDialogObserver = adultSite ? new MutationObserver(closeAgeDialogs) : null;
  function renderAgeDialogs(enabled) {
    if (!ageDialogObserver) return;
    ageDialogObserver.disconnect();
    if (enabled) {
      closeAgeDialogs();
      ageDialogObserver.observe(document, {
        childList: true, subtree: true, attributes: true, attributeFilter: ["open"],
      });
    } else {
      for (const [dialog, modal] of closedAgeDialogs) {
        if (dialog.isConnected && !dialog.open) {
          if (modal) dialog.showModal();
          else dialog.show();
        }
      }
      closedAgeDialogs.clear();
    }
  }
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
    // CSS also covers gates inserted after startup. Removing this sheet on
    // pause/disable restores the original gate, backdrop and scroll styles.
    // This only reveals content already delivered to the browser.
    ageGates.textContent = subtlePolicy.enabled("adultAgeGates") ? ageGateCss : "";
    attach(ageGates);
    renderAgeDialogs(subtlePolicy.enabled("adultAgeGates"));
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
