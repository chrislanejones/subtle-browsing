# ADR-029: What the page scripts stop counts in the same daily history as network blocks
Date: 2026-11-13   Status: draft (unreleased; amends ADR-008)

## Context
ADR-008's pre-mortem came true in shape: Web Store installs have no
`onRuleMatchedDebug`, so the popup and settings page showed "Unavailable"
for every count except heavy-ad removals. But the extension's own scripts
already know when they stop something (an autoplay pause, a redirect, a
popup); they just never reported it.

## Decision
- `autoplay-guard.js` sends `countAction` kind `autoplay` once per video
  element (a `WeakSet`), on its first pause.
- `ad-redirect-guard.js` (MAIN world) dispatches a `subtle-stopped`
  `CustomEvent`; `page-world-policy.js` (isolated) forwards `redirect` or
  `popup` as `countAction`, at most 20 per frame.
- `background.js` maps these to types `autoplay` and `redirects`, caps each
  document at 50 (keyed by `sender.documentId`), and logs them through
  `logBlockedUrl`, the same batch that feeds `blockedToday` and the 90-day
  IndexedDB history (ADR-010, ADR-026).
- Without the debug event, the popup reads "stopped today" and the settings
  page tile reads "Stopped today" with real numbers instead of "Unavailable".

## Consequences
+ Store installs show a real, nonzero daily number and recent list.
+ No new permission; the counts ride the existing log batch.
- The page can forge `subtle-stopped`, so redirect counts are only
  trustworthy up to the caps. The 50-per-document map lives in worker memory
  and is cleared past 1,000 documents or on a worker restart.
- Store installs now carry two numbers: the badge is still Chrome's per-tab
  network count, the popup is the script-stopped count.
- Redirect counts only exist where the guard runs: Stop ad redirects is off by
  default, so by default that means listed torrent sites only (`torrentAds`).

## Alternatives rejected
Keep "Unavailable" on store installs: honest but useless on the install
most people will have.
Count from the MAIN world directly: it has no `chrome.runtime`, and an
unlimited page-forgeable counter would make the number meaningless.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: people
compare "stopped today" on a store install with "blocked today" on an
unpacked one (or with the badge) and decide the extension is broken or lying,
because the two count different things and the label difference is one word.
Early warning sign to watch for: a site report or review quoting a count
that doesn't match the badge.
