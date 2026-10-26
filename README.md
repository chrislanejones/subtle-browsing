<p align="center">
  <img src="images/icon128.png" alt="URL Blocker logo" width="96" />
</p>

# URL Blocker

**Version 1.5.1** (10-26-2026) &nbsp;·&nbsp; Chrome 121+ &nbsp;·&nbsp; Manifest V3 &nbsp;·&nbsp; MIT &nbsp;·&nbsp; [Changelog](CHANGELOG.md) &nbsp;·&nbsp; [Design decisions](docs/adr/README.md)

A Chrome extension that goes after the ads people actually hate (autoplay
video, pop-ups, ads that spin up your fan) and leaves normal banner ads
alone. You can also block any URL yourself, or click an ad on the page to
block where it came from. Your list and switches follow your Chrome sign-in
to every computer.

## Contents

| Chapter | What's in it |
| --- | --- |
| [Why not a regular ad blocker](#why-not-a-regular-ad-blocker) | The point of this thing |
| [Features](#features) | Everything it does, and what's on when you install |
| [Install](#install) | Load it into Chrome |
| [How to use](#how-to-use) | The switches, pausing a site, the counter, blocking by hand, the picker, the shortcut, the right-click menu, the settings page, DevTools |
| [Sync and backups](#sync-and-backups) | What follows you between computers, and how to save a copy |
| [Ad lists](#ad-lists) | The lists and standards it's built around |
| [Memory use](#memory-use) | What each feature costs a page |
| [Privacy](#privacy) | What stays on your computer |
| [Permissions](#permissions) | What each one is for |
| [Limitations](#limitations) | Known gaps |
| [Version history](#version-history) | Every version at a glance |
| [Design decisions](#design-decisions) | Why it's built the way it is |
| [Contributing](#contributing) | Running the tests |
| [License](#license) | |

## Why not a regular ad blocker

A lot of sites ask you to turn off your ad blocker. Fair enough: ads pay
for the site. I don't mind a banner. What I mind is the autoplay video in
the corner, the pop-up, and the countdown screen before the article. The
goal here is to block those and leave normal ads alone, without clicking
on every bad ad by hand.

## Features

| Feature | What it does | On at install |
| --- | --- | --- |
| Video ad blocking | Blocks the companies that serve video ads (Connatix, Primis, AnyClip, Teads and others), and swaps Google's video ad engine for a stand-in that says "no ads". Banner ads still show | Yes |
| Autoplay stopper | Pauses muted videos that start before you click anything, and hides paused ads that float in a corner. Videos you start play normally | Yes |
| Heavy ad removal | Unloads ads that download more than 4 MB or keep the CPU busy, the ones that spin up your fan, and hides the box they leave | Yes |
| Pop-ups and prompts | Blocks pop-up, newsletter and "allow notifications?" tools | No |
| Pause on this site | Turns everything off for one site, in case it breaks | — |
| Blocked-today counter | The toolbar icon shows how many requests were blocked today | — |
| Block a URL | Type a URL to block it on every site | — |
| Element picker | Click an ad to see the domains and URLs inside it, then block one | — |
| Keyboard shortcut | Alt+Shift+K starts the picker | — |
| Right-click menu | **Block ad element** starts the picker | — |
| Settings page | Full block list with search, paused sites, the shortcut, backups | — |
| Settings sync | Your list, paused sites and switches follow your Chrome sign-in | — |
| DevTools panel | Your block list, a log of blocked requests, and the picker | — |

## Install

**Chrome Web Store:** not published yet.

**Load it unpacked:**

1. Download or clone this repository.
2. Open `chrome://extensions/`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the repository folder.
5. URL Blocker shows up in your toolbar.

## How to use

### What gets blocked

All four switches are in the popup under **Block**. Three are on when you
install; pop-ups is off until you turn it on.

| Switch | How it works |
| --- | --- |
| **Video ad companies** | Uses the list in `rules/video-ads.json`. Blocks whole video-ad companies, plus only the video parts of bigger networks (Taboola's video player, Amazon's video ads), so their regular ads still show. Also swaps in the Google IMA stand-in. |
| **Muted autoplay videos** | Stops any muted video that starts on its own. Video ads start muted because Chrome won't autoplay sound. Click play and the video runs. |
| **Heavy ads** | Unloads a third-party ad frame once it has downloaded 4 MB or spent 5 seconds of busy CPU in any 30. |
| **Pop-ups and prompts** | Uses `rules/annoyances.json`: OptinMonster, Privy, Justuno, Sumo, Klaviyo forms, OneSignal and similar. |

More on each:

- **Video ad companies:** Google's video ad engine (IMA, `ima3.js`) runs
  inside JW Player and lots of other players. Blocking it outright can
  leave the player waiting forever, so the extension swaps in its own
  small stand-in. Every ad request gets IMA's normal "no ad" reply, and
  the player goes straight to the video.
- **Muted autoplay videos:** if an ad player keeps restarting itself, its
  video gets unloaded after the third try, so it can't turn into a
  tug-of-war that slows the page down. When that ad is in its own frame,
  the frame's box is hidden too. A paused ad floating in a corner of the
  window is hidden as well. A muted video paused on the page itself keeps
  its box, so you can still click it to play.
- **Heavy ads:** 4 MB is Chrome's own heavy ad limit. The CPU limit is a
  third of Chrome's, because Chrome's is already fan territory. The frame
  goes blank, which stops every script and download in it, and its box is
  hidden so it doesn't leave a hole in the page. Frames you've
  clicked (a video you started) and frames from the site itself are never
  unloaded. Removed ads show up in the DevTools log.
- **Pop-ups and prompts:** blocks the script that draws the pop-up, so
  pop-ups a site builds itself still show.

### Pausing a site

If a site breaks, open the popup on that site and turn on
**Pause on (site)**.

- Everything stops on that site: your own block list, the built-in lists,
  the autoplay stopper and heavy ad removal.
- The tab reloads.
- Turn it off to start blocking again, or click **Unpause** next to the
  site on the settings page.

### Blocked-today counter

- The number on the toolbar icon is how many requests were blocked today,
  across every tab.
- It clears at midnight, your local time.
- The daily count only works when the extension is loaded unpacked. A Web
  Store install shows each tab's own count instead.

### Blocking URLs by hand

1. Click the URL Blocker icon in your toolbar.
2. Type the URL under **Block a URL**, like `example.com` or
   `ads.example.com/banner`. A bare domain like `example.com` also blocks
   its subdomains, but not look-alikes such as `notexample.com`.
3. Click **Block**. It starts blocking right away.
4. The popup shows how many URLs you've blocked. Click
   **Blocked URLs and paused sites** to see, search and remove them on the
   settings page.

### Using the element picker

1. Go to a page with the ad you want gone.
2. Click the URL Blocker icon in your toolbar.
3. Click **Select element to block**.
4. Your cursor turns into a crosshair. Hover over things to highlight them.
5. Click the ad. Ads inside iframes work too, and the click never reaches
   the ad. Press Esc to cancel.
6. A dialog lists the domains and URLs found in that element.
7. Pick a **whole domain** (best for ads, whose URLs change on every load)
   or one **exact URL**. The site you're on isn't offered as a domain,
   since that would block the site itself.
8. It goes on your block list.

### Using the keyboard shortcut

- Press **Alt+Shift+K** on any page to start the picker, then carry on from
  step 4 above.
- The popup and settings page show the current shortcut.
- If Chrome didn't assign it, the settings page shows **Not set**. Click
  **Change** there, or go to `chrome://extensions/shortcuts`, and pick
  your own.

### Using the right-click menu

1. Right-click the ad.
2. Choose **Block ad element**.
3. Carry on from step 4 of the element picker.

### Using the settings page

Open it either way:

- Right-click the toolbar icon and choose **Options**.
- Click **Blocked URLs and paused sites** in the popup.

| Section | What you can do |
| --- | --- |
| Block | The same four switches as the popup |
| Blocked URLs | Add a URL, search your list, remove entries |
| Paused sites | See every paused site and **Unpause** any of them |
| Keyboard shortcut | See the picker shortcut; **Change** opens Chrome's shortcut page |
| Backup | **Export backup** and **Import backup** (see [Sync and backups](#sync-and-backups)) |

### Using the DevTools panel

1. Open Chrome DevTools (F12 or Ctrl+Shift+I).
2. Click the **URL Blocker** tab.
3. From there you can:
   - See and manage your blocked URLs
   - See the log of blocked requests
   - Start the element picker
   - Refresh or clear the log

## Sync and backups

| What | Where it's kept |
| --- | --- |
| Block list, paused sites, switches | Synced: follows your Chrome sign-in to every computer |
| Request log, blocked-today count | This computer only |

- Chrome does the syncing, through your Google account. The extension
  doesn't run a server or send anything anywhere itself.
- Updating from 1.4.0 or earlier moves your existing list, paused sites
  and switches into sync. If sync already has them from another computer,
  the block lists and paused sites are merged, and the synced switches
  win.
- Sync allows about 300 blocked URLs (8 KB per item). Past that, adding
  one shows a message that the list is full. Remove a few and try again.

**Backups** are for getting your settings somewhere sync doesn't reach.

- **Export backup** on the settings page saves
  `url-blocker-backup-MM-DD-YYYY.json` to your downloads.
- **Import backup** adds the file's URLs and paused sites to what you
  already have. Nothing gets removed. The switches take the file's
  settings.

## Ad lists

These are the lists and standards this extension is built around. They're
picked because they go after annoying ads, not all ads. A general list like
EasyList blocks everything, which is the opposite of the point.

| List | What it blocks | Fit for "kill video, keep some ads" |
| --- | --- | --- |
| [EasyList / Fanboy Annoyances](https://github.com/easylist/easylist) | Pop-ups, newsletter overlays, cookie banners, social widgets | Good |
| [AdGuard Annoyances + Popups filters](https://github.com/AdguardTeam/AdguardFilters) | The same kind of thing, well maintained | Good |
| [Better Ads Standards](https://www.betterads.org/standards/) (Coalition for Better Ads) | Not a blocklist. It defines the formats people hate: autoplay video with sound, pop-ups, countdown screens, large sticky ads | The best spec for what counts as "annoying" |
| [`@adguard/dnr-rulesets`](https://www.npmjs.com/package/@adguard/dnr-rulesets) (npm) | AdGuard's lists already converted to Chrome's built-in blocking format (Manifest V3 rules) | The easiest way in, but GPL-3.0-only, so it isn't bundled here |

None of these ship inside the extension. The two built-in lists
(`rules/video-ads.json`, `rules/annoyances.json`) are small and hand-made:

- AdGuard's rulesets are GPL-3.0-only and this repo is MIT.
- Most annoyance filters hide page elements with CSS, which Chrome's
  blocking rules can't do.
- Cookie banners are left out on purpose: blocking a consent tool can leave
  the page stuck so it won't scroll.

The full reasoning is in [ADR-004](docs/adr/004-built-in-rulesets-are-hand-made-not-easylist-or-adguard.md).

## Memory use

| Part | What it costs |
| --- | --- |
| Blocking | Runs inside Chrome's own network layer, so it costs nothing per page |
| Video ad list | Built in, so Chrome reads it once at install instead of on every page |
| Autoplay stopper | One small event listener per page. Turning it off removes it from every page |
| Heavy ad removal | A long-task observer inside third-party frames, plus adding up download sizes in the background. Turning it off removes the frame script |
| Element picker | Only loads into a tab when you use it, and takes its overlay off the page when you're done |
| Box hiding | One small message listener per frame while the autoplay stopper or heavy ad removal is on |
| Google IMA stand-in | Only loads on pages that ask for Google's video ad engine, in place of the real one |

## Privacy

This extension:

- Works locally in your browser
- Doesn't collect any data
- Doesn't send anything to servers of its own. Your block list, paused
  sites and switches sync through your Google account the way Chrome
  syncs any extension's settings. The log and today's count never leave
  your computer.
- Blocks only the URLs you add and the built-in lists you leave on

## Permissions

| Permission | What it's for |
| --- | --- |
| `storage` | Your block list, switches, paused sites, the log and today's count |
| `declarativeNetRequest` | The blocking rules, the pause rule and the IMA swap |
| `declarativeNetRequestFeedback` | Seeing which requests were blocked, for the log and today's count (unpacked installs only) |
| `scripting` | Loading the picker, the autoplay stopper and the heavy ad check into pages |
| `webRequest` | Adding up how much each ad downloads. It only watches; it doesn't block |
| `contextMenus` | The right-click **Block ad element** menu |
| `alarms` | Clearing today's count at midnight |
| Access to all sites | The picker and the frame scripts have to run on whatever page you're on |
| `stubs/ima3.js` (web-accessible) | Lets pages load the IMA stand-in. Its address changes per session, so a site can't use it to detect the extension |

## Limitations

- Some sites use URLs that change constantly or are made up on the fly.
- Complicated ad setups can take more than one blocked URL.
- The DevTools log and the blocked-today count need an unpacked install.
- Chrome warns at install that the extension can "read and change all your
  data" on every site. The picker needs that access to work on any page.
- A video unloaded for restarting itself can't be played later, even by
  clicking it.
- An ad frame blocked outright never loads, so it can't hide its own box
  and may leave an empty space.
- The video ad list has only been checked against PCWorld so far.
- The IMA stand-in covers `ima3.js` only, not Google's live-stream ad
  engine (`ima3_dai.js`).
- The block list holds about 300 URLs, the most Chrome sync allows.
- Chrome can refuse the Alt+Shift+K shortcut. Set your own at
  `chrome://extensions/shortcuts`.

## Version history

| Version | Date | Highlights |
| --- | --- | --- |
| 1.5.1 | 10-26-2026 | Second-computer sync merge fix, picker shows ports, one entry per domain regardless of case, end-to-end test suite |
| 1.5.0 | 10-26-2026 | Settings sync, settings page with backups, Alt+Shift+K shortcut, Google IMA stand-in, no more blank ad boxes |
| 1.4.0 | 10-26-2026 | Heavy ad removal; redesigned popup and DevTools panel |
| 1.3.0 | 10-26-2026 | Pause on this site, blocked-today counter, pop-ups switch, whole-domain picks |
| 1.2.1 | 10-26-2026 | Autoplay tug-of-war fixed, lighter picker, Google IMA no longer blocked |
| 1.2.0 | 10-26-2026 | Built-in video ad list and the autoplay stopper |
| 1.1.0 | 10-25-2026 | Picker loads only when used, right-click menu, broken buttons fixed |
| 1.0.0 | 04-15-2025 | First version: URL blocking, element picker, DevTools panel |

Full notes for every version: [CHANGELOG.md](CHANGELOG.md).

## Design decisions

Why it's built the way it is, one decision per file, in
[docs/adr/](docs/adr/README.md). The folder opens on the index.

## Contributing

Pull requests are welcome.

### Running the tests

You need Node and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm test
```

- 74 end-to-end tests load the extension into Chromium and run it
  against local test pages. A run takes about a minute.
- The setup is in `playwright.config.js`; the tests and their pages are
  in `tests/`.
- For a Chrome Web Store zip, commit your changes and run
  `pnpm run package`. It writes `dist/url-blocker-<version>.zip` with only
  the files the extension uses: no tests, docs, notes or `node_modules/`.
  Chrome ignores those when you load the folder unpacked, but they don't
  belong in a release.

## License

MIT
