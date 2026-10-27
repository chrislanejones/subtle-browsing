# ADR-022: Slow ad refresh wraps googletag in the page's world
Date: 2026-10-26   Status: draft

## Context
Follows ADR-021. On the firstcoastnews.com article, ad scripts (Prebid, Browsi)
call googletag.pubads().refresh() about every 30 s; each round loads new
creatives and the tab's heap grew about 18 MB/min. ADR-021's list only helps on
Browsi sites, and most news sites refresh through Google's ad tag (GPT).

## Decision
Add setting `refreshThrottle`, labeled "Slow ad refresh", off by default, with
global and per-site Default/On/Off. refresh-throttle.js is a MAIN-world content
script, top frame only, document_start. It pushes onto `googletag.cmd`
(creating `{cmd: []}` if absent) and replaces pubads().refresh with a wrapper:
a slot's first refresh always passes; after that, at most once per 2 minutes
and not while document.hidden; a slot listed twice in one call goes once; a
call with no due slot is dropped. Off for the site, every call passes through.
The MAIN world can't read chrome.storage, so refresh-policy.js (ISOLATED world,
with page-policy.js) dispatches a `subtle-refresh-policy` CustomEvent with
true/false on load and on every sync storage change. setFrameScript gained an
`options` param (world, allFrames) and skips page-policy.js for MAIN-world
scripts. 3 Playwright tests on a GPT stand-in (tests/site/refresh.html).
Later: the bridge is now page-world-policy.js (ADR-023). A slot whose box
element is replaced (infinite scroll reusing one slot object) gets its first
load again. Live check on Variety, 150 s of the page's own refreshing: throttle
off 10 ad requests (5 per slot), on 2. The marker property is hidden because
SHE Media's blogherads wraps refresh() on top of ours, but the throttle is in
the chain.

## Consequences
+ Works on any GPT site, not just Browsi. Banners still show; they rotate less.
+ Wrappers other scripts install later wrap ours, so load order is fine.
- Not measured on the live site (same Akamai 403); manual A/B in Chrome pending.
- Publishers lose refresh impressions (revenue). That is the trade the user
  opts into.
- A page can see and spoof the event, though only to turn the throttle off on
  itself.
- A page that sets `googletag = {cmd: []}` unconditionally before GPT loads
  drops our queued wrapper, and the throttle silently does nothing there.
- Prebid refresh paths that bypass pubads().refresh are not covered.
- A slot that comes due while the tab is hidden waits for the next refresh
  call after the tab is visible.

## Alternatives rejected
Block Prebid/GPT: kills banners, against PRODUCT.md.
DOM-attribute handoff instead of the event: frameworks can rewrite `<html>` attributes.
Poll for googletag: PRODUCT.md says avoid continuous polling.
A fixed refresh ban: some sites load first ads via refresh with disableInitialLoad.

## Pre-mortem
A site lazy-loads infinite-scroll articles by refreshing one reused slot
object, so later articles show empty slots for up to 2 minutes. Watch for
per-site Off overrides on this switch, and consider resetting a slot's timer
when it is re-displayed.
