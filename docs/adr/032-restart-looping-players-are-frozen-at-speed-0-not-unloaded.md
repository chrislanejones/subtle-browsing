# ADR-032: Restart-looping players are frozen at speed 0, not unloaded
Date: 2026-11-17   Status: draft (unreleased; amends ADR-005)

## Context
ADR-005 unloads a video that restarts itself more than 3 times in 2 s
(src and sources removed, `load()`), and "Play this video" puts the src
back. On LinkedIn's logged-in feed (Promoted video posts) that restore
left video.js showing "The media could not be loaded" (MediaError 4).
LinkedIn serves plain mp4 from `dms.licdn.com` (checked on a public
post), and a revoked `blob:` MediaSource can't be reattached either
(error 4 in a test). `95428cc` only spared `blob:` videos, so mp4 still broke.

## Decision
In `autoplay-guard.js`, past the restart limit a video in the top page,
or a streamed (`blob:`/`srcObject`) video in any frame, gets
`playbackRate = 0` instead of unloading. In Chromium, rate 0 stops
`currentTime` and decoding and fires no `pause`, so the page has nothing
to answer with `play()`; restoring the old rate resumes. A player that
resets the rate is re-frozen up to 10 times (`FREEZE_RETRIES`), then
just paused. "Play this video" restores, and so does the player's own
Play: a trusted click or key that passes `startedByUser` restores after
the page's handlers (`setTimeout`). Plain-file players in child frames
still unload, so `frame-collapse.js` hides the ad box (ADR-014 unchanged).

## Consequences
+ Site players keep their source, so restoring can't hit "media could
  not be loaded"; Playwright suite 215 passed, busy-loop test still
  settles at <=5 play events with no long tasks.
- A frozen video keeps its buffered media (memory, network) where an
  unloaded one released it, and the page's UI may still say "playing".
- A page that fights the rate falls back to repeated pausing; ad
  scripts may count a frozen ad as playing (impressions).
- Not verified on the logged-in LinkedIn feed itself, only a public
  post with a simulated restart loop (11-17-2026); needs Chris's Chrome.

## Alternatives rejected
Keep unloading and re-set src: that's the bug. Pause forever: restart-
loop players turn it into a busy loop. Unload only non-`blob:`: LinkedIn
is mp4 and still broke.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: a
common player watches `playbackRate` (or `timeupdate` stalls) and keeps
resetting it, so past 10 retries it falls back to the pause tug-of-war
ADR-005 was built to end, now on top-page players that once just unloaded;
or frozen ads quietly count as viewed and buffer data nobody watches.
Early warning sign to watch for: a busy-loop or CPU report on a feed
page, or a tab's memory climbing with frozen videos on it.
