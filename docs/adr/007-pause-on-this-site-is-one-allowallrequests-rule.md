# ADR-007: Pausing a site is one high-priority allowAllRequests rule
Date: 2026-10-26   Backfilled: 2026-10-26   Status: draft (shipped in 1.3.0, `18f4319`)

## Context
The built-in lists and the user's own rules can break a site, and the
user needs one switch to turn everything off there. The static rulesets
can't be edited per site, and `updateEnabledRulesets` turns a list on or
off everywhere.

## Decision
One dynamic rule, ID `1_000_000`, priority 2, action `allowAllRequests`,
`requestDomains` = the paused sites, for `main_frame` and `sub_frame`.
It outranks every priority-1 block rule, the built-in lists included.
Frame scripts find the top site from the last entry of
`location.ancestorOrigins` and stand down; heavy ad removal skips
paused sites too. The tab reloads once the rule is in, since rules only
affect new requests. Matches on this rule are left out of the log.

## Consequences
+ One rule covers the user list, both built-in lists and ad frames from
  other origins.
- Every pause or unpause reloads the tab.
- When a frame's referrer policy hides `ancestorOrigins`, the top site
  reads as empty and that frame keeps pausing video on a paused site.
- The ID assumes the block list stays under a million entries.

## Alternatives rejected
Not recorded. Turning the built-in lists off can't be scoped to one
site, which rules out the obvious one.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: the
pause looks complete in the popup, but the frame scripts check it
asynchronously and through `ancestorOrigins`, so on some sites a video
still gets paused or an ad frame unloaded. "Pause" stops meaning
"everything off."
Early warning sign to watch for: a paused site where autoplay video
still stops on its own.

## 1.6.0 follow-up
1.6.0 raises full-pause priority to 10, above personal blocks (3) and category exceptions (2). See [ADR-017](017-site-protections-use-tab-session-rules.md).
