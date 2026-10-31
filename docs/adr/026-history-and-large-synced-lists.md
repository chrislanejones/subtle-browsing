# ADR-026: Local history in IndexedDB and chunked sync lists

Date: 2026-10-31. Status: draft (implemented in 1.9.0; 90-day retention chosen by Chris).

Daily blocking history moves from `stats-*` and the older `blockStats` keys to
an IndexedDB `days` store, keyed by local calendar date. Keep 90 days, including
today, as requested by Chris. IndexedDB works in the extension service worker;
`unlimitedStorage` protects local history from quota pressure and eviction.
Read only the requested date range. Keep the toolbar counter and recent log in
local extension storage so existing surfaces continue to update normally.

Migration copies valid days in a transaction before removing legacy keys. An
existing database day wins on retry, so a worker restart after commit cannot
overwrite newer counts or double them. Pruning uses local calendar dates.

Blocked URLs, paused sites, hidden elements and site overrides retain their
legacy representation when small. Larger values use immutable, hashed chunks
and a manifest stored under the original key. Readers verify every referenced
chunk before accepting a new value. A local copy of the last complete value
keeps existing protections working while sync delivers pieces out of order.
Edits wait for complete data rather than overwriting a partially received list.

Chrome's total sync quota still applies. Chunking lifts the per-item bottleneck,
not the overall limit. Retired payloads become tombstones in the same atomic
write as the replacement chunks, so edits do not require two full copies.
Cleanup removes only those tombstones, never arbitrary unreferenced chunks
that could be arriving from cloud sync ahead of their descriptor. Writes fail
visibly without dropping the saved list.
Backups contain logical lists, independent of the on-disk representation.
Cross-computer concurrent edits still follow Chrome sync's last-writer behavior.

Sources: [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage),
[extension IndexedDB and unlimitedStorage](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies).
