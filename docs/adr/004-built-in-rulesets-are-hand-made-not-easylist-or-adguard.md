# ADR-004: The built-in lists are small, hand-made rulesets, not EasyList or AdGuard
Date: 2026-10-26   Backfilled: 2026-10-26   Status: draft (video list shipped in 1.2.0, `f48aedb`; annoyances in 1.3.0, `18f4319`)

## Context
The goal (README, "Why not a regular ad blocker") is to block video and
annoying ads and leave normal ads alone. EasyList blocks all ads.
AdGuard's `@adguard/dnr-rulesets` is GPL-3.0-only and this repo is MIT,
so bundling it would relicense the project; most of its annoyance
filters are also element-hiding (CSS) rules that `declarativeNetRequest`
can't apply.

## Decision
Two static rulesets in the manifest, written by hand:
- `video_ads` (`rules/video-ads.json`, on by default, 17 rules): whole
  video-ad companies, plus only the video paths of big mixed networks
  (Taboola `/vpaid/`, Amazon `web-video`).
- `annoyances` (`rules/annoyances.json`, off by default, 24 rules):
  pop-up, newsletter and push-prompt tools.

Left out on purpose: cookie-banner tools (blocking one can leave the
page scroll-locked), FreeWheel `fwmrm.net` (TV-network sites play real
shows through it), Minute Media and JW Player (also serve banners or
the site's own videos). Popup switches call `updateEnabledRulesets`.

## Consequences
+ MIT-clean, short enough to read in one sitting, compiled once by
  Chrome at install.
+ Banners and recommendations still load (live PCWorld check in
  `f48aedb`).
- Coverage is only what we've seen: the video list was checked against
  PCWorld alone.
- No automatic updates; a vendor that changes domains gets through
  until the list is edited.

## Alternatives rejected
EasyList: blocks every ad, the opposite of the goal.
`@adguard/dnr-rulesets`: GPL-3.0-only, and its annoyance filters are
mostly CSS that these rules can't apply.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: the
lists went stale. Video vendors moved to new domains or first-party
paths, nobody noticed, and the switch reads "on" while blocking less
every month.
Early warning sign to watch for: the blocked-today count on a known
video-heavy site (PCWorld) drifting toward zero.

## 1.6.0 follow-up
1.6.0 splits the handmade annoyance rules into newsletter and notification lists. See [ADR-019](019-newsletter-and-notification-lists-are-independent.md).
