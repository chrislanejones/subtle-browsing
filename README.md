<p align="center">
  <img src="images/icon128.png" alt="URL Blocker logo" width="96" />
</p>

# URL Blocker

**Version 1.9.0** (10-31-2026) &nbsp;·&nbsp; Chrome 121+ &nbsp;·&nbsp; Manifest V3 &nbsp;·&nbsp; MIT &nbsp;·&nbsp; [Changelog](CHANGELOG.md) &nbsp;·&nbsp; [Design decisions](docs/adr/README.md)

A Chrome extension that goes after the ads people actually hate (autoplay
video, pop-ups, ads that spin up your fan) and leaves normal banner ads
alone. You can also block any URL yourself, or click an ad on the page to
block where it came from. Your list and switches follow your Chrome sign-in
to every computer.

## Latest update: 1.9.0

**Stop ad redirects** also checks popups opened inside child frames, including
same-site, cross-site, `srcdoc` and rewritten empty frames. Trusted Play controls
inside an iframe can start their parent player; ordinary iframe clicks and
forged messages cannot grant playback.

**Larger saved lists** span multiple Chrome sync items, covering blocked URLs,
paused sites, site overrides and hidden elements. Incomplete sync keeps the
last complete rules available. Chrome's overall sync quota still applies.

**90 days of local history** now live in IndexedDB, with safe migration of
existing counts and a 14/30/90-day chart selector. Tables stack into labeled
rows on narrow windows. Updating the existing unpacked folder keeps your
extension ID, settings and history; use Chrome's reload arrow afterward.

