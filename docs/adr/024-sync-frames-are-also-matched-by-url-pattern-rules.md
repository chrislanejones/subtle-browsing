# ADR-024: Sync frames are also matched by three URL-pattern rules
Date: 2026-10-27   Status: draft

## Context
Follows ADR-021. Site isolation gives each sync host its own renderer process,
and the Variety article loads about 120 sync documents from about 60 hosts; a
by-name list (27 rules) can't keep up. Playwright plus per-process PSS on that
article, switches off: 3,199 MB and 76 renderers at 20 s, 2,164 MB and 59 at
2 min. With "Ad refresh and sync frames", "Slow ad refresh" and "Stop ad
redirects" on: 1,049 MB and 12 renderers at 20 s, 921 MB and 12 at 2 min.
Visible ads went from 3 to 4, so banners still show.

## Decision
Add rules 28-30 to rules/ad-churn.json under the existing opt-in switch
(`adChurnRules`): `regexFilter`, `domainType: thirdParty`, sub_frame only.
Rule 28: a host label that is a sync word (sync., user-sync., id5-sync.,
ms-cookie-sync.; also b1sync., where a digit comes before "sync"). Rule 29: sync-style path names (usersync, user_sync, usync,
checksync.php, multi-sync.html, s2s_sync, sync-iframe, syncframe,
sync-container, /sync?, /sync/). Rule 30: setuid, getuid, usermatch,
visitormatch, server_match, cm-notify, pbserveriframe, pbs-iframe,
check_uuid, isyn? right after a `/`.
Offline check: with the named rules, 48 of 56 real Variety sync URLs caught and
0 of 30 ordinary embeds (YouTube, Vimeo, reCAPTCHA, Stripe, PayPal, Synchrony
apply, HubSpot /meetings/sync-team, iCloud /sync, /async/ paths, ESPN /match?).
tests/improvements.spec.js checks hits and misses with
declarativeNetRequest.testMatchOutcome, and that every pattern passes
isRegexSupported.

## Consequences
+ Catches sync hosts nobody has listed yet. With all three switches on,
  renderers at 20 s fell from 76 to 12 (not measured per switch).
+ First-party frames (sync.variety.com on variety.com) are never matched.
- Rule 29's anchored form failed Chrome's RE2 limit (isRegexSupported returns
  memoryLimitExceeded, and Chrome skips such a rule silently). The shipped
  form is unanchored `[^/:]/(...)`, so it can match a sync-looking path inside
  an unencoded query string. Rule 30 hit the same limit when pbs-iframe was
  added, so it's unanchored too: `/(setuid|...)`.
- 8 of the 56 Variety sync URLs still get through. Bare /match, /cm, /um and
  /cookie were left out for false-positive risk.
- A pattern can hit a real third-party embed we never tested.

## Alternatives rejected
Keep adding hosts by name: about 60 hosts on one page, and they change.
Broader patterns (/match, /cm, /um, /cookie): too many ordinary URLs.

## Pre-mortem
A widget vendor ships its embed at a path like /sync/ or a host like
sync.vendor.com (a calendar, chat or payments iframe), and it silently goes
blank only for users with this switch on. Watch for per-site Off overrides on
"Ad refresh and sync frames" and bug reports of an empty embed box.
