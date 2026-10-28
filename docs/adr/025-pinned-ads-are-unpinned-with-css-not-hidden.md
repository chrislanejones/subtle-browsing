# ADR-025: Pinned ads are un-pinned with CSS, not hidden or blocked
Date: 2026-10-28   Status: draft

## Context
On foxnews.com (checked live 2026-10-28), Jetpack Digital's masthead
(`#jpmasthead`, from ads.jetpackdigital.com, with `.ias_trackable` and
`.moat_trackable` children) loads `position: absolute` in a 432px placeholder.
On scroll its script adds class `jpfixed` and inline `position: fixed;
z-index: 2000000000`, which covers the top 192px of the window over the
article. A Google out-of-page container
(`google_ads_iframe_/4145/fnc/desk/hp/oop_0__container__`) was also inline
`position: fixed`, 1716x192, with a visible iframe. Chris's rule: the ad can
stay at the top of the page, but it can't block the viewport. Ordinary banners
are left alone.

## Decision
Add setting `pinnedAds`, labeled "Pinned ads", on by default, with global and
per-site Default/On/Off (it's in FEATURES). cosmetic.js, already on every page
at document_start, adds a second `<style>` in the top frame only
(`window === top`):
`#jpmasthead, div[id^="google_ads_iframe_"][id$="__container__"][style*="position: fixed"], :is(div, aside, section)[style*="position: fixed"]:has(> .ias_trackable, > .moat_trackable) { position: absolute !important; }`.
The id selector with `!important` beats Jetpack's `.jpfixedoverride
{ position: fixed !important }` and the inline style. The ad stays where it
started and scrolls away. The sheet re-renders on `settings`, `siteSettings`
and pause changes, so overrides apply live. 3 Playwright tests
(tests/pinned-ads.spec.js, tests/site/pinned.html): on by default, off, and
per-site off then cleared. The fixture's own fixed site header must stay
fixed. Full suite 129/129.

## Consequences
+ No MutationObserver, scroll listener or polling. The browser applies the
  rule to ads added later.
+ The ad still shows, so the site still gets its impression.
- An un-pinned bottom anchor ad ends up at the bottom of the first screen, not
  the bottom of the window.
- `[style*="position: fixed"]` only matches that spelling, with the space
  (how browsers write out a style set from JS). Ads pinned by a stylesheet
  class are only caught by the explicit `#jpmasthead` rule.
- `position: sticky` ads aren't covered.

## Alternatives rejected
Block ads.jetpackdigital.com: Chris wants the ad visible, and blocking a whole
vendor takes its banners too.
A generic "fixed element covering X% of the window" detector: catches sites'
own sticky headers and cookie bars, and needs a script watching scroll. The
IAS/Moat direct-child rule is the generic part, since only ad units carry
those trackers.

## Pre-mortem
`absolute` positions the ad against its nearest positioned ancestor, not the
window. On a site where that ancestor sits mid-article, the ad's old `top: 0`
or `bottom: 0` drops it over the text, where it's worse than a pinned bar
because the user can't see why. Watch for per-site Off overrides on "Pinned
ads" and reports of an ad box sitting on top of article text.
