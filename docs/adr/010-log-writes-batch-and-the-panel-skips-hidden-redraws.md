# ADR-010: Log writes are batched, the panel skips hidden redraws, and the picker is throttled
Date: 2026-10-25   Backfilled: 2026-10-26   Status: draft (shipped across 1.1.0 `89118c3`, 1.2.1 `812ccbf`, 1.4.0 `c111ba8`)

## Context
An ad-heavy page can trigger dozens of blocks a second. 1.0.0 wrote
storage once per blocked request, and the DevTools panel polled every
5 s. The picker looked up the element under the pointer on every mouse
move and scanned the whole clicked subtree for URLs.

## Decision
- Log entries collect in memory and flush in one storage write per
  second (last 100 kept), through the same queue as rule updates.
- The panel redraws only on `storage.onChanged`, builds the rows
  off-page and swaps them in once, skips when nothing changed, and
  skips while out of sight: `document.hidden`, or the panel hidden
  behind another DevTools tab (`devtools.js` forwards `onShown` /
  `onHidden`). It keeps the newest list and draws it on return.
- The picker looks up the hovered element at most once per animation
  frame and scans at most 2,000 elements.

## Consequences
+ Measured: 300 fast mouse moves and picking a 20,000-element container
  caused no long tasks, worst timer lag 7 ms (`812ccbf`). A 100-row
  panel redraw takes about 33 ms including two frames; a hidden panel
  draws 0 rows (`c111ba8`).
- The log runs up to a second behind, and entries still in memory are
  lost if Chrome stops the worker before the flush.
- Past 2,000 elements, a big container's URLs go unlisted.

## Alternatives rejected
One write per blocked request and 5 s polling (1.0.0): the costs this
replaces.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: the
2,000-element cap hides the one ad URL that matters inside a big
wrapper, and users conclude the picker "can't find" ads.
Early warning sign to watch for: picker dialogs on large ad containers
listing only the site's own domains.
