# ADR-018: Picker hiding is hostname-scoped CSS
Date: 2026-10-26   Status: draft

## Context
Some intrusive overlays and empty boxes have no useful network URL to block.
A global URL rule is inappropriate when the user wants one element hidden on
one site. Hiding must also be reversible.

## Decision
Offer Hide on this site in the existing picker dialog even without URLs.
Generate a unique ID-based or structural CSS selector; store it with the
sender's hostname in sync. A small stylesheet injector applies rules to that
hostname, including later matching DOM elements, without polling or a mutation
observer. Settings and DevTools remove saved rules and refresh CSS immediately.
Backups merge validated selectors; full site pause temporarily disables them.

## Consequences
+ Handles URL-less elements without blocking shared resources globally.
+ CSS applies to later elements without continuous JavaScript work.
- Hiding does not stop downloads, unlock page scroll or traverse closed shadow roots.
- Structural selectors can become inaccurate after a site redesign.
- One sync item holds the selectors and is subject to the 8 KB item quota.

## Alternatives rejected
Generic removal of all overlays: can destroy legitimate dialogs and consent flows.
Continuous DOM rescanning: needless page cost for selectors CSS already handles.

## Pre-mortem
A layout change moves a structural selector onto article content. Watch for
reports of missing content that disappear after Unhide. Prefer stable IDs and
keep every rule removable from both management surfaces.
