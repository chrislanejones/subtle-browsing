# ADR-009: Heavy third-party ad frames are unloaded at 4 MB or 5 s of CPU per 30 s
Date: 2026-10-26   Backfilled: 2026-10-26   Status: draft (shipped in 1.4.0, `3190ef2`)

## Context
Some ads download megabytes or keep the CPU busy (the fan spins). Per
the `3190ef2` commit and code comments, Chrome's own heavy ad rule
allows 4 MB of download and 15 s of CPU per 30 s, which is "well past
fan territory."

## Decision
- Download: an observational `webRequest.onHeadersReceived` listener
  adds up `Content-Length` per top-level third-party frame (nested
  frames count toward the frame directly under the page). At 4 MB,
  `executeScript` sends that frame to `about:blank`.
- CPU: `heavy-ad-guard.js`, registered in every frame, watches long
  tasks and unloads its frame after 5 s of busy time in any 30 s
  (a third of Chrome's 15 s).
- Never unloaded: frames the user has clicked
  (`navigator.userActivation.hasBeenActive`), same-site frames, frames
  on paused sites. Removals go to the log and today's count.

## Consequences
+ Stops fan-spinning ads without needing to know who serves them.
- Chrome shares "the user clicked" across same-origin frames, so one
  click spares that ad company's other frames on the page.
- Chunked responses without `Content-Length` aren't counted.
- An unloaded frame leaves a blank box.
- The `webRequest` listener wakes the service worker on every response,
  even with the switch off, and adds the `webRequest` permission.

## Alternatives rejected
Relying on Chrome's own heavy ad rule: its CPU limit is three times
looser than this one.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: the
CPU rule unloads ads mid-render on slow laptops, where ordinary frames
hit 5 s of long tasks, and pages fill up with blank boxes. Or busy
pages pay for a worker that never sleeps.
Early warning sign to watch for: "Heavy ad (... of CPU)" log entries for
frames from ordinary ad networks on a slow machine, or the service
worker never going idle in `chrome://serviceworker-internals`.

## 1.6.0 follow-up
1.6.0 keeps these thresholds but adds ad identification, an optional broader mode and restoration. See [ADR-016](016-heavy-content-needs-ad-evidence-and-can-be-restored.md).
