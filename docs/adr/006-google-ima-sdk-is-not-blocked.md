# ADR-006: The Google IMA SDK is not blocked
Date: 2026-10-26   Backfilled: 2026-10-26   Status: superseded by ADR-011 (1.5.0, `6b498fa`); shipped in 1.2.1, `812ccbf`

## Context
1.2.0 blocked `imasdk.googleapis.com` (rule 2 in `rules/video-ads.json`),
Google's video-ad SDK inside JW Player and other players. Blocking it
can leave the site's own video player waiting on ads forever.

## Decision
Rule 2 is removed from `rules/video-ads.json` in 1.2.1 and its ID is
left unused. The autoplay stopper (ADR-005) pauses IMA ads instead of
the network layer blocking them.

## Consequences
+ Sites whose players wait on IMA load their own videos again.
- IMA ads still download and start before the stopper pauses them.
- A gap at rule ID 2 in the list.

## Alternatives rejected
Keep blocking it: can break the site's own player. A stub script like
uBlock Origin's, which answers "no ads" so the player moves on: noted in
PARKING_LOT as the safe way to block it, not built in 1.2.1.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: IMA
is the SDK most video ads go through, so leaving it open let the
biggest share of video ads load, and the autoplay stopper became the
only thing between the user and them.
Early warning sign to watch for: video ads that play with sound after a
click, coming from `imasdk.googleapis.com`.
