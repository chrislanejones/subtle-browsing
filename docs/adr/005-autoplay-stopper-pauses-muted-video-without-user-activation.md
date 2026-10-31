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

## 1.8.1 revision (10-31-2026)

Browser activation alone is insufficient: PageDown and unrelated clicks allow
advertising players to start, including with sound. The guard now records only
trusted pointer/click/play-key events. Playback needs a nearby player gesture
or a labeled Play/Watch/Resume/Start control; `aria-controls` binds an external
control to its player when present. Accessible names via `aria-labelledby` are
captured at the gesture, before a player replaces its icon or label. Reading keys and synthetic clicks do not
count. Article/layout ancestors are not treated as player controls. The switch
is labeled **Autoplay videos** and applies to audible autoplay too.

A small fixed player with an in-flow parent is returned to that parent using
`position: static !important`, preserving the prior inline position and priority.
Intentional playback restores the original positioning. A standalone floating
ad with no in-flow home remains hidden with a restore control. Unloaded videos
also have restore controls; restored videos are exempt for the page lifetime.
Existing content scripts consult live settings, and disabling the switch stops
enforcement without requiring a reload; it prevents future injection as before.

Limits: closed shadow roots are not traversed. A control inside a child frame
cannot authorize a top-page video. Unlabeled external custom play controls or
very delayed playback may need a site exception. Labeled external play controls
without `aria-controls` retain a short compatibility exception. These are
heuristics for unwanted playback, not a security boundary.

## Consequences
+ Catches players no list knows about; videos you start play normally.
+ Off disables enforcement in existing pages and stops future injection.
- A site's own muted autoplay video (a background loop) gets paused too.
+ Unloaded videos can be restored through the extension’s recovery control.
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
