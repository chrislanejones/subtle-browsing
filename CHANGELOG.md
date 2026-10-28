# Changelog

Every version of URL Blocker, newest first. Dates are MM-DD-YYYY. The
version number is the one in `manifest.json`. Versions before 1.6.0 were not
tagged or published as GitHub releases; they map to the commits listed.
Version 1.6.0 is identified by the source tag `v1.6.0` on both remotes.

Why things work the way they do: [docs/adr/](docs/adr/README.md).

## Unreleased

### Added
- **Video ad companies** now blocks Celtra (`celtra.com`). A Mercedes video ad
  played in CNN's header ad slot: Google's ad tag loaded the creative from
  Celtra's servers, which weren't on the list. Google's banner hosts are left
  alone, so banners still show.
- **Ad refresh and sync frames**, a new switch that's off by default. It uses
  [`rules/ad-churn.json`](rules/ad-churn.json): Browsi's ad-refresh scripts are
  blocked outright, and 26 hidden cookie-sync frames are blocked by their sync URL,
  only when they load as a frame. Found on a local news article that grew to
  1.2–1.3 GB while left open: a new ad auction about every 30 seconds and 28
  invisible frames, none heavy enough on its own to trip the heavy-ad limits.
  A Variety article that reached 3.2 GB added 10 more by name (Rubicon,
  AppNexus, Seedtag, Outbrain, Amazon and others) and 3 patterns that catch
  sync frames from anyone else. On that article it went from 3.2 GB in 76
  processes to 1.0 GB in 12, with Slow ad refresh and Stop ad redirects on
  too.
- The README links each built-in list and has a table of the URLs each one
  catches.
- **Slow ad refresh**, a new switch that's off by default. It wraps Google's
  ad tag so each slot's first load goes through, then refreshes at most once
  every 2 minutes and not while the tab is hidden. Banners still show; they
  just rotate less often. Works on any site using Google's ad tag, not only
  Browsi ones. Per-site On/Off works like the other switches. A slot that
  gets a new box, like on a page that keeps loading articles as you scroll,
  gets its first load again.
- **Stop ad redirects**, a new switch that's off by default. It stops an ad
  from sending the whole tab to another site without a click. Found on the
  same Variety article, where an ad sent the tab to a fake McAfee warning
  page twice in a row.

- **Off everywhere.** The popup's **Pause on (site)** switch is now a bar
  at the top with three choices: **On**, **Off on this site** and **Off
  everywhere**. Off everywhere stops blocking on every site at once, and the
  toolbar icon says **off** until it's turned back on.
- **Alt+Shift+O** turns blocking off on the site you're on and reloads the
  tab. Press it again to turn it back on. The popup and settings page show
  it, and it can be changed at `chrome://extensions/shortcuts`.
- **A settings page you can read at a glance.** It fills the window now. The
  top has totals for today, 7 days and 30 days, then four charts: blocks per
  day by type, what was blocked this week, the most blocked domains and the
  sites with the most blocks. Under those, a **What gets blocked** table lists
  every kind of blocking, how many rules it has, whether it's on and what it
  caught this week, then the last 12 blocks. Counts start from this version
  and stay on this computer for 30 days.

### Changed
- The toolbar count only shows for the first 7 minutes of each hour. The
  rest of the hour it's just the icon. The popup still shows the count any
  time.

## 1.6.0 — 10-26-2026

Stricter resource control with recovery, and independent choices for each site.
Published source is mirrored to GitHub and Codeberg. Source tag: `v1.6.0`.

### Added
- **Restore this content** after heavy-content removal. The parent saves the
  iframe attributes, replaces its source with about:blank to stop work, and
  restores it on request. The restored element is exempt until page reload.
- **Controls for this site** in both the toolbar popup and real Chrome DevTools
  panel. Each feature supports Default/On/Off, with hostname inheritance.
  Changing a control applies the rules and reloads the relevant tab.
- **Hide on this site** in the picker, including URL-less elements. Rules
  persist as hostname-scoped CSS, apply to later matching elements, and can
  be undone in settings or DevTools without touching global URL blocks.
- **All heavy third-party embeds**, an optional broader mode for noisy sites.
  It requires Heavy ads and includes unrecognized embeds; the UI explains
  that legitimate videos and tools can be removed too.
- Independent **Newsletter offers** and **Notification requests** switches.
  The existing 24 handmade annoyance rules are split into 18 and 6 rules;
  no new upstream filter list is bundled. An older enabled annoyance switch
  still enables both categories until an explicit choice is saved.
- Backups and sync include site overrides and hidden selectors; import
  merges them, deduplicates selectors and rejects invalid CSS rule text.
- Automated regression coverage for exceptions, restore, ordinary banners,
  legitimate heavy embeds, per-site hiding, migration, backups and actual
  browser UI surfaces. Read-only live checks pair baseline/protected sessions
  across news, shopping, sports and streaming pages.

