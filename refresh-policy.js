// Tells refresh-throttle.js, in the page's world, whether Slow ad refresh is
// on for this site. Runs in the extension's isolated world next to
// page-policy.js, and repeats the answer whenever the settings change.
(async () => {
  await subtlePolicy.ready;
  const send = () =>
    window.dispatchEvent(
      new CustomEvent("subtle-refresh-policy", {
        detail: subtlePolicy.enabled("refreshThrottle"),
      }),
    );
  send();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") send(); // page-policy.js's listener already ran
  });
})();
