# ADR-001: User blocking runs on Manifest V3 declarativeNetRequest dynamic rules
Date: 2025-03-13   Backfilled: 2026-10-26   Status: draft (shipped in 1.0.0)

## Context
The first commit (`1faa041`) declared Manifest V3 but blocked with
`webRequest` + `webRequestBlocking`: an `onBeforeRequest` listener read
storage on every request and canceled matches. Manifest V3 only gives
`webRequestBlocking` to policy-installed extensions. 24 minutes later
`4fff39a` ("Updated Manifest V3") switched to `declarativeNetRequest`.
Rationale reconstructed: the 2025 commits have no message body.

## Decision
Each block-list entry becomes one dynamic rule (`id` = index + 1,
priority 1, action `block`). `background.js` swaps the whole set in one
`updateDynamicRules` call whenever the list changes. Since 1.1.0
(`89118c3`) a bare domain becomes `||domain^` (subdomains yes,
look-alikes no) and rule updates run one at a time through a queue.

## Consequences
+ No extension code on the request path: Chrome's network layer does the
  matching, so blocking costs nothing per page and works while the
  service worker sleeps.
+ The same mechanism later carried the built-in lists (ADR-004) and the
  pause rule (ADR-007).
- Only what `urlFilter` can express: no element hiding (CSS), no
  per-request logic.
- Seeing what got blocked needs `onRuleMatchedDebug`, which only fires
  for unpacked installs (ADR-008).

## Alternatives rejected
`webRequestBlocking` (`1faa041`): not available to normal Manifest V3
installs. Manifest V2 was not recorded as an option.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: the
ads worth blocking stop fitting `urlFilter` (rotating hostnames,
first-party ad paths), and the extension keeps bolting `webRequest` back
on beside it. 1.4.0 already did once, read-only, for heavy ads (ADR-009).
Early warning sign to watch for: a new feature that needs a decision per
request rather than a static pattern.
