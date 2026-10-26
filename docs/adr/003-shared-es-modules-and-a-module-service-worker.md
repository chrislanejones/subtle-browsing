# ADR-003: Storage logic lives in shared ES modules, loaded by a module service worker
Date: 2026-10-25   Backfilled: 2026-10-26   Status: draft (shipped in 1.1.0, `89118c3`; `settings.js` in 1.2.0, `f48aedb`)

## Context
In 1.0.0 the block-list helpers were copied into both `popup.js` and
`panel.js`, written with callbacks (`89118c3` body: "Shared blocklist.js
module replaces copies in popup.js and panel.js"). 1.2.0 added on/off
switches that the background, popup and panel all needed to read.

## Decision
`blocklist.js` (1.1.0) and `settings.js` (1.2.0) are ES modules that own
their storage keys, defaults and `get` / `set` / `onChanged` helpers.
`background.js` imports them as a module service worker
(`"type": "module"` in the manifest); `popup.html` and `panel.html` load
their scripts with `type="module"`. No build step.

## Consequences
+ One copy of `normalizeUrl`, the storage keys and the setting defaults.
+ Chrome loads the files as written: no bundler, nothing to compile.
- Content scripts can't use static `import`, so the frame scripts
  (`autoplay-guard.js`, `heavy-ad-guard.js`) read the `pausedSites` key
  directly and repeat the site-matching code. The "same site" check
  exists in `heavy-ad-guard.js` and again in `background.js`.
- A storage key rename has to be found by hand in those copies.

## Alternatives rejected
Keeping per-page copies (1.0.0): two copies of the same storage logic to
keep in step. A bundler was not recorded as considered.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: a
storage change (a new key, or moving data to a different storage area)
lands in the modules but not in the frame scripts, and pausing a site
stops reaching the autoplay stopper or heavy ad removal without any
error.
Early warning sign to watch for: a storage key string that appears in a
frame script but not in `settings.js` or `blocklist.js`.
