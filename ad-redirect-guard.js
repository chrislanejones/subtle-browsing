// Stops an ad from sending the whole tab to another site without a click.
// Runs in the top page's own world. Google's ad frames are often same-origin
// (no src), so an ad's script can set top.location; Chrome only blocks that
// for cross-origin frames. The Navigation API's navigate event lets the page
// cancel it. A link click or form, the user's own address bar, reloads and
// back/forward all go through. page-world-policy.js says whether the site
// has it on; the page world can't read the extension's settings itself.
(() => {
  if (!window.navigation) return;
  let on = false;
  window.addEventListener("subtle-page-policy", (event) => {
    on = event.detail?.adRedirectGuard === true;
  });

  const siteOf = (hostname) => hostname.replace(/^www\./, "");
  const sameSite = (a, b) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

  navigation.addEventListener("navigate", (event) => {
    if (!on || !event.cancelable || event.userInitiated) return;
    if (event.navigationType === "reload" || event.navigationType === "traverse")
      return;
    // Sign-in pages post forms to each other on their own
    if (event.formData) return;
    // A click elsewhere on the page that a script turns into a navigation
    if (navigator.userActivation?.isActive) return;
    let url;
    try {
      url = new URL(event.destination.url);
    } catch {
      return;
    }
    if (!/^https?:$/.test(url.protocol)) return;
    if (sameSite(siteOf(url.hostname), siteOf(location.hostname))) return;
    event.preventDefault();
    console.info(`Subtle stopped a redirect to ${url.origin}`);
  });
})();
