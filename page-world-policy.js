// Tells the page-world scripts (refresh-throttle.js, ad-redirect-guard.js)
// which of their switches are on for this site. Runs in the extension's
// isolated world next to page-policy.js, and repeats the answer whenever the
// settings change.
(async () => {
  await subtlePolicy.ready;
  const send = () =>
    window.dispatchEvent(
      new CustomEvent("subtle-page-policy", {
        detail: {
          refreshThrottle: subtlePolicy.enabled("refreshThrottle"),
          adRedirectGuard: subtlePolicy.enabled("adRedirectGuard") ||
            (subtlePolicy.torrentSite && subtlePolicy.enabled("torrentAds")),
        },
      }),
    );
  subtlePolicy.listen(window, "subtle-page-policy-request", send);
  // The page world can't message the worker. The page could fake this event
  // too, which would only inflate its own count.
  subtlePolicy.listen(window, "subtle-stopped", (event) => {
    if (typeof event.detail !== "string") return;
    const [kind, origin] = event.detail.split(" ");
    if (kind !== "redirect" && kind !== "popup") return;
    chrome.runtime.sendMessage({ action: "stopped", kind, url: origin }).catch(() => {});
  });
  send();
  subtlePolicy.subscribe(send);
})();
