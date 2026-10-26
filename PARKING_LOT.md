# Parking Lot

- **Build the ad lists from the README:** (1) a built-in blocklist of outstream video-ad vendors (Connatix, Primis, AnyClip, EX.CO, Teads, Aniview, Vidazoo), (2) a content script that pauses or removes video that autoplays before the user interacts, (3) an optional popup toggle for AdGuard Annoyances via `@adguard/dnr-rulesets`.
- **Picker offers full URLs only:** a picked ad URL is stored with its query string (`?id=123&cb=987`), which usually changes on the next page load. Offer "block this domain" next to each URL in the dialog.
- **Picker only looks inside the clicked element:** clicking an ad image doesn't list the link wrapped around it. Consider walking up to the nearest `<a>` or ad container too.
- **Install warning:** `host_permissions: <all_urls>` shows "read and change all your data" at install. Switching to `activeTab` would drop it for the popup and right-click paths, but the DevTools panel would lose the picker.
- **Log needs an unpacked install:** `onRuleMatchedDebug` only fires for unpacked extensions, so the DevTools log stays empty for a Web Store install.
- **Unbuilt panel sections:** Settings, Statistics and Advanced in the DevTools sidebar show "isn't built yet."
- **README cleanup:** the Acknowledgements section still says `Icon design by [YOUR NAME]`, and the License section points to a LICENSE file that doesn't exist.
