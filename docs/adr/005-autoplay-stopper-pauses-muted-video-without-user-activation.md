# ADR-005: The autoplay stopper pauses muted video that starts without a click
Date: 2026-10-26   Backfilled: 2026-10-26   Status: draft (shipped in 1.2.0, `f48aedb`; restart limit 1.2.1, `812ccbf`; floating players 1.3.0, `18f4319`)

## Context
Video ads start muted, because Chrome won't autoplay sound, and a vendor
list can't name every player. In the `812ccbf` stress test a player
that calls `play()` again on every pause beat plain pausing: the ad
played about 98% of the time.

## Decision
`autoplay-guard.js` is registered with `scripting.registerContentScripts`
in every frame (`allFrames`, `matchOriginAsFallback` for `about:blank`
ad frames, `document_start`). A capture-phase `play` listener pauses a
video that is muted or at volume 0 when `navigator.userActivation.isActive`
is false. More than 3 restarts in 2 seconds unloads the video (removes
its sources and calls `load()`), which fires no pause event. The first
pause also hides a `position: fixed` ancestor smaller than half the
window. The switch unregisters the script from every page.

## Consequences
+ Catches players no list knows about; videos you start play normally.
+ Off means off: no script left in any page.
- A site's own muted autoplay video (a background loop) gets paused too.
- An unloaded video stays unloaded, even if you click it later.
- In-article ad boxes that aren't `fixed` stay on the page, empty.

## Alternatives rejected
Pause on every `play` (1.2.0): lost the tug-of-war about 98% of the
time. A static manifest content script: the switch couldn't remove it
from pages (comment in `background.js`).

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: a
popular site's real video player starts muted and restarts itself after
a pause, trips the 3-in-2-seconds rule, and can't be played at all.
People blame the site.
Early warning sign to watch for: a report of a video that won't play
until the autoplay switch is turned off.