### Changed
- Heavy-content removal now requires a recognized ad hostname, explicit
  publisher ad-slot attribute, known ad-frame ID or advertising frame title
  unless broader mode is enabled. Limits remain 4 MB of declared responses
  or 5 seconds of long tasks per 30 seconds.
- Personal URL blocks have higher priority than per-category site exceptions.
  Full site pause remains the highest priority and disables cosmetic hiding too.
- The popup keeps the three main protections visible and folds optional
  prompts and broader mode into an expandable group. DevTools has defaults,
  inspected-site controls, saved rules, URL management and the request log.
- Existing registered scripts are refreshed on extension updates, so new
  helper dependencies are not omitted on upgrade.

### Verification and limits
- See [Testing and compatibility](docs/Testing.md) for exact commands and live
  observations. Unavailable ads/video are recorded as inconclusive, not passes.
- These controls cannot stop CPU/GPU work in the top-level page or guarantee
  quiet fans. Content-Length misses streamed bytes, long tasks are a proxy
  for CPU pressure, and conservative ad identification can miss ads.
- Site exceptions refresh asynchronously on navigation. CSS hiding does not
  block downloads, unlock scroll, or reach closed shadow roots. A page
  redesign can invalidate structural selectors.

Decisions: [016–020](docs/adr/README.md).

## 1.5.1 — 10-26-2026

Two small fixes the new test suite caught, one found in review, and
URLs that differ only in capital letters count as one entry.

Commits: `2f4352b`, `a4a7ea8`

### Changed
- The domain part of a URL you type or pick is lowercased, and `WWW.`
  is stripped however it's capitalized, so `Example.com` and
  `example.com` are one entry. Paths keep their case.

### Fixed
- Updating on a second computer no longer drops that computer's block
  list and paused sites; both lists are merged.
- The picker's **Exact URL** choices show the port again. A URL on
  `localhost:8791` showed as `localhost`; what got blocked was always
  right.
- Importing a backup reports the right count. It used to count
  duplicates and different spellings of one URL that were only stored
  once.

### Added (for contributors)
- An end-to-end test suite: `pnpm install`, then `pnpm test`. 74 tests
  in 13 spec files cover install state, blocking, pausing, autoplay,
  heavy ads (download and CPU), the IMA stand-in, the picker, the popup,
  the settings page, the DevTools panel, the 1.4.0 to 1.5.x upgrade, and
  a performance guard (no long tasks on worst-case pages). A run takes
  about 57 seconds. It uses Playwright 1.64.0 with the Chromium build
  that version already ships with, and serves its test pages on
  `127.0.0.1` and `localhost` so the third-party checks kick in. It
  found the port and import-count bugs above. Not covered yet:
  `devtools.js`, clicking the right-click menu, and a real Alt+Shift+K
  keypress.

## 1.5.0 — 10-26-2026

Your settings follow you between computers, there's a settings page, and
Google's video ad engine gets a stand-in that tells players "no ads."

Commit: `6b498fa`

### Added
- **Settings sync.** Your block list, paused sites and switches follow
  your Chrome sign-in to every computer. Chrome syncs them through your
  Google account; the extension still sends nothing to any server of its
  own. The request log and today's count stay on each computer.
- **Settings page.** Right-click the toolbar icon and choose
  **Options**, or click **Blocked URLs and paused sites** in the popup.
  It has the four switches, your full block list with search and Remove,
  paused sites with Unpause, the keyboard shortcut, and backups.
- **Backups.** Export saves `url-blocker-backup-MM-DD-YYYY.json` to your
  downloads. Import adds the file's URLs and paused sites to yours and
  never removes anything; switches take the file's settings.
- **Keyboard shortcut.** Alt+Shift+K starts the picker. Change it from
  the settings page or at `chrome://extensions/shortcuts`.
- **Google IMA stand-in.** Google's video ad engine (`ima3.js`) is
  swapped for a small script of our own that answers every ad request
  with IMA's normal "no ad" reply, so players go straight to the video.
  It's part of the **Video ad companies** switch.
- **No more blank boxes.** When a heavy ad or a video ad that kept
  restarting gets unloaded, its box is hidden too.

### Changed
- The popup shows how many URLs are blocked and sites paused instead of
  the whole list, so it fits without scrolling. The list lives on the
  settings page.
- The toolbar count clears at midnight on the dot, instead of on the
  first block of the new day.
- Your existing list, paused sites and switches move to sync on update.
- The block list now tops out at about 300 entries, Chrome's sync limit.
  Past that, adding one shows a message saying the list is full.
- Needs the `alarms` permission, for the midnight reset.

## 1.4.0 — 10-26-2026

Ads that spin up your fan get unloaded, and the popup and DevTools panel
got a redesign.

Commits: `3190ef2`, `0715fed`, `7c88061`, `131a26d`, `c111ba8`, `f3acf04`

### Added
- **Heavy ads** (on by default). A third-party ad frame gets unloaded
  once it has downloaded 4 MB, Chrome's own heavy ad limit, or spent
  5 seconds of busy CPU in any 30. Frames you've clicked and frames from
  the site itself are never touched. Removed ads show up in the DevTools
  log and today's count.
