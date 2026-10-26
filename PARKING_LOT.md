# Parking Lot

- **No LICENSE file:** the README says MIT, but there's no `LICENSE`, so GitHub shows "no license". Adding one needs the copyright holder's name as Chris wants it shown.
- **GitHub repo description:** still "Yes, I am doing a Chrome Extention" with no topics. Suggested: `gh repo edit chrislanejones/subtle-browsing --description "Chrome extension that blocks video ads, muted autoplay, pop-ups and heavy ads, and leaves normal banner ads alone." --add-topic chrome-extension --add-topic manifest-v3 --add-topic ad-blocker`
- **Sync caps the block list at about 300 entries:** `chrome.storage.sync` allows 8 KB per item. Past that, adding shows an error. Splitting the list across several keys would lift it.
- **Paused in-page videos keep their box:** boxes collapse for unloaded ad frames and floating players, but a muted video paused on the page itself stays, so it can still be clicked to play.
- **IMA stand-in covers ima3.js only:** Google's DAI SDK (`ima3_dai.js`, used for live-stream ad insertion) isn't redirected.
- **Shortcut can be refused by Chrome:** Alt+Shift+B (bookmarks bar), Alt+Shift+X and Alt+Shift+P weren't assigned in testing; Alt+Shift+K was. If a Chrome version refuses K, the popup and settings page show "Not set" and it can be set at chrome://extensions/shortcuts.
- **Heavy ads and shared clicks:** Chrome shares "the user clicked" between frames from the same origin, so clicking one ad frame spares that ad company's other frames on the page from heavy-ad removal.
- **Heavy ad sizes come from Content-Length:** streamed or chunked responses without that header aren't counted, so some heavy ads slip under the 4 MB limit.
- **webRequest wakes the worker per request:** the download count listens to every response header. Cheap per event, but it keeps the service worker awake on busy pages even with the switch off, because the listener has to be added at startup.
- **Why not AdGuard's annoyance lists:** `@adguard/dnr-rulesets` is GPL-3.0-only, and this repo is MIT, so bundling it would relicense the project. Most of its annoyance filters are also element-hiding (CSS) rules, which Chrome's blocking rules can't apply. `rules/annoyances.json` is a small hand-made list instead. Cookie banners are left out on purpose: blocking a consent tool can leave the page scroll-locked.
- **Video list coverage:** `rules/video-ads.json` was checked against PCWorld only. Vendors seen there but left alone because they also serve banners: Minute Media, JW Player (also plays the site's own videos). `fwmrm.net` (FreeWheel) is left out because TV-network sites use it for their real shows.
- **Unloaded videos stay unloaded:** a video unloaded for restarting itself 3 times in 2 seconds can't be played later, even by clicking. Fine for ads; if a real video ever trips it, save the source and restore it on click.
- **Picker only looks inside the clicked element:** clicking an ad image doesn't list the link wrapped around it. Consider walking up to the nearest `<a>` or ad container too.
- **Install warning:** `host_permissions: <all_urls>` shows "read and change all your data" at install. Switching to `activeTab` would drop it for the popup and right-click paths, but the DevTools panel would lose the picker.
- **Log needs an unpacked install:** `onRuleMatchedDebug` only fires for unpacked extensions, so the DevTools log stays empty for a Web Store install.
- **README cleanup:** the Acknowledgements section still says `Icon design by [YOUR NAME]`, and the License section points to a LICENSE file that doesn't exist.
