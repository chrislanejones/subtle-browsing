# Parking Lot

- **GitHub repo description:** still "Yes, I am doing a Chrome Extention" with no topics. Suggested: `gh repo edit chrislanejones/subtle-browsing --description "Chrome extension that blocks video ads, muted autoplay, pop-ups and heavy ads, and leaves normal banner ads alone." --add-topic chrome-extension --add-topic manifest-v3 --add-topic ad-blocker`
- **Sync caps the block list at about 300 entries:** `chrome.storage.sync` allows 8 KB per item. Past that, adding shows an error. Splitting the list across several keys would lift it.
- **Settings page tables on a narrow window:** below about 640px wide, the What gets blocked and Recent blocks tables scroll sideways. Fine for a settings tab, but a stacked layout would read better.
- **Flaky under load:** "site autoplay exception keeps personal URL blocks active" (improvements.spec.js) failed once with the load average at 12.7 and passed on two reruns. Same family as the picker long-task test.
- **Off everywhere reloads only the current tab:** other open tabs keep their old state until they load again. Reloading every tab could lose what people typed into forms, so it's left alone.
- **Paused in-page videos keep their box:** boxes collapse for unloaded ad frames and floating players, but a muted video paused on the page itself stays, so it can still be clicked to play.
- **IMA stand-in covers ima3.js only:** Google's DAI SDK (`ima3_dai.js`, used for live-stream ad insertion) isn't redirected.
- **Shortcut can be refused by Chrome:** Alt+Shift+B (bookmarks bar), Alt+Shift+X and Alt+Shift+P weren't assigned in testing; Alt+Shift+K was. If a Chrome version refuses K, the popup and settings page show "Not set" and it can be set at chrome://extensions/shortcuts.
- **Heavy ads and shared clicks:** Chrome shares "the user clicked" between frames from the same origin, so clicking one ad frame spares that ad company's other frames on the page from heavy-ad removal.
- **Heavy ad sizes come from Content-Length:** streamed or chunked responses without that header aren't counted, so some heavy ads slip under the 4 MB limit.
- **webRequest wakes the worker per request:** the download count listens to every response header. Cheap per event, but it keeps the service worker awake on busy pages even with the switch off, because the listener has to be added at startup.
- **Why not AdGuard's annoyance lists:** `@adguard/dnr-rulesets` is GPL-3.0-only, and this repo is MIT, so bundling it would relicense the project. Most of its annoyance filters are also element-hiding (CSS) rules, which Chrome's blocking rules can't apply. `rules/annoyances.json` is a small hand-made list instead. Cookie banners are left out on purpose: blocking a consent tool can leave the page scroll-locked.
- **Video list coverage:** 1.6.0 adds baseline/protected smoke checks on PCWorld, Best Buy, ESPN and Vimeo, plus confirmed user-started Vimeo playback. Banner coverage remains partly inconclusive; see [Testing](docs/Testing.md). Vendors seen there but left alone because they also serve banners: Minute Media, JW Player (also plays the site's own videos). `fwmrm.net` (FreeWheel) is left out because TV-network sites use it for their real shows.
- **Picker only looks inside the clicked element:** clicking an ad image doesn't list the link wrapped around it. Consider walking up to the nearest `<a>` or ad container too.
- **Install warning:** `host_permissions: <all_urls>` shows "read and change all your data" at install. Switching to `activeTab` would drop it for the popup and right-click paths, but the DevTools panel would lose the picker.
- **Network log needs an unpacked install:** `onRuleMatchedDebug` only fires unpacked. Store UI now marks network data unavailable and shows heavy-content removals; actual Web Store publication remains untested.

## Follow-ups from 1.6.0

- **Same-page fan activity:** heavy removal does not stop scripts running in the top-level page, GPU work, or all short tasks. Avoid claiming it guarantees quiet fans.
- **Ad evidence:** broaden the known ad-host/slot evidence from reproduced cases; unrecognized heavy frames require the explicit broader mode.
- **Navigation timing:** site category exceptions are per-tab session rules refreshed asynchronously. Earliest requests after navigation can race the refresh; stress-test redirects and many overridden tabs before stronger guarantees.
- **Cosmetic selectors:** structural selectors may need updating after site redesigns. They hide elements but do not prevent downloads or unlock scroll.
- **New sync lists:** site overrides and hidden selectors each have their own per-item quota, like the original URL list. A future sharded format should migrate all three.

## Follow-ups from Ad refresh and sync frames / Slow ad refresh / Stop ad redirects

- **firstcoastnews.com run B:** run A (both switches off, 10-26-2026) is JS heap 162 MB → 207 MB in 5 minutes, about 0.7 requests a second, 34 iframes with 29 hidden. Run B (switches on) still has to happen in Chris's own Chrome, because the site's Akamai protection returns 403 to Playwright. The Variety numbers below already show the switches work, so this is a second data point, not a blocker.
- **Default on?** On Variety (10-27-2026, Playwright, per-process PSS) the three switches took the tab from 3,199 MB in 76 renderer processes to 1,049 MB in 12 at 20 s, and from 2,164 MB to 921 MB at 2 minutes, with 4 banners showing instead of 3. Slow ad refresh cut 150 s of the page's own refreshing from 10 ad requests to 2. Worth considering default-on for Ad refresh and sync frames after a few weeks of daily use without breakage.
- **Stop ad redirects, live:** fixture-tested only. In a plain Chrome the Variety scam redirect showed up 2 of 2 times, then not at all on the loads made with the guard injected, because the ads rotate. Check a real hijack gets stopped next time one shows up (the console says "Subtle stopped a redirect to …").
- **Sync patterns still miss:** `33across.com/match?`, `ssp.cadent.com/um?`, `cm.adform.net/cookie?`, `ap.lijit.com/beacon/…`, `static.cdn.monetixads.com/cookie.html`, `cs.seedtag.com/cs.html`. Bare `/match`, `/um`, `/cm` and `/cookie` are too common in ordinary URLs to add as patterns; add them by name if they show up as heavy.
- **Slow ad refresh marker is hidden on some sites:** SHE Media's `blogherads` wraps `refresh()` on top of ours, so `refresh.subtleThrottled` reads false even though the throttle still works. Don't use the marker to check whether it's active.
- **`imprchmp.taboola.com/st` stays out of the sync list:** it carries creative and impression IDs, so it counts paid impressions rather than syncing IDs.
