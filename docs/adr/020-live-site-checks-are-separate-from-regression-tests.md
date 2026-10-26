# ADR-020: Live-site checks are separate from regression tests
Date: 2026-10-26   Status: draft

## Context
Previous live coverage was limited to PCWorld. Public sites vary by region,
consent, ad auctions and account state, so a successful page load does not
prove banners or intentional video still work.

## Decision
Keep deterministic Chromium regression tests local, including resource-heavy
ad and legitimate frames, ordinary banners and user-started videos. Add actual
toolbar and DevTools surface tests. Run a separate read-only live script with
fresh baseline and protected profiles for news, shopping, sports and streaming.
Save observations and screenshots, and mark unavailable checks inconclusive.
Document the dated evidence in Testing.md; do not make live sites a CI gate.

## Consequences
+ Covers realistic pages without making normal tests depend on the public web.
+ Distinguishes successful playback from merely loading a player or ad slot.
- Headless Chromium is not every user's browser, codec, region or login state.
- An empty ad auction or cookie gate can prevent meaningful banner checks.
- These observations do not measure hardware fan speed or power savings.

## Alternatives rejected
Treat HTTP 200 as compatibility: misses broken media and blocked content.
Require live ads to render in CI: nondeterministic and dependent on third parties.

## Pre-mortem
A release cites old observations as a guarantee after sites have changed.
Watch for unrefreshed dates and inconclusive checks incorrectly counted as
passes. Refresh the matrix before broad claims about coverage.
