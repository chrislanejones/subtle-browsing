# Parking Lot

- **Annoyances toggle:** an optional popup switch for AdGuard Annoyances (pop-ups, newsletter overlays) via `@adguard/dnr-rulesets`.
- **Video list coverage:** `rules/video-ads.json` was checked against PCWorld only. Vendors seen there but left alone because they also serve banners: Minute Media, JW Player (also plays the site's own videos). `fwmrm.net` (FreeWheel) is left out because TV-network sites use it for their real shows.
- **Google IMA left unblocked:** `imasdk.googleapis.com` (the video-ad SDK inside JW Player and others) was taken out of the list because blocking it can leave a site's own player spinning. The autoplay stopper still pauses those ads. A stub script like uBlock Origin's would let it be blocked safely.
- **Unloaded videos stay unloaded:** a video unloaded for restarting itself 3 times in 2 seconds can't be played later, even by clicking. Fine for ads; if a real video ever trips it, save the source and restore it on click.
- **Paused ad still takes space:** the autoplay stopper pauses ad videos but doesn't hide the sticky player box.
- **Picker offers full URLs only:** a picked ad URL is stored with its query string (`?id=123&cb=987`), which usually changes on the next page load. Offer "block this domain" next to each URL in the dialog.
- **Picker only looks inside the clicked element:** clicking an ad image doesn't list the link wrapped around it. Consider walking up to the nearest `<a>` or ad container too.
- **Install warning:** `host_permissions: <all_urls>` shows "read and change all your data" at install. Switching to `activeTab` would drop it for the popup and right-click paths, but the DevTools panel would lose the picker.
- **Log needs an unpacked install:** `onRuleMatchedDebug` only fires for unpacked extensions, so the DevTools log stays empty for a Web Store install.
- **Unbuilt panel sections:** Settings, Statistics and Advanced in the DevTools sidebar show "isn't built yet."
- **README cleanup:** the Acknowledgements section still says `Icon design by [YOUR NAME]`, and the License section points to a LICENSE file that doesn't exist.
