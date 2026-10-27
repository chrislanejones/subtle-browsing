# Parking Lot

- **GitHub repo description:** still "Yes, I am doing a Chrome Extention" with no topics. Suggested: `gh repo edit chrislanejones/subtle-browsing --description "Chrome extension that blocks video ads, muted autoplay, pop-ups and heavy ads, and leaves normal banner ads alone." --add-topic chrome-extension --add-topic manifest-v3 --add-topic ad-blocker`
- **Sync caps the block list at about 300 entries:** `chrome.storage.sync` allows 8 KB per item. Past that, adding shows an error. Splitting the list across several keys would lift it.
- **Paused in-page videos keep their box:** boxes collapse for unloaded ad frames and floating players, but a muted video paused on the page itself stays, so it can still be clicked to play.
- **IMA stand-in covers ima3.js only:** Google's DAI SDK (`ima3_dai.js`, used for live-stream ad insertion) isn't redirected.
- **Shortcut can be refused by Chrome:** Alt+Shift+B (bookmarks bar), Alt+Shift+X and Alt+Shift+P weren't assigned in testing; Alt+Shift+K was. If a Chrome version refuses K, the popup and settings page show "Not set" and it can be set at chrome://extensions/shortcuts.
- **Heavy ads and shared clicks:** Chrome shares "the user clicked" between frames from the same origin, so clicking one ad frame spares that ad company's other frames on the page from heavy-ad removal.
- **Heavy ad sizes come from Content-Length:** streamed or chunked responses without that header aren't counted, so some heavy ads slip under the 4 MB limit.
- **webRequest wakes the worker per request:** the download count listens to every response header. Cheap per event, but it keeps the service worker awake on busy pages even with the switch off, because the listener has to be added at startup.
- **Why not AdGuard's annoyance lists:** `@adguard/dnr-rulesets` is GPL-3.0-only, and this repo is MIT, so bundling it would relicense the project. Most of its annoyance filters are also element-hiding (CSS) rules, which Chrome's blocking rules can't apply. `rules/annoyances.json` is a small hand-made list instead. Cookie banners are left out on purpose: blocking a consent tool can leave the page scroll-locked.
- **Video list coverage:** 1.6.0 adds baseline/protected smoke checks on PCWorld, Best Buy, ESPN and Vimeo, plus confirmed user-started Vimeo playback. Banner coverage remains partly inconclusive; see [Testing](docs/Testing.md). Vendors seen there but left alone because they also serve banners: Minute Media, JW Player (also plays the site's own videos). `fwmrm.net` (FreeWheel) is left out because TV-network sites use it for their real shows.
- **Unloaded videos stay unloaded:** a video unloaded for restarting itself 3 times in 2 seconds can't be played later, even by clicking. Fine for ads; if a real video ever trips it, save the source and restore it on click.
- **Picker only looks inside the clicked element:** clicking an ad image doesn't list the link wrapped around it. Consider walking up to the nearest `<a>` or ad container too.
- **Install warning:** `host_permissions: <all_urls>` shows "read and change all your data" at install. Switching to `activeTab` would drop it for the popup and right-click paths, but the DevTools panel would lose the picker.
- **Log needs an unpacked install:** `onRuleMatchedDebug` only fires for unpacked extensions, so the DevTools log stays empty for a Web Store install.

## Follow-ups from 1.6.0

- **Same-page fan activity:** heavy removal does not stop scripts running in the top-level page, GPU work, or all short tasks. Avoid claiming it guarantees quiet fans.
- **Ad evidence:** broaden the known ad-host/slot evidence from reproduced cases; unrecognized heavy frames require the explicit broader mode.
- **Navigation timing:** site category exceptions are per-tab session rules refreshed asynchronously. Earliest requests after navigation can race the refresh; stress-test redirects and many overridden tabs before stronger guarantees.
- **Cosmetic selectors:** structural selectors may need updating after site redesigns. They hide elements but do not prevent downloads or unlock scroll.
- **New sync lists:** site overrides and hidden selectors each have their own per-item quota, like the original URL list. A future sharded format should migrate all three.

## Follow-ups from Ad refresh and sync frames / Slow ad refresh

- **Measure it:** the A/B on the firstcoastnews.com article runs in a real Chrome, since the site's Akamai bot protection returns 403 to Playwright. Run A (both switches off, 10-26-2026): JS heap 162 MB → 207 MB in 5 minutes (about 9 MB a minute), about 0.7 requests a second, 34 iframes with 29 hidden, DOM flat at about 1,590 elements. Run B (both switches on) is still pending: switch them on in the popup, reload the article and sample for 5 minutes the same way. Turn either switch on by default only if the numbers justify it.
- **Slow ad refresh on real GPT:** covered by a stand-in fixture only. Check on a live site that the wrapper lands before the page's own refresh wrappers and that first loads still show.
- **Infinite-scroll slots:** a site that reuses one slot object for each new article would show it empty for up to 2 minutes under Slow ad refresh. Resetting a slot's timer when it's displayed again would fix it, if it shows up.
- **`imprchmp.taboola.com/st` stays out of the sync list:** it carries creative and impression IDs, so it counts paid impressions rather than syncing IDs.
- **Variety at 3.2 GB:** the Jay-Z Super Bowl article (variety.com, 10-26-2026) hit 3.2 GB in Chris's Chrome. A fresh tab never passed 243 MB of main-frame JS heap in 8 minutes, scrolled to the end, with 46 iframes (13 sync frames, 9 Piano paywall frames, 10–12 Google ad slots, YouTube, a Trinity audio player). The weight is in a frame's own process, which a page can't measure. Next step: Chrome Task Manager (Shift+Esc) on a bloated tab, sorted by Memory footprint, to name the subframe.
