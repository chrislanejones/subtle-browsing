# ADR-017: Site protections use tab-scoped session rules
Date: 2026-10-26   Status: draft

## Context
A full site pause is too broad when only autoplay or one ad vendor causes a
problem. Exceptions must work inside cross-origin child frames without
turning off personal URL rules.

## Decision
Store per-feature boolean overrides by normalized hostname in sync. The most
specific matching hostname wins, with global settings as the fallback.
For network categories, copy only the changed category's rules into per-tab
session rules: enabled copies have priority 1, allow copies priority 2.
Personal blocks use priority 3 and full site pause priority 10. Refresh
sessions on tab navigation and settings changes; apply UI changes before
reloading. Content scripts consult one live policy cache per frame.

## Consequences
+ The popup and DevTools can allow autoplay while preserving URL blocking.
+ Tab scope covers third-party requests, unlike an initiator-only exception.
- Navigation refresh is asynchronous; earliest requests can race it.
- Rule use grows with overridden categories and open tabs, within Chrome quotas.
- Already removed content needs Restore or reload; reset does not recreate it.

## Alternatives rejected
Global allowAllRequests for a feature exception: disables unrelated protections.
Initiator-domain-only rules: fail inside unrelated third-party frames.

## Pre-mortem
A user opens enough overridden tabs to hit a session rule quota, or a rapid
navigation uses an exception from the preceding site. Watch for rule-update
errors and cross-site navigation regressions. Keep full pause distinct.
