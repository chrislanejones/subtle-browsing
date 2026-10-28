# Chrome Web Store listing

Copy-paste text for the developer dashboard
(https://chrome.google.com/webstore/devconsole). Zip: `pnpm run package`
builds `dist/url-blocker-<version>.zip` from the last commit.

## Package

| Field | Value |
| --- | --- |
| Upload | `dist/url-blocker-1.7.0.zip` |
| Short description | From `manifest.json`: "Stop intrusive video, newsletter prompts and heavy ads while keeping ordinary banners." |

## Store listing

| Field | Value |
| --- | --- |
| Category | Make Chrome Yours → Privacy & Security |
| Language | English (United States) |
| Store icon | `images/icon128.png` |
| Screenshots (1280×800) | `docs/store/screenshot-1-popup.png`, `docs/store/screenshot-2-settings.png` |
| Small promo tile (440×280) | `docs/store/promo-small-440x280.png` |
| Marquee promo tile (1400×560, optional) | `docs/store/promo-marquee-1400x560.png` |
| Homepage URL | https://github.com/chrislanejones/subtle-browsing |
| Support URL | https://github.com/chrislanejones/subtle-browsing/issues |

Rebuild the tiles with `node scripts/generate-promo-tiles.js`. They lighten the
shield so it stands out on the dark card.

The screenshots leave out the blocked-today count and the charts. Chrome
only reports blocked requests to unpacked installs, so store installs show
those as unavailable.

### Icon

The icon is **Quiet shield**: a teal shield with a white pause symbol, for
fewer interruptions and no unwanted autoplay. It's about calmer browsing, not
malware protection, so don't pitch it as a security guarantee. The store PNG
is a 128×128 transparent canvas with the artwork fitted inside 96×96, following
[Google's icon guidance](https://developer.chrome.com/docs/webstore/images#extension_icon).
The extension also includes 16, 32 and 48 pixel PNGs for smaller surfaces.

The source is `docs/store/branding/shield/master.png`, and its prompt is in
`docs/store/branding/shield/prompt.txt`. Run `pnpm run icons` (needs
ImageMagick 7) to rebuild the exports. `docs/store/branding/options.html`
compares it with the two runner-up options.

### Description

```text
URL Blocker goes after the ads people actually hate and leaves normal banner ads alone.

What it stops, out of the box:
• Video ads from the companies that serve them (Connatix, Primis, AnyClip, Teads, Celtra and others). Google's video ad engine gets a stand-in that says "no ads," so the page keeps working.
• Muted videos that start playing before you click anything. Videos you start play normally.
• Heavy ads. An ad that downloads more than 4 MB or keeps your CPU busy gets unloaded, with a Restore button if you wanted it back.

Switches you can turn on:
• Newsletter sign-up overlays
• Website push-notification prompts
• Ad refresh and the hidden cookie-sync frames ad auctions open
• Slow ad refresh: each Google ad slot refreshes at most every 2 minutes
• Stop ad redirects: an ad can't send the whole tab to another site without a click

Your own blocks:
• Block a URL by domain, by one exact address, or with an advanced pattern, with a preview of what it will catch
• Click an ad on the page to see what's inside it and block where it came from (Alt+Shift+K, or right-click → Block ad element)
• Undo right after you block something

When a site breaks:
• Turn blocking off on one site, everywhere, or for 10 minutes. Alt+Shift+O flips the site you're on.
• Site controls override any switch for one site and its subdomains.

Your block list, paused sites and switches sync through your Chrome sign-in. Nothing is sent anywhere else, and there's no account to make.

Free and open source (MIT): https://github.com/chrislanejones/subtle-browsing
```

## Privacy practices

| Field | Value |
| --- | --- |
| Single purpose | Blocks intrusive ads (video ads, muted autoplay, heavy ads, ad redirects) and URLs the user chooses, while leaving ordinary banner ads alone. |
| Remote code | No. Every script ships in the package, including the Google IMA stand-in. |
| Data usage | Collects nothing. Tick the three certifications (no selling, no unrelated use, no creditworthiness use). |
| Privacy policy URL | https://github.com/chrislanejones/subtle-browsing#privacy |

### Permission justifications

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's block list, switches, paused sites, site overrides and hidden elements, plus a local log and daily counts that never leave the computer. |
| `declarativeNetRequest` | The blocking itself: the built-in ad lists, the user's own URL blocks, the rule that turns blocking off for a paused site, and the swap of Google's video ad engine for a local stand-in. |
| `declarativeNetRequestFeedback` | Reads which rule blocked a request, for the blocked-today count, the activity charts and the DevTools log. Chrome only sends this to unpacked installs, so store installs show these as unavailable. |
| `scripting` | Loads the element picker, the autoplay stopper and the heavy-ad check into the page the user is on. |
| `webRequest` | Adds up how many bytes each ad frame downloads so ads over 4 MB can be unloaded. It only watches; it never blocks or changes a request. |
| `contextMenus` | The right-click "Block ad element" menu item. |
| `alarms` | Ends a ten-minute pause on time and clears the daily count at midnight. |
| Host permission `<all_urls>` | Ads show up on any site, so the autoplay stopper, the heavy-ad check and the picker have to be able to run on whatever page the user opens. Page content is never sent anywhere. |

## Distribution

| Field | Value |
| --- | --- |
| Visibility | Public |
| Regions | All regions |
| Price | Free |
