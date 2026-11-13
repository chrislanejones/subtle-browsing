# ADR-031: `unlimitedStorage` and `webRequest` stay in the manifest
Date: 2026-11-13   Status: draft (considered and rejected; no code change)

## Context
Ahead of a store listing, dropping `unlimitedStorage` and `webRequest` came
up as a way to make the permission list look less alarming. Chrome's
permissions list (checked 11-13-2026) shows no install warning for either
one. The warnings that list does show for this manifest come from the
`<all_urls>` host permission, `declarativeNetRequest` ("Block content on any
page") and `declarativeNetRequestFeedback` ("Read your browsing history");
whether Chrome folds the last two into the `<all_urls>` warning isn't
documented and hasn't been checked on a real install. (Answered
11-13-2026; see Update.)

## Decision
Keep both. `unlimitedStorage` protects the 90-day IndexedDB history from
quota pressure and eviction (ADR-026). `webRequest` feeds
`chrome.webRequest.onHeadersReceived` in `background.js`, which sums each
ad frame's bytes for the default-on 4 MB heavy-ad check
(`HEAVY_AD_BYTES`, ADR-009, ADR-016).

## Consequences
+ History survives storage pressure, and the heavy-ad check keeps working.
+ Settled, so it doesn't get re-argued before every store submission.
- The manifest still lists two permissions a careful reader may question;
  the listing has to explain them in words.
- The install warning users see is unchanged either way: it's the single
  `<all_urls>` warning, and no permission trim can shrink it short of
  giving up `<all_urls>` itself.

## Alternatives rejected
Drop `unlimitedStorage`: no warning removed, and Chrome may evict the history
under pressure.
Drop `webRequest`: no warning removed, and the 4 MB check loses its only
byte count.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: Chrome
Web Store review flags `webRequest` alongside `<all_urls>` as broad access
and asks for justification or rejects the build, a cost the "no install
warning" argument didn't account for.
Early warning sign to watch for: a store review note or rejection that names
`webRequest` or `unlimitedStorage`.

## Update 11-13-2026
Chromium source answers the open question in Context:
`chrome/common/extensions/permissions/chrome_permission_message_rules.cc`
(main, checked 11-13-2026). The `IDS_EXTENSION_PROMPT_WARNING_ALL_HOSTS` rule
for `APIPermissionID::kHostsAll` lists `kDeclarativeNetRequest` and
`kDeclarativeNetRequestFeedback` among the permissions it suppresses. So this
manifest's only install warning is "Read and change all your data on all
websites," and dropping `declarativeNetRequestFeedback` would remove no
warning. Decision unchanged.