- A Heavy ads switch in the popup.

### Changed
- New popup: light and dark themes, today's blocked count as the big
  number up top, **Pause on (site)** in its own card, and four blocking
  switches with a one-line description each. Real checkboxes styled as
  switches, a visible focus ring, and WCAG AA contrast in both themes.
- The DevTools panel looks like the rest of DevTools: same grays, 12px
  type, monospace URLs, and it follows the DevTools light or dark theme.
  The log is a Time | URL table that stacks when DevTools is docked
  narrow.
- The panel stops drawing the log while you're on another DevTools tab
  and catches up when you come back.
- Needs the `webRequest` permission, for counting ad download sizes. It
  only watches; it doesn't block anything.

### Removed
- The Settings, Statistics and Advanced sidebar and the Open Inspector
  button in the DevTools panel. None of them did anything.

## 1.3.0 — 10-26-2026

Commits: `41583d1`, `18f4319`, `a4a3803`

### Added
- **Pause on (site)** in the popup turns everything off for that site,
  including your own list, the built-in lists and the autoplay stopper,
  then reloads the tab.
- The toolbar icon shows how many requests were blocked today. It needs
  an unpacked install; a Web Store install shows each tab's own count.
- A **Pop-ups and prompts** switch (off by default) that blocks
  OptinMonster, Privy, Justuno, Sumo, Klaviyo forms, OneSignal and
  similar tools. Pop-ups a site builds itself still show.
- The autoplay stopper hides a paused ad that floats in a corner of the
  window.

### Changed
- The picker lists whole domains first, then exact URLs. Ad URLs change
  on every load, so a whole domain is usually the one you want. The
  site you're on isn't offered, since that would block the site.

## 1.2.1 — 10-26-2026

Commits: `812ccbf`, `1570061`, `366116e`

### Fixed
- Ad players that hit play again the moment they're paused used to win:
  the ad played about 98% of the time. Now a video that restarts itself
  3 times in 2 seconds gets unloaded.
- The picker no longer bogs the page down. It checks what's under the
  pointer once per frame and scans at most 2,000 elements, so picking a
  huge ad container doesn't freeze the tab.

### Removed
- The Google IMA block (`imasdk.googleapis.com`). It could leave a
  site's own video player waiting on ads forever. The autoplay stopper
  still pauses those ads.

## 1.2.0 — 10-26-2026

Commits: `f48aedb`, `15d5f8d`

### Added
- A built-in video ad list, on by default. It blocks Connatix, Primis,
  AnyClip, EX.CO, Teads, Aniview, Vidazoo, Truvid, SendtoNews,
  SpringServe, SpotX, Innovid, vdo.ai and ExtremeReach, plus only the
  video parts of Taboola, Amazon and Google IMA. Banner ads and
  Taboola's recommendations still load.
- An autoplay stopper, on by default. It pauses muted videos that start
  before you click or press a key, in every frame on the page, ad frames
  included. Videos you start play normally.
- Popup switches for both. Turning the stopper off removes it from every
  page.

## 1.1.0 — 10-25-2026

The features 1.0.0 had on paper now work.

Commits: `89118c3`, `62cb315`

### Added
- The right-click **Block ad element** menu the README described.
- The picker works on ads inside iframes. Esc cancels.

### Changed
- The picker loads into a tab only when you use it, instead of into
  every tab, and takes its overlay off the page when you're done.
- The picker covers the page while you pick, so your click never
  reaches the ad. Its overlay and dialog are walled off from the page's
  own styles.
- A bare domain like `example.com` blocks its subdomains but not
  look-alikes such as `notexample.com`.
- Messages show as a status line instead of `alert()` pop-ups.
- The request log saves once a second instead of on every blocked
  request, and the DevTools panel updates when the log changes instead
  of checking every 5 seconds.
- Needs Chrome 121 or newer. No longer asks for the `tabs` permission.

### Fixed
- Picking an element and choosing a URL said "Failed to block URL".
  It blocks now.
- The DevTools panel's picker buttons did nothing. They work now.
- The request log could throw an error at startup. It was missing the
  `declarativeNetRequestFeedback` permission.
- Two quick changes to the block list could collide and drop a rule.

### Removed
- The popup's Cancel button, which did nothing.

## 1.0.0 — 04-15-2025

The first version, built between 03-13-2025 and 04-15-2025.

Commits: `1faa041`, `4fff39a`, `46482a3`, `867060f`

### Added
- Type a URL into the popup to block it on every site. Blocking runs in
  Chrome's own network layer (Manifest V3 blocking rules).
- An element picker for finding the URLs inside an ad.
- A **URL Blocker** tab in DevTools with your block list and a log of
  blocked requests.

### Known problems (fixed in 1.1.0)
- Choosing a URL in the picker failed with "Failed to block URL".
- The picker buttons in the DevTools panel did nothing.
- The right-click menu in the README was never built.
- The picker loaded into every tab, used or not.
