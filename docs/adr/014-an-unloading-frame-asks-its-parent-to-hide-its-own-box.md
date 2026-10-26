# ADR-014: An unloading frame asks its parent to hide its own box
Date: 2026-10-26   Status: draft (shipped in 1.5.0, `6b498fa`)

## Context
A heavy ad (ADR-009) or a video ad that restarted itself 3 times in
2 s (ADR-005) gets unloaded, but its iframe stays on the page as a blank
box. A cross-origin frame can't touch its parent's DOM, and the
background knows a `frameId` but can't map it to an `<iframe>` element.

## Decision
Just before unloading, the frame posts
`"url-blocker:collapse-frame"` to its parent. `frame-collapse.js`,
registered in every frame while the autoplay stopper or heavy ad
removal is on, listens for it and hides only the iframe whose
`contentWindow` is `event.source`, so a frame can only hide itself.
Paused in-page videos keep their box so they can still be clicked.

## Consequences
+ Unloaded ads leave no blank rectangle.
+ No page can use the message to hide anything but the frame that sent
  it.
- One more script and message listener in every frame while either
  switch is on.
- Ad boxes blocked outright by the rules never load a script, so they
  can't ask to be hidden.
- Any frame can hide itself this way, including a site's own frame
  that happens to send the same string.

## Alternatives rejected
Hiding the box from the background: it can't find the iframe element
from a `frameId`. Hiding it from inside the frame: cross-origin frames
can't reach the parent's DOM.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: a
layout depends on the ad iframe's box, and `display: none` shifts or
collapses the page around it, which looks worse than the blank box did.
Early warning sign to watch for: content jumping or overlapping right
after a "Heavy ad" entry appears in the DevTools log.

## 1.6.0 follow-up
1.6.0 changes the heavy-ad path to parent-owned removal and Restore. Autoplay collapse still uses the original message. See [ADR-016](016-heavy-content-needs-ad-evidence-and-can-be-restored.md).
