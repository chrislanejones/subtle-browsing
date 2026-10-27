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
          adRedirectGuard: subtlePolicy.enabled("adRedirectGuard"),
        },
      }),
    );
  send();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") send(); // page-policy.js's listener already ran
  });
})();
