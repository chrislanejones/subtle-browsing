# ADR-023: Stop ad redirects cancels cross-site navigations nobody clicked for
Date: 2026-10-27   Status: draft

## Context
On a Variety article, an RTB ad in a same-origin Google ad iframe (no src) set
top.location without a click. The tab went to webleap.lifestyle/visit.php, then
a 302 to fake McAfee scareware on securesweep.pro, on 2 of 2 loads in a plain
Chrome. Chrome's framebusting intervention only blocks cross-origin frames
without user activation, so same-origin "friendly" ad frames get through.

## Decision
Add setting `adRedirectGuard`, labeled "Stop ad redirects", off by default, with
global and per-site Default/On/Off. ad-redirect-guard.js is a MAIN-world content
script, top frame only, document_start. It cancels the Navigation API `navigate`
event when all of these hold: cancelable, not userInitiated, not reload or
traverse, no formData (SAML/SSO auto-post forms), no active user activation,
http(s), and a different site (hostname minus `www.`, subdomains count as the
same site). It logs "Subtle stopped a redirect to <origin>" to the console.
refresh-policy.js is renamed page-world-policy.js and now sends
`{refreshThrottle, adRedirectGuard}` in one `subtle-page-policy` event to both
page-world scripts; applySettings unregisters the old "refresh-policy" ID on
upgrade. 5 Playwright tests on a fixture with a no-src ad frame
(tests/ad-redirect-guard.spec.js, tests/site/redirect.html).

Live check: _pending (inspector result goes here)._

## 1.8.1 revision (10-31-2026)

The activation-window exception was too broad: scripts borrowed clicks on
article text and Play buttons to redirect the tab or open a popunder. The
updated top-page guard records trusted navigation controls. Links are bound
to their captured destination; non-media buttons receive a one-second exception
for scripted login/checkout. Reading keys and media controls do not grant a
navigation exception. Native links, forms, reloads and traversals remain usable.

The guard wraps `window.open` and synthetic anchor/area `click()` calls, including
detached links and blank-window popunders. A capture listener also covers
connected synthetic link events. Settings are checked on each call, so turning
the switch off restores native behavior on existing pages. There is no polling.

The [Navigation API explainer](https://github.com/WICG/navigation-api/blob/main/README.md#the-navigate-event)
distinguishes native link/form activation from scripted navigation; button
handlers setting location are not `userInitiated`. This is why a narrow button
exception remains instead of relying only on that flag.

Regression fixtures cover article and player click hijacks, reading keys,
substituted link destinations, window.open/blank/synthetic-link popunders,
intentional links/sign-in popups/forms, keyboard controls, live disabling,
and the existing same-origin-frame redirect case. Rotating real ads still
require separate live evidence; fixture results do not establish universal
coverage.

## Consequences
+ Stops the scareware path at the first hop, whatever domain it rotates to.
+ Links, forms, the address bar, reloads, back/forward and same-site redirects
  pass.
- A page script can spoof the policy event and turn the guard off for itself.
  That takes a targeted attack, not a generic ad.
- The top-page wrappers do not cover a frame's own window.open, automatic
  form submissions or same-site bounce chains. Scripts can still borrow the
  explicit non-media button exception, replace these page-world wrappers or
  bypass synthetic-link handling through lower-level APIs. This is a nuisance
  filter, not a security boundary.
- Navigations started from a cross-origin frame may not fire `navigate` in the
  top page at all; we rely on Chrome's intervention there.

## Alternatives rejected
DNR main_frame blocks of scam domains: they rotate.
Rely on Chrome's intervention: it doesn't cover same-origin frames.
Allow only `event.userInitiated`: breaks sites whose own JS navigates on click.

## Pre-mortem
A site's own sign-in or checkout hands off to a partner domain with a scripted,
non-form navigation after a timer (no click, no formData), and the user is
stuck on a spinner. Watch for per-site Off overrides on this switch and for
"Subtle stopped a redirect" lines naming login or payment hosts.
