# Testing and compatibility

Release: **1.6.0**, checked **10-26-2026**. This is the detailed verification
companion to the [README](../README.md) and [Changelog](../CHANGELOG.md).
The testing policy is [ADR-020](adr/020-live-site-checks-are-separate-from-regression-tests.md).

## Repeatable regression checks

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
```

Release verification: **85 tests passed in 58.5 seconds** (`pnpm test`).
This includes actual toolbar and DevTools controls, CPU limits and performance checks.

The suite uses Playwright 1.64.0 and its bundled Chromium, with fresh profiles
and an unpacked extension. Local fixture sites use different hostnames so
third-party behavior is exercised. CPU-sensitive tests run after the main
project, one at a time.

Checks cover:

- Identified heavy ads stop at the existing download/long-task thresholds;
  ordinary heavy third-party embeds remain loaded by default.
- Broader mode removes unmarked heavy third-party embeds on the chosen site.
- Restore reloads removed content and exempts that frame element for the
  rest of the page lifetime. Clicked and first-party frames remain exempt.
- Ordinary banner images load. Muted and audible videos started by a user
  keep playing. Autoplay restart loops do not keep spinning indefinitely.
- A site autoplay exception leaves personal URL blocking active. Network
  category exceptions cover third-party initiators in the same tab and
  still lose to personal blocks.
- Newsletter and notification categories operate independently; legacy
  settings preserve the former combined behavior.
- URL-less picker hiding persists on its hostname, leaves another hostname
  alone, and can be undone from DevTools. Backup import/export preserves
  the new rules and discards malformed selector text.
- Popup, settings and panel controls, existing upgrades, IMA compatibility,
  logging and performance guards continue to work.
- Browser-surface coverage exercises the actual toolbar popup and DevTools
  panel with the inspected tab, rather than relying only on extension pages
  opened as ordinary tabs.

## Live-site procedure

```sh
pnpm run test:live
# A specific player check, with the same baseline/protected procedure:
LIVE_TARGETS='[["streaming-player","https://player.vimeo.com/video/76979871"]]' pnpm run test:live artifacts/live-player
```

The script does not sign in, buy anything, submit forms or change consent
preferences. It visits each URL in separate fresh baseline and protected
profiles, waits for initial content, scrolls once and records visible images,
recognized ad slots, videos, blocked requests and extension removal logs.
When a top-document video has a visible Play button, it clicks that button
and checks that playback progresses. Screenshots and JSON go in `artifacts/`
(ignored by Git and excluded from packaging).

A public page can return different ads in two sessions. An ad slot is not
proof of a rendered creative. A successful document load is not proof of
working video. Missing media, consent gates and unavailable banners are
inconclusive, not passes.

## Observations on 10-26-2026

Raw observations, including UTC timestamps and exact playback state:
[2026-10-26-live-sites.json](testing/2026-10-26-live-sites.json).

| Category and URL | Baseline and protected observation | What this establishes |
| --- | --- | --- |
| News: [PCWorld](https://www.pcworld.com/) | Both returned 200 with the PCWorld title and 9 visible loaded images. Neither sample exposed recognized banner slots or top-document videos. | Page smoke check passed; banner and video checks inconclusive. |
| Shopping: [Best Buy](https://www.bestbuy.com/) | Both returned 200, 21 visible loaded images and one visible recognized ad iframe. No top-document video. | Page and ad-slot presence preserved in this sample; creative rendering and playback not established. |
| Sports: [ESPN](https://www.espn.com/) | Both returned 200 and 111 visible loaded images. Baseline showed 3 recognized ad frames (2 visible); protected sample showed none, with no extension blocks or removal events logged. | Page smoke check passed. Banner parity is inconclusive because the samples differed; do not count this as a banner pass or attribute it to the extension without reproduction. |
| Streaming browse: [Vimeo Watch](https://vimeo.com/watch) | Both returned 200 with 64 visible loaded images and no top-document video. | Browse-page smoke check passed; this alone says nothing about playback. |
| Streaming playback: [Vimeo player](https://player.vimeo.com/video/76979871) | Both returned 200. Clicking the player's Play button produced `paused: false`, `readyState: 4` and more than 1 second of advancing playback. | User-started playback passed in both profiles for this public video. |

The protected runs used the default protections, not every possible switch
combination. No extension block or heavy-removal event occurred in these
specific live samples. Heavy-resource enforcement is therefore established
by deterministic fixtures, not by these live observations. No hardware fan,
power or temperature measurements were taken.

## Remaining coverage limits

- Logged-out headless Chromium does not cover all accounts, regions, codecs,
  consent states, streaming DRM, subscriptions or mobile browsers.
- Ordinary banners and intentional playback pass in local fixtures; live
  banner preservation still needs pages with repeatably rendered creatives.
- Known ad-host and publisher-slot evidence is conservative and incomplete.
- Network sizes come from Content-Length. CPU pressure uses long tasks and
  excludes first-party/top-level work; GPU activity is outside this guard.
- Site session-rule refresh is asynchronous on navigation. Cross-site
  redirects and very large collections of overridden tabs deserve more stress tests.
- CSS hiding can miss closed shadow DOM and needs maintenance after layout
  changes. It does not disable underlying scripts or network activity.

## Release package

Commit the tested changes, then run `pnpm run package`. The script uses
`git archive HEAD`, so the ZIP contains exactly the committed runtime files
and excludes tests, docs, scripts, dependencies and local artifacts. The
packaged 1.6.0 ZIP also passed all **7 fresh-install checks** after extraction
into a separate directory (`EXTENSION_UNDER_TEST` pointed to that copy). The
package is for unpacked installation or later Web Store submission; a push
to GitHub/Codeberg is not a Chrome Web Store publication.