Detailed changes: [Changelog](CHANGELOG.md#190--10-31-2026).
Verification and practical limits: [Testing and compatibility](docs/Testing.md).

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
| Video ad blocking | Blocks the companies that serve video ads (Connatix, Primis, AnyClip, Teads, Celtra and others), and swaps Google's video ad engine for a stand-in that says "no ads". Banner ads still show | Yes |
| Autoplay stopper | Pauses videos that start without a play gesture, including audible ads after unrelated clicks. A site's own video that floats into the corner goes back into the article, paused; a floating ad with no place on the page is hidden. Videos you start play normally | Yes |
| Heavy ad removal | Stops identified third-party ads at 4 MB or 5 seconds of long tasks in 30 seconds; offers Restore | Yes |
| Broader heavy-embed mode | Applies those limits to unrecognized third-party embeds too; may stop legitimate content | No |
| Newsletter offers | Blocks newsletter and promotional overlay tools | No |
| Notification requests | Blocks website push-prompt tools independently | No |
| Ad refresh and sync frames | Blocks Browsi's ad refresh and the hidden cookie-sync frames that ad auctions open. [See the URLs](rules/ad-churn.json) | No |
| Slow ad refresh | Lets each Google ad slot refresh at most once every 2 minutes, and not in a hidden tab | No |
| Stop ad redirects | Stops unwanted cross-site redirects and click-triggered popunders | No |
| Pinned ads | An ad stuck to the top of the window while you scroll stays at the top of the page instead, and scrolls away like a banner. The site's own sticky header is left alone | Yes |
| Site controls | Override individual protections for a site and its subdomains | Inherit defaults |
| Hide on this site | Hide a picked element only on its hostname; undo in settings or DevTools | — |
| On / Off on site / Off / 10 min off | The Blocking card at the bottom of the popup. Turns everything off for one site in case it breaks, for every site at once, or for one site for 10 minutes | On |
| Blocked-today counter | The toolbar icon shows how many requests were blocked today, for the first 7 minutes of each hour | — |
| Block a URL | Type a URL to block it on every site | — |
| Element picker | Click an ad to see the domains and URLs inside it, then block one | — |
| Keyboard shortcuts | Alt+Shift+K starts the picker. Alt+Shift+O turns the site you're on off, and again to turn it back on | — |
| Right-click menu | **Block ad element** starts the picker | — |
| Settings page | Charts of what was blocked, a table of every kind of blocking, the full block list with search, paused sites, the shortcuts, backups | — |
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

For this WSL checkout, choose
`\\wsl.localhost\Debian\home\clj\repo\subtle-browsing` once. After an update,
update the files in that same folder (for a clone, `git pull --ff-only`),
then click the extension's reload arrow at `chrome://extensions/`, then reload the
webpages you want to check. Open Settings to confirm **Version 1.9.0**. Disable
an older duplicate installation so only one copy is active; export its backup
first if you need to transfer rules to a different extension ID.

You do **not** need to remove and reinstall it. Keeping the same folder and
Chrome profile preserves this installation's data. Reload existing webpages
so their content scripts update too. [Chrome's reload instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#reload_the_extension).

Web Store installations receive automatic updates after a new version is
published; unpacked folders use the manual Reload step above.
[Chrome's update lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle).

The unpacked route is the current daily-use route. The Web Store account still
needs developer registration (agreement and registration fee) before upload.
The prepared package is `dist/url-blocker-1.9.0.zip`; the listing kit is in
[docs/store/LISTING.md](docs/store/LISTING.md).

## How to use

### What gets blocked

The popup shows the current site’s effective protection state and **Controls
for (site)**. Expand **Defaults for all sites** for global settings, then
**Offers, prompts and broader limits** for the six default-off choices. The settings page and DevTools **Default protections** expose the
same choices.

| Switch | How it works |
| --- | --- |
| **Video ad companies** | Uses the list in [`rules/video-ads.json`](rules/video-ads.json). Blocks whole video-ad companies, plus only the video parts of bigger networks (Taboola's video player, Amazon's video ads), so their regular ads still show. Also swaps in the Google IMA stand-in. |
| **Autoplay videos** | Pauses videos that start without a play gesture, muted or audible. Click Play or use the player’s playback keys to watch. |
| **Heavy ads** | Stops an identified third-party ad frame at 4 MB of declared downloads or 5 seconds of long tasks in 30 seconds. |
| **All heavy third-party embeds** | Broadens Heavy ads to unrecognized third-party frames. Heavy ads must also be on. |
| **Newsletter offers** | Uses [`rules/annoyances.json`](rules/annoyances.json): OptinMonster, Privy, Justuno, Sumo, Klaviyo forms and similar. |
| **Notification requests** | Uses [`rules/notifications.json`](rules/notifications.json): OneSignal, PushEngage, iZooto, Webpushr, Aimtell and PushCrew. |
| **Ad refresh and sync frames** | Uses [`rules/ad-churn.json`](rules/ad-churn.json): Browsi's ad-refresh scripts, plus 26 hidden cookie-sync frames from ad auctions by name (OpenX, PubMatic, Rubicon, AppNexus, Criteo, TripleLift, Index Exchange, LiveIntent and others) and 3 patterns for sync frames from anyone else. |
| **Slow ad refresh** | Wraps Google's ad tag (`googletag.pubads().refresh()`) in [`refresh-throttle.js`](refresh-throttle.js). Every slot's first load goes through; after that each slot refreshes at most once every 2 minutes, and not while the tab is hidden. |
| **Stop ad redirects** | [`ad-redirect-guard.js`](ad-redirect-guard.js) checks top-page navigation and scripted popups in every frame against the control you used. Article clicks and Play buttons cannot authorize a jump to another site. Links, forms, reload and back/forward remain usable. |

More on each:

- **Video ad companies:** Google's video ad engine (IMA, `ima3.js`) runs
  inside JW Player and lots of other players. Blocking it outright can
  leave the player waiting forever, so the extension swaps in its own
  small stand-in. Every ad request gets IMA's normal "no ad" reply, and
  the player goes straight to the video.
- **Autoplay videos:** if an ad player keeps restarting itself, its
  video gets unloaded after repeated retries, so it can't turn into a
  tug-of-war that slows the page down. When that ad is in its own frame,
  the frame's box is hidden too. A paused ad floating in a corner of the
  window is hidden as well, with **Play this video** at its former position.
  Unloaded videos and collapsed autoplay frames have restore controls.
  A video paused inside an article keeps its player. If it floated into a
  corner, it returns to the article until you press Play.
- **Heavy ads:** the limits stay at 4 MB and 5 seconds of long tasks per
  30 seconds. The parent frame requires a known ad hostname or an explicit
  ad-slot marker before removal. It blanks the frame to stop its scripts
  and downloads, then shows a compact restore button. Restoring exempts that
  frame element until the page reloads. Frames you interacted with and
  first-party frames are spared. Removal events appear in the DevTools log.
- **All heavy third-party embeds:** opt into this on especially troublesome
  sites to remove heavy embeds even without an ad marker. It can remove
  legitimate content, so use Restore or turn Heavy ads off for that site.
  Neither mode stops scripts running directly in the top-level page.
- **Newsletter offers / Notification requests:** these block the third-party
  tools, not every overlay a site builds itself. On upgrade, an old enabled
  **Pop-ups and prompts** setting enables both categories until you change
  their separate switches.
- **Ad refresh and sync frames:** a local news article left open climbed
  past 1.2 GB. The page itself never changed. The ads did: a new auction
  about every 30 seconds, Browsi swapping in fresh ads, and 28 invisible
  frames syncing cookies between ad companies. No single frame is heavy,
  so the heavy-ad limits never trip. A Variety article went further: 3.2 GB
  twenty seconds after it opened, spread over 76 processes, because Chrome
  gives every outside site's frame its own process and Variety's ads open
  sync frames from about 60 companies. Listing them by name can't keep up,
  so three patterns also catch any outside frame whose address looks like a
  sync URL. With this switch, Slow ad refresh and Stop ad redirects on, the
  same article used 1.0 GB in 12 processes, and it showed 4 banners instead
  of 3. It blocks only frames, so the same companies' visible banners still
  show. It's off by default because a pattern can still catch something it
  shouldn't.
- **Slow ad refresh:** Browsi isn't the only thing refreshing ads. Most
  news sites ask Google's ad tag for a fresh round on a timer, and each
  round loads new ads into the page's memory. This switch doesn't block
  anything. Banners still show; they just change every 2 minutes instead of
  every 30 seconds, and stop changing while you're on another tab. On
  Variety, 150 seconds of the page's own refreshing sent 10 ad requests
  with it off and 2 with it on. That also means fewer paid impressions for
  the site, which is why it's off by default.
- **Stop ad redirects:** the same Variety article sent the whole tab to a
  fake McAfee warning page, twice in a row, without a click. The ad ran in
  one of Google's ad frames that shares the page's address, and Chrome only
  stops that trick for frames from other sites. This switch cancels a jump
  to another site that no navigation control started, and blocks page and iframe
  popunders triggered by article text or a media control. It's off by default
  because a site's own sign-in or checkout can move you to another site the same way;
  turn it off for that site if one does.

#### URLs each list catches

| Switch | List | Rules |
| --- | --- | --- |
| Video ad companies | [`rules/video-ads.json`](rules/video-ads.json) | 20 |
| Newsletter offers | [`rules/annoyances.json`](rules/annoyances.json) | 35 |
| Notification requests | [`rules/notifications.json`](rules/notifications.json) | 6 |
| Ad refresh and sync frames | [`rules/ad-churn.json`](rules/ad-churn.json) | 30 |

Each rule's `urlFilter` is the URL it catches. Your own blocked URLs are on
the settings page, and on an unpacked install the DevTools log lists every
request blocked in a tab.

### Controls for one site

Open **Controls for (site)** in the toolbar popup or the Chrome DevTools
panel. Each protection has **Default**, **On**, and **Off**. For example,
turn **Autoplay videos** off here and leave **Video ad companies**
on. Your personal URL blocks stay active.

- Changes reload the inspected/active tab after the rules are applied.
- Choices cover that hostname (without `www.`) and its subdomains. A more
  specific site's choice wins; Default inherits the parent or global choice.
- **Off on this site** still disables everything, including hidden elements.
- Remove overrides with **Reset site** in settings or DevTools; reload open
  pages afterward. Content that was already removed needs Restore or reload.

### Turning it off

Open the **Blocking** card at the bottom of the popup. Closed, it shows where
things stand, like "On" or "Off until 3:42 PM". Inside is one bar with four
choices.

| Choice | What it does |
| --- | --- |
| **On** | Blocks as usual |
| **Off on site** | Stops everything on the site you're on, in case it breaks |
| **Off** | Stops everything on every site. The toolbar icon says **off** until you turn it back on |
| **10 min off** | Stops everything on the site you're on for 10 minutes, then blocking comes back on its own |

- "Everything" means your own block list, the built-in lists, the autoplay
  stopper, heavy ad removal and hidden elements.
- The tab you're on reloads. Other open tabs catch up the next time they
  load.
- **On** undoes both, for the site you're on. A site can also be turned
  back on with **Unpause** on the settings page.
- Off everywhere follows your Chrome sign-in like the paused sites do.

**10 min off** only works while blocking is on, and only in this browser. Its
deadline survives restarts. Blocking resumes without reloading
open pages; use Restore or reload for content already removed. Timed pauses
appear in Settings but are not synced or exported.

A pause inherited from a parent domain is named in the popup. Choosing **On**
removes that parent pause too, resuming its subdomains. **Resume blocking** in
Settings clears the global pause while preserving individual site pauses.

### Blocked-today counter

- The number on the toolbar icon is how many requests were blocked today,
  across every tab.
- It shows for the first 7 minutes of each hour (:00 to :06), then the icon
  goes back to plain. The popup shows the count any time.
- It clears at midnight, your local time.
- The daily count only works when the extension is loaded unpacked. A Web
  Store install continuously shows each tab's own count instead. Settings marks
  network totals and charts **Unavailable**, and DevTools shows observed
  heavy-content removals rather than an empty network log.

### Blocking URLs by hand

1. Click the URL Blocker icon in your toolbar.
2. Choose **Domain**, **Exact URL**, or **Advanced pattern**.
   Domain blocks the hostname and its subdomains. Exact URL matches its scheme,
   hostname, case-sensitive path and query; fragments are ignored. Advanced
   pattern accepts Chrome URL-filter syntax such as `||example.com^*/ads/*`.
3. Enter the address and read the preview to check its scope. Internationalized
   hostnames are converted to their network form automatically.
4. Click **Block**. Confirmation appears after the rule is applied, with **Undo**.
5. **Blocked URLs and paused sites** opens the searchable list in Settings.

Existing domain/path entries match that host and exact path on HTTP or HTTPS;
they no longer match another hostname or a URL embedded in a query string.
Older explicit filter patterns are retained. Backups preserve each rule’s mode.

### Using the element picker

1. Go to a page with the ad you want gone.
2. Click the URL Blocker icon in your toolbar.
3. Click **Select element to block**.
4. Your cursor turns into a crosshair. Hover over things to highlight them.
5. Click the ad. Ads inside iframes work too, and the click never reaches
   the ad. Press Esc to cancel.
6. A dialog offers **Hide on this site**, plus any domains and URLs found in that element.
7. Pick a **whole domain** (best for ads, whose URLs change on every load)
   or one **exact URL**. The site you're on isn't offered as a domain,
   since that would block the site itself.
8. A URL choice goes on your global block list. **Hide on this site** instead
   saves a CSS selector for the clicked element on that hostname. It also
   works when there are no source URLs. It hides rather than stops downloads.
9. Undo hiding with **Unhide** under **Hidden elements and site overrides**
   in settings or DevTools. The element reappears without reloading if the
   page has not removed it itself. Hiding an overlay does not repair a site's
   scroll lock, and a structural selector can need updating after a redesign.

### Using the keyboard shortcuts

- Press **Alt+Shift+K** on any page to start the picker, then carry on from
  step 4 above.
- Press **Alt+Shift+O** when a page isn't working. It turns blocking off on
  that site and reloads the tab. Press it again to turn it back on. If
  **Off everywhere** is on, it turns everything back on.
- The popup and settings page show the current shortcuts.
- If Chrome didn't assign one, the settings page shows **Not set**. Click
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

Protections and saved rules appear first. Expand **Activity and diagnostics**
below them for totals, charts and recent activity. **Resume blocking** appears
in the header when blocking is off everywhere.

| Section | What you can do |
| --- | --- |
| Overview | Blocked today, the last 7 and 30 days, and how many URLs, paused sites and hidden elements you have |
| Charts | Blocks per day for 14, 30 or 90 days by type, what was blocked this week, the most blocked domains and the sites with the most blocks. Hover a bar for its numbers. **Show as a table** under Blocks per day lists every day |
| What gets blocked | Every kind of blocking: what it stops, how many rules, whether it's on and how many it caught this week |
| Recent blocks | The last 12 blocks: when, what type, the domain and the site you were on |
| Block | The same nine global defaults as the popup |
| Hidden elements and site overrides | Unhide elements and reset per-site choices |
| Blocked URLs | Add a URL, search your list, remove entries |
| Paused sites | See every paused site and **Unpause** any of them |
| Keyboard shortcuts | See both shortcuts; **Change** opens Chrome's shortcut page |
| Backup | **Export backup** and **Import backup** (see [Sync and backups](#sync-and-backups)) |

### Using the DevTools panel

1. Open Chrome DevTools (F12 or Ctrl+Shift+I).
2. Click the **URL Blocker** tab.
3. From there you can:
   - Change default protections or individual controls for the inspected site
   - Unhide elements and reset site overrides
   - See and manage your blocked URLs
   - See the log of blocked requests
   - Start the element picker
   - Refresh or clear the log

## Sync and backups

| What | Where it's kept |
| --- | --- |
| Block list, paused sites, Off everywhere, switches, site overrides, hidden elements | Synced: follows your Chrome sign-in to every computer |
| Request log, blocked-today count, daily counts for the charts (90 days in IndexedDB) | This computer only |

- Chrome does the syncing, through your Google account. The extension
  doesn't run a server or send anything anywhere itself.
- Updating from 1.4.0 or earlier moves your existing list, paused sites
  and switches into sync. If sync already has them from another computer,
  the block lists and paused sites are merged, and the synced switches
  win.
- Large blocked-URL, paused-site, override and hidden-element lists are split
  across sync items, lifting the former 8 KB per-list limit. Chrome's overall
  limit is about 100 KB. Retired chunks are replaced in the same atomic save,
  so removing rules does not need room for another full copy. A full sync store
  leaves the old data intact and shows an error. Back up and remove unneeded entries to free space.
- While cloud sync delivers chunks, the last complete local copy remains in use.
  Editing waits for the complete incoming list. Keep other computers on 1.9.0
  or later before growing lists beyond the old limit.
- Daily history keeps 90 local calendar days, including today. Existing
  `stats-*` and `blockStats` records migrate automatically. History stays on
  this computer and is separate from settings backups.

**Backups** are for getting your settings somewhere sync doesn't reach.

- **Export backup** on the settings page saves
  `url-blocker-backup-MM-DD-YYYY.json` to your downloads.
- **Import backup** adds the file's URLs and paused sites to what you
  already have. Nothing gets removed. The switches take the file's
  settings. Site overrides merge by hostname and feature; hidden selectors
  merge without duplicates. Older backups remain supported, and exports contain
  normal lists regardless of their internal storage format. A failed save is
  reported without discarding existing rules.

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

None of these ship inside the extension. The four built-in lists
([`rules/video-ads.json`](rules/video-ads.json), [`rules/annoyances.json`](rules/annoyances.json),
[`rules/notifications.json`](rules/notifications.json), [`rules/ad-churn.json`](rules/ad-churn.json)) are small and hand-made:

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
| Autoplay stopper | Event listeners per frame, with no polling. Turning it off stops enforcement on open pages and unregisters future injection unless a site enables it |
| Heavy ad removal | A long-task observer inside third-party frames, plus adding up download sizes in the background. Turning it off stops enforcement; site overrides can keep the guard enabled |
| Element picker | Only loads into a tab when you use it, and takes its overlay off the page when you're done |
| Box hiding and restore | One message listener per frame while autoplay or heavy-ad removal is enabled globally or on a site |
| Site policy and element hiding | A shared settings cache and a small CSS injector per frame; no polling or mutation observer |
| Slow ad refresh | One small script in each top page while the switch is on for that site. It only does work when the page uses Google's ad tag |
| Stop ad redirects | Event listeners and small wrappers for navigation, window.open and scripted link clicks; no polling |
| Google IMA stand-in | Only loads on pages that ask for Google's video ad engine, in place of the real one |

## Privacy

This extension:

- Works locally in your browser
- Doesn't collect any data
- Doesn't send anything to servers of its own. Your block list, paused
  sites, switches, site overrides and hidden selectors sync through your Google account the way Chrome
  syncs any extension's settings. The log and today's count never leave
  your computer.
- Blocks only the URLs you add and the built-in lists you leave on

## Permissions

| Permission | What it's for |
| --- | --- |
| `storage` | Your block list, switches, paused sites, site overrides, hidden elements, the log and today's count |
| `unlimitedStorage` | Protects the 90-day local IndexedDB history from quota pressure and eviction; does not increase Chrome sync capacity |
| `declarativeNetRequest` | The blocking rules, the pause rule and the IMA swap |
| `declarativeNetRequestFeedback` | Seeing which requests were blocked, for the log, today's count and the charts (unpacked installs only) |
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
- Restoring autoplay content exempts that video for the current page lifetime.
  A source URL that has expired or a player using a revoked media stream may
  still need a page reload.
- An ad frame blocked outright never loads, so it can't hide its own box
  and may leave an empty space.
- Live compatibility checks now cover PCWorld, Best Buy, ESPN and Vimeo,
  with a direct Vimeo playback check. These are bounded smoke checks, not
  a guarantee of every ad or playback path. See [the results](docs/Testing.md).
- Ad identification is conservative and can miss unmarked ads; broader mode
  trades that selectivity for more aggressive third-party embed removal.
- Download counting uses Content-Length, so streamed responses can escape it.
  CPU counting measures long tasks, not all CPU/GPU usage or hardware fan speed.
- Site network exceptions use per-tab session rules; navigation updates are
  asynchronous, so the earliest request after a cross-site navigation can
  precede the refresh. Reload after changing a site setting.
- Hiding cannot reach inside closed shadow roots, and structural selectors
  can target the wrong element after a site changes its layout.
- Ad refresh and sync frames matches specific sync URLs and three sync-URL
  patterns. A sync frame with an ordinary-looking address gets through, and
  an ordinary frame with a sync-looking address would be blocked.
- Slow ad refresh only covers refreshes that go through Google's ad tag. A
  page that resets `googletag` before the tag loads drops the throttle, and
  ad scripts that reload slots some other way aren't slowed.
  On pages without ads it leaves an empty `googletag` command queue behind,
  the same thing Google's own setup snippet creates.
- Stop ad redirects protects top-page navigation and popups inside frames.
  Automatic form submissions, same-site redirect chains and targeted attempts
  to replace page-world hooks can still bypass it.
  Scripted sign-in buttons receive a brief exception; a malicious script can
  borrow that specific gesture. Delayed or unusual legitimate redirects may
  need a site exception. This is an ad nuisance filter, not a security boundary.
- Child-frame Play controls must have a recognizable Play/Watch/Resume/Start
  label, and belong to the parent player's nearby container or name it through
  the iframe's `aria-controls`. Unlabeled or unrelated remote controls may need
  an autoplay exception.
- The IMA stand-in covers `ima3.js` only, not Google's live-stream ad
  engine (`ima3_dai.js`).
- The block list holds about 300 URLs, the most Chrome sync allows.
- Chrome can refuse the Alt+Shift+K shortcut. Set your own at
  `chrome://extensions/shortcuts`.

## Version history

| Version | Date | Highlights |
| --- | --- | --- |
| 1.9.0 | 10-31-2026 | Child-frame popup/playback coverage, larger synced lists, 90-day IndexedDB history, narrow-window tables |
| 1.8.1 | 10-31-2026 | More click hijacks and popunders stopped, audible autoplay protection, article player docking, URL entry race fixed |
| 1.8.0 | 10-30-2026 | Pinned ads scroll away, shield icon, autoplay no longer slips through when you scroll with the keyboard |
| 1.7.0 | 10-28-2026 | Popup reordered with a Blocking card, URL match modes with a preview, Undo, ten-minute pause, settings opens on activity |
| 1.6.0 | 10-26-2026 | Selective heavy-ad removal with Restore, broader embed mode, site controls, site-only hiding, separate prompt lists, live-site checks |
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

- The end-to-end tests load the extension into Chromium and run it
  against local test pages, plus the actual toolbar and DevTools surfaces.
  A run takes about a minute. Live checks run separately: `pnpm run test:live`.
  See [Testing and compatibility](docs/Testing.md) for scope and results.
- The setup is in `playwright.config.js`; the tests and their pages are
  in `tests/`.
- For a Chrome Web Store zip, commit your changes and run
  `pnpm run package`. It writes `dist/url-blocker-<version>.zip` with only
  the files the extension uses: no tests, docs, notes or `node_modules/`.
  Chrome ignores those when you load the folder unpacked, but they don't
  belong in a release.

## License

MIT. See [LICENSE](LICENSE).
