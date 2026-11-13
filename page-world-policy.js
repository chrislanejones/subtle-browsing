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
  // ad-redirect-guard.js reports each redirect or popup it stops. The page
  // can dispatch this event too, so a frame forwards only a few.
  let reported = 0;
  subtlePolicy.listen(window, "subtle-stopped", (event) => {
    if (!["redirect", "popup"].includes(event.detail) || ++reported > 20) return;
    chrome.runtime
      .sendMessage({ action: "countAction", kind: event.detail })
      .catch(() => {});
  });
  send();
  subtlePolicy.subscribe(send);
})();
