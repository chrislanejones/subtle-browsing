# ADR-011: Google IMA is redirected to our own stand-in script
Date: 2026-10-26   Status: draft (shipped in 1.5.0, `6b498fa`)   Supersedes: ADR-006

## Context
IMA is Google's video-ad SDK inside JW Player and many other players.
Blocking it can leave the site's own player waiting forever (ADR-006),
so 1.2.1 let it load and left its ads to the autoplay stopper. The safe
fix, a stand-in script that answers "no ads", exists in uBlock Origin
as `google-ima.js`, but that is GPL-3.0 and this repo is MIT.

## Decision
Two rules in `rules/video-ads.json` (IDs 19 and 20, part of the "Video
ad companies" switch) redirect
`imasdk.googleapis.com/js/sdkloader/ima3.js` and `ima3_debug.js` to
`/stubs/ima3.js`. The stand-in was written from Google's public IMA API
docs. Every ad request answers with IMA's standard "no ad" error (code
1009, VAST 303), so players go straight to the video. Unknown setters
and enum lookups go through Proxies, so they don't throw. The stub is a
`web_accessible_resource` with `use_dynamic_url: true`, so a page can't
probe a fixed extension URL to spot the extension.

## Consequences
+ IMA pre-rolls don't load at all, and players don't hang.
+ MIT-clean: nothing copied from a GPL shim.
- A player that needs an IMA call the stand-in doesn't implement can
  still throw, and the stand-in breaks that site's video.
- `ima3_dai.js` (live-stream ad insertion) isn't covered.
- Our own copy of an API Google can change at any time.

## Alternatives rejected
Block IMA: hangs players (ADR-006). Leave it unblocked (1.2.1 to 1.4.0):
pre-rolls download and start before the stopper pauses them. Copy uBlock
Origin's `google-ima.js`: GPL-3.0 would relicense the repo.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason:
Google ships an IMA change a big player depends on, such as a new
method called before the ad request. The stand-in returns nothing,
the player throws, and every site on that player shows a broken video
box while the "Video ad companies" switch is on.
Early warning sign to watch for: a site whose video plays only with the
"Video ad companies" switch off, with an error from `ima3.js` in the
console.
