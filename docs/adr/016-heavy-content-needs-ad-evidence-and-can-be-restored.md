# ADR-016: Heavy content needs ad evidence and can be restored
Date: 2026-10-26   Status: draft

## Context
The old resource guard treated every unclicked third-party frame as an ad.
That can remove a legitimate video or tool. The user also wants strict controls
for sites that drive sustained fan activity.

## Decision
Keep the 4 MB and 5 seconds of long tasks per 30 seconds thresholds. Children
report candidates; the parent verifies the sending frame and checks known ad
hosts, explicit ad-slot markers, known ad-frame IDs or advertising titles.
The parent saves attributes, blanks the frame and shows Restore. A restored
frame element is exempt until reload. An explicit broader mode removes the
ad-evidence requirement but keeps first-party and interaction exemptions.

## Consequences
+ Stops costly identified ads without treating all third-party content as ads.
+ Recovery is available without disabling unrelated protections.
- Conservative evidence misses unmarked ads; broader mode can remove legitimate embeds.
- Content-Length and long tasks do not measure all network/CPU/GPU work.
- Restoring reloads the frame rather than preserving playback position.

## Alternatives rejected
Removing every third-party frame by default: too many legitimate embeds.
Only hiding frames with CSS: leaves their scripts and downloads running.

## Pre-mortem
Publishers change ad markers, so identifiable heavy ads become unrecognized.
Watch for long-task candidates with no removal on a reported noisy page.
This amends ADR-009 and the heavy-ad part of ADR-014; autoplay collapse remains separate.
