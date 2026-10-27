# Architecture Decision Records

Why the extension is built the way it is, one decision per file. New
ADRs start as **draft** and only Chris flips them to **accepted**. A
superseded ADR keeps its number and says which ADR replaced it; numbers
are never reused or deleted.

ADR-001 through ADR-010 were backfilled on 2026-10-26 from the git
history, commit messages, `PARKING_LOT.md` and the code. Each one is
dated to when the decision shipped. Copy [000-template.md](000-template.md)
for a new one.

| ADR | Title | Status | Date |
| --- | ----- | ------ | ---- |
| [000](000-template.md) | Template (not a decision) | — | — |
| [001](001-user-blocking-runs-on-declarativenetrequest-dynamic-rules.md) | User blocking runs on Manifest V3 declarativeNetRequest dynamic rules | Draft (shipped 1.0.0) | 2025-03-13 (backfilled) |
| [002](002-the-element-picker-is-injected-on-demand.md) | The element picker is injected on demand, not loaded in every tab | Draft (shipped 1.1.0) | 2026-10-25 (backfilled) |
| [003](003-shared-es-modules-and-a-module-service-worker.md) | Storage logic lives in shared ES modules, loaded by a module service worker | Draft (shipped 1.1.0) | 2026-10-25 (backfilled) |
| [004](004-built-in-rulesets-are-hand-made-not-easylist-or-adguard.md) | The built-in lists are small, hand-made rulesets, not EasyList or AdGuard | Draft (shipped 1.2.0) | 2026-10-26 (backfilled) |
| [005](005-autoplay-stopper-pauses-muted-video-without-user-activation.md) | The autoplay stopper pauses muted video that starts without a click | Draft (shipped 1.2.0) | 2026-10-26 (backfilled) |
| [006](006-google-ima-sdk-is-not-blocked.md) | The Google IMA SDK is not blocked | Superseded by ADR-011 (was shipped 1.2.1) | 2026-10-26 (backfilled) |
| [007](007-pause-on-this-site-is-one-allowallrequests-rule.md) | Pausing a site is one high-priority allowAllRequests rule | Draft (shipped 1.3.0) | 2026-10-26 (backfilled) |
| [008](008-blocked-today-counts-via-onrulematcheddebug-with-a-per-tab-fallback.md) | Blocked-today counts with onRuleMatchedDebug, and falls back to Chrome's per-tab count | Draft (shipped 1.3.0) | 2026-10-26 (backfilled) |
| [009](009-heavy-ads-are-unloaded-at-4-mb-or-5-s-of-cpu-per-30-s.md) | Heavy third-party ad frames are unloaded at 4 MB or 5 s of CPU per 30 s | Draft (shipped 1.4.0) | 2026-10-26 (backfilled) |
| [010](010-log-writes-batch-and-the-panel-skips-hidden-redraws.md) | Log writes are batched, the panel skips hidden redraws, and the picker is throttled | Draft (shipped 1.1.0 to 1.4.0) | 2026-10-25 (backfilled) |
| [011](011-google-ima-is-redirected-to-our-own-stand-in.md) | Google IMA is redirected to our own stand-in script | Draft (shipped 1.5.0); supersedes ADR-006 | 2026-10-26 |
| [012](012-settings-block-list-and-paused-sites-live-in-storage-sync.md) | Settings, the block list and paused sites live in chrome.storage.sync | Draft (shipped 1.5.0) | 2026-10-26 |
| [013](013-a-settings-page-holds-the-lists-and-the-popup-shows-counts.md) | A settings page holds the lists, and the popup shows counts | Draft (shipped 1.5.0) | 2026-10-26 |
| [014](014-an-unloading-frame-asks-its-parent-to-hide-its-own-box.md) | An unloading frame asks its parent to hide its own box | Draft (shipped 1.5.0) | 2026-10-26 |
| [015](015-end-to-end-tests-run-on-playwright-1-64-0-as-the-first-dev-dependency.md) | End-to-end tests run on `@playwright/test` 1.64.0, the repo's first dev dependency | Draft (1.5.1) | 2026-10-26 |
| [016](016-heavy-content-needs-ad-evidence-and-can-be-restored.md) | Heavy content needs ad evidence and can be restored | Draft (1.6.0) | 2026-10-26 |
| [017](017-site-protections-use-tab-session-rules.md) | Site protections use tab-scoped session rules | Draft (1.6.0) | 2026-10-26 |
| [018](018-picker-hiding-is-host-scoped-css.md) | Picker hiding is hostname-scoped CSS | Draft (1.6.0) | 2026-10-26 |
| [019](019-newsletter-and-notification-lists-are-independent.md) | Newsletter and notification lists are independent | Draft (1.6.0) | 2026-10-26 |
| [020](020-live-site-checks-are-separate-from-regression-tests.md) | Live-site checks are separate from regression tests | Draft (1.6.0) | 2026-10-26 |
| [021](021-ad-refresh-and-sync-frames-are-an-opt-in-list.md) | Ad refresh and sync frames are an opt-in list | Draft | 2026-10-26 |
| [022](022-slow-ad-refresh-wraps-googletag-in-the-page-world.md) | Slow ad refresh wraps googletag in the page's world | Draft | 2026-10-26 |
| [023](023-stop-ad-redirects-cancels-unclicked-cross-site-navigations.md) | Stop ad redirects cancels cross-site navigations nobody clicked for | Draft | 2026-10-27 |
| [024](024-sync-frames-are-also-matched-by-url-pattern-rules.md) | Sync frames are also matched by three URL-pattern rules | Draft | 2026-10-27 |
