# ADR-012: Settings, the block list and paused sites live in chrome.storage.sync
Date: 2026-10-26   Status: draft (shipped in 1.5.0, `6b498fa`; merge fix `2f4352b`)

## Context
Up to 1.4.0 everything was in `chrome.storage.local`, so a second
computer started from an empty list. `chrome.storage.sync` follows the
user's Chrome sign-in, but it caps each item at 8 KB and allows 120
writes a minute. The request log flushes once a second (ADR-010), which
would use half that write budget alone.

## Decision
`blockedUrls`, `settings` and `pausedSites` move to
`chrome.storage.sync`; the request log and the blocked-today count stay
in `chrome.storage.local`. On install or update, `background.js` moves
each local key to sync: copied if sync has no value yet; if sync already
has one (from another computer), the lists (`blockedUrls`,
`pausedSites`) are merged without duplicates and the synced switches
win. Then the local copy is removed. If the sync write fails, local
keeps the data for the next try. Past the 8 KB cap (about 300 entries)
the user sees an error message instead of a silent failure.

## Consequences
+ The list, paused sites and switches follow the user to every Chrome
  they're signed into. Chrome does the syncing; the extension still
  talks to no server of its own.
+ High-rate writes stay off sync's quota.
- The block list tops out at about 300 entries.
- Every reader of these keys had to switch areas, including the frame
  scripts that read `pausedSites` directly (the ADR-003 cost).
- The switches don't merge: on a second computer, whatever sync already
  holds wins over that computer's own settings.
- The shipped 1.5.0 (`6b498fa`) copied only keys sync didn't have, so a
  second computer's own list and paused sites were deleted. Found in
  review and fixed in `2f4352b` by merging the lists.

## Alternatives rejected
Splitting the list across several sync keys (chunking): lifts the cap,
but adds more moving parts than a ~300-entry list was worth. Keeping
everything local: no sync.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason:
the people who use the picker most hit 300 entries, their newest blocks
fail with an error, and the only way out is deleting entries or writing
the chunking that was skipped.
Early warning sign to watch for: the sync-full message showing up, or a
block list over 200 entries in any backup file.

## 1.6.0 follow-up
1.6.0 also syncs siteSettings and hiddenElements, each under its own per-item quota. Both are included in backups. See [ADR-017](017-site-protections-use-tab-session-rules.md) and [ADR-018](018-picker-hiding-is-host-scoped-css.md).

## Unreleased follow-up, 2026-10-28
All extension UI read-modify-write operations now run through the worker queue
via `storage-client.js` and `storage-mutations.js`, including imports. This
prevents simultaneous local windows from overwriting one another. Chrome Sync's
cross-device conflict behavior and quotas remain unchanged. Temporary pauses
use a local deadline and alarm instead of sync, and are excluded from backups.

## 1.9.0 revision (10-31-2026)

[ADR-026](026-history-and-large-synced-lists.md) replaces the single-item list
representation when values grow. Small lists retain their existing format;
all growing lists can span verified chunks within Chrome's total sync quota.
