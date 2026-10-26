# ADR-015: End-to-end tests run on `@playwright/test` 1.64.0, the repo's first dev dependency
Date: 2026-10-26   Status: draft (shipped in 1.5.1, `a4a7ea8`)

## Context
Every release through 1.5.0 was checked with throwaway headless-Chromium
scripts that never landed in the repo, so nothing could be rerun. The
extension had no `package.json`. Two quirks make extension tests tricky:
Playwright's `evaluate()` counts as a user gesture, which switches off
the autoplay stopper and heavy ad unloading, and same-origin frames
share "the user clicked" (sticky activation).

## Decision
`@playwright/test` pinned to **1.64.0** via pnpm, the only dev
dependency. 74 tests in 13 spec files under `tests/`, config in
`playwright.config.js`, run with `pnpm test`.
- 1.64.0 uses the already-installed `chromium-1248`, so there's no
  150 MB download (rust-wasm-photo-tool's playwright-core 1.63.0 points
  at 1243).
- Extensions need a persistent context with `--load-extension` and the
  new headless mode (`channel: "chromium"`).
- State checks go through CDP `Runtime.evaluate` with
  `userGesture: false` (`quietEval`), so the test itself never counts
  as a click.
- The clicked-frame case runs on its own page, away from the shared
  activation.

## Consequences
+ Repeatable and in the repo. Mutation check: 22 of 23 deliberately
  broken copies were caught. Found 2 real bugs (picker port label,
  import count).
- `node_modules/` sits inside the unpacked extension folder. Chrome
  ignores it, but it must stay out of a Web Store zip.
- About a minute per run, and it needs the cached Chromium build.
- The miss: removing the picker's per-frame mousemove throttle produced
  no long task, so that regression wouldn't be caught. Also not covered:
  `devtools.js`, the right-click menu click, a real Alt+Shift+K press.

## Alternatives rejected
Ad hoc scratch scripts (what existed before): not repeatable, not in
the repo. `node:test` + `playwright-core`: less fixture support.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: the
pin to 1.64.0 held the suite to one Chromium build while real Chrome
moved on, so the tests stayed green on an old browser while a new
Chrome change (an API or a headless difference) broke the extension
for users.
Early warning sign to watch for: Chrome stable more than a few major
versions past the pinned Chromium, or a bug report the suite didn't
catch.
