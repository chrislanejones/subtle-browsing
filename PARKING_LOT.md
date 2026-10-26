# Parking Lot

- **Why not AdGuard's annoyance lists:** `@adguard/dnr-rulesets` is GPL-3.0-only, and this repo is MIT, so bundling it would relicense the project. Most of its annoyance filters are also element-hiding (CSS) rules, which Chrome's blocking rules can't apply. `rules/annoyances.json` is a small hand-made list instead. Cookie banners are left out on purpose: blocking a consent tool can leave the page scroll-locked.
- **In-page ad boxes:** the autoplay stopper only hides paused ads that float (`position: fixed`). An in-article ad player that's paused or blocked can still leave an empty box.
- **Blocked-today badge can lag at midnight:** the count resets on the first block after midnight, so yesterday's number can show until then. A `chrome.alarms` timer would fix it, at the cost of one more permission.
- **Video list coverage:** `rules/video-ads.json` was checked against PCWorld only. Vendors seen there but left alone because they also serve banners: Minute Media, JW Player (also plays the site's own videos). `fwmrm.net` (FreeWheel) is left out because TV-network sites use it for their real shows.
- **Google IMA left unblocked:** `imasdk.googleapis.com` (the video-ad SDK inside JW Player and others) was taken out of the list because blocking it can leave a site's own player spinning. The autoplay stopper still pauses those ads. A stub script like uBlock Origin's would let it be blocked safely.
- **Unloaded videos stay unloaded:** a video unloaded for restarting itself 3 times in 2 seconds can't be played later, even by clicking. Fine for ads; if a real video ever trips it, save the source and restore it on click.
- **Picker only looks inside the clicked element:** clicking an ad image doesn't list the link wrapped around it. Consider walking up to the nearest `<a>` or ad container too.
- **Install warning:** `host_permissions: <all_urls>` shows "read and change all your data" at install. Switching to `activeTab` would drop it for the popup and right-click paths, but the DevTools panel would lose the picker.
- **Log needs an unpacked install:** `onRuleMatchedDebug` only fires for unpacked extensions, so the DevTools log stays empty for a Web Store install.
- **Unbuilt panel sections:** Settings, Statistics and Advanced in the DevTools sidebar show "isn't built yet."
- **README cleanup:** the Acknowledgements section still says `Icon design by [YOUR NAME]`, and the License section points to a LICENSE file that doesn't exist.
