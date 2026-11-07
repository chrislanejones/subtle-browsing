# Chrome Web Store listing

Copy-paste text for the developer dashboard
(https://chrome.google.com/webstore/devconsole). Zip: `pnpm run package`
builds `dist/url-blocker-<version>.zip` from the last commit.

## Review notes, 11-07-2026

The registration payment creates a developer account; it does not purchase
approval. Each submission is reviewed against the current policies.
[Registration](https://developer.chrome.com/docs/webstore/register),
[program policies](https://developer.chrome.com/docs/webstore/program-policies/policies).

If $5 is the intended sale price rather than the registration payment, the
listing below currently says Free. Paid basic functionality must be disclosed
before installation, with clear sale/refund terms and the developer identified
as the seller. Update those fields when a paid offering actually exists.
[Accepting payment](https://developer.chrome.com/docs/webstore/program-policies/accepting-payment).

The package and description below refer to 1.9.0. Current unreleased source adds
adult-site age-overlay removal and torrent-site popup protection. Do not submit
that source using an unchanged 1.9.0 description or screenshots.

The adult integration increases review risk: Google's rejection guidance covers
extensions primarily designed to enhance pornographic sites and requires the
Mature content flag for adult-site integrations. The recommendation is to omit
the age-gate functionality from a future Store build, retaining it only in the
local build if desired. This is a risk assessment, not a Google review decision
or a guarantee that another build will pass. Hiding a switch or changing its
label does not remove its functionality from review.
[Adult-content review guidance](https://developer.chrome.com/docs/webstore/troubleshooting#pornography).

Keep torrent protection described as intrusive-ad blocking: it blocks ad scripts
and unwanted popups and does not implement torrent downloading or alter site
access credentials. The Store prohibits facilitating unauthorized access and
copyrighted downloads; do not market the extension as doing either.
[Malicious and prohibited products](https://developer.chrome.com/docs/webstore/program-policies/policies#malicious_and_prohibited_products).

The privacy disclosures must cover local processing as well as transmission.
The extension handles page content and resource URLs on-device, saves blocking
activity where Chrome exposes it, and uses Chrome sync for user settings.
There is no developer collection endpoint. Select the applicable website-content
and browsing-history disclosures for the final package; do not claim that no
user data is handled merely because nothing is sent to the developer.
[Local-data disclosure FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

## Package

| Field | Value |
| --- | --- |
| Upload | `dist/url-blocker-1.9.0.zip` |
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

Rebuild the tiles with `node scripts/generate-promo-tiles.js`. They put the
shield on the same white tile as the icon so it stands out on the dark card.

Rebuild the screenshots with `node scripts/generate-store-screenshots.js`.
They use a fresh profile with illustrative rules, not personal browser data.

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
Every size puts the shield on a white rounded tile, because the dark teal
disappeared on dark toolbars.

The source is `docs/store/branding/shield/master.png`, and its prompt is in
`docs/store/branding/shield/prompt.txt`. Run `pnpm run icons` (needs
ImageMagick 7) to rebuild the exports. `docs/store/branding/options.html`
compares it with the two runner-up options.

### Description

```text
URL Blocker goes after the ads people actually hate and leaves normal banner ads alone.

What it stops, out of the box:
• Video ads from the companies that serve them (Connatix, Primis, AnyClip, Teads, Celtra and others). Google's video ad engine gets a stand-in that says "no ads," so the page keeps working.
• Unwanted autoplay videos, muted or audible. Reading keys and unrelated clicks do not count as pressing Play. Videos you start play normally.
• Pinned top-of-page ad banners scroll away as you read.
• Heavy ads. An ad that downloads more than 4 MB or keeps your CPU busy gets unloaded, with a Restore button if you wanted it back.

Switches you can turn on:
• Newsletter sign-up overlays
• Website push-notification prompts
• Ad refresh and the hidden cookie-sync frames ad auctions open
• Slow ad refresh: each Google ad slot refreshes at most every 2 minutes
• Stop ad redirects: blocks unwanted redirects and popunders in pages and child frames triggered by article clicks or media controls

Your own blocks:
• Block a URL by domain, by one exact address, or with an advanced pattern, with a preview of what it will catch
• Click an ad on the page to see what's inside it and block where it came from (Alt+Shift+K, or right-click → Block ad element)
• Undo right after you block something

When a site breaks:
• Turn blocking off on one site, everywhere, or for 10 minutes. Alt+Shift+O flips the site you're on.
• Site controls override any switch for one site and its subdomains.

Page content and request URLs are processed on your device to apply your blocking choices. Your block list, paused sites and switches can sync through Chrome. The developer receives none of this data, and there's no account to make. Local activity is saved where Chrome supports blocking feedback; Store installs show unavailable statistics. See the privacy policy for retention and Incognito behavior.

Free and open source (MIT): https://github.com/chrislanejones/subtle-browsing
```

## Privacy practices

| Field | Value |
| --- | --- |
| Single purpose | Blocks intrusive ads (video ads, unwanted autoplay, heavy ads, ad redirects) and URLs the user chooses, while leaving ordinary banner ads alone. |
| Remote code | No. Every script ships in the package, including the Google IMA stand-in. |
| Data usage | Disclose on-device website-content and browsing-history handling for blocking/picking and any available activity display. Saved rules/settings use Chrome sync. No data is sent to the developer, sold, used for unrelated purposes or used for creditworthiness decisions. Match the final package to the dashboard disclosures; local-only processing still counts. |
| Privacy policy URL | https://github.com/chrislanejones/subtle-browsing#privacy |

### Permission justifications

| Permission | Justification |
| --- | --- |
| `unlimitedStorage` | Keeps 90 days of blocking history in local IndexedDB without storage eviction or quota pressure. History never syncs or leaves the device. |
| `storage` | Saves the user's block list, switches, paused sites, site overrides and hidden elements, plus a local log and daily counts that never leave the computer. |
| `declarativeNetRequest` | The blocking itself: the built-in ad lists, the user's own URL blocks, the rule that turns blocking off for a paused site, and the swap of Google's video ad engine for a local stand-in. |
| `declarativeNetRequestFeedback` | Reads which rule blocked a request, for the blocked-today count, the activity charts and the DevTools log. Chrome only sends this to unpacked installs, so store installs show these as unavailable. |
| `scripting` | Loads the element picker, autoplay and heavy-ad checks, page styling, and enabled popup/refresh protections into pages and frames. |
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
