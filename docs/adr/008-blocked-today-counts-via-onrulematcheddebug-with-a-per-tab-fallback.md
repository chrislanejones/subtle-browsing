# ADR-008: Blocked-today counts with onRuleMatchedDebug, and falls back to Chrome's per-tab count
Date: 2026-10-26   Backfilled: 2026-10-26   Status: draft (shipped in 1.3.0, `18f4319`)

## Context
The toolbar icon should show how many requests were blocked today.
`onRuleMatchedDebug` is the only event that reports each match, and it
only fires for unpacked installs with the
`declarativeNetRequestFeedback` permission.

## Decision
When `onRuleMatchedDebug` exists, each match joins the log batch
(ADR-010). The once-a-second flush also writes `blockedToday`
(`{ date, count }`, local date) and sets the badge (`1k` style past
999). Paused-site matches don't count; heavy ad removals do. Without the
event, `setExtensionActionOptions({ displayActionCountAsBadgeText: true })`
lets Chrome show each tab's own blocked count.

## Consequences
+ No storage writes beyond the log batch that already happens.
- A Web Store install shows a different number (per tab, not per day)
  and an empty DevTools log.
- The count resets on the first block after midnight, so yesterday's
  number can sit on the icon until then.
- It counts requests, not ads: one ad can be many requests.

## Alternatives rejected
A `chrome.alarms` timer to reset at midnight: one more permission
(PARKING_LOT).

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: the
extension ships on the Web Store, where the event never fires, so the
headline number in the popup shows nothing and the DevTools log is
always empty. The feature only ever worked on the developer's machine.
Early warning sign to watch for: a Web Store listing, or any install
where `chrome.declarativeNetRequest.onRuleMatchedDebug` is undefined.
