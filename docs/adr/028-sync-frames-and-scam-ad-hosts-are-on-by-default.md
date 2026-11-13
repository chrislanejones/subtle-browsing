# ADR-028: Ad refresh and sync frames, and a new Scam ad sites list, are on by default
Date: 2026-11-13   Status: draft (unreleased; amends ADR-021, relates to ADR-004 and ADR-019)

## Context
ADR-021 shipped `ad_churn` off because its memory gain was unmeasured. On
Variety (10-27-2026, Playwright, per-process PSS) the three refresh and sync
switches took a tab from 3,199 MB in 76 renderer processes to 1,049 MB in 12
at 20 s (PARKING_LOT "Default on?"). Separately, the 16 scam hosts seen on
movy.sx and therarbg.com (fake ad-blocker offers, scam redirects) sat in
`annoyances.json`, which is off and labeled Newsletter offers, so a new
install got no protection from them.

## Decision
- `ad_churn` is `enabled: true` in the manifest and `adChurnRules: true` in
  `DEFAULTS` (settings.js, page-policy.js).
- New static ruleset `scam_ads` (`rules/scam-ads.json`), setting `scamAds`,
  label "Scam ad sites", on by default, with the usual global and per-site
  controls. It holds rules 19-34 moved out of `annoyances.json` with their
  original IDs. `annoyances.json` keeps rules 1-18 and 35.
- Rule 35 (`||chaturbate.com/*campaign=`) stays in annoyances on purpose: it
  isn't a scam host, and whether it belongs in a default list is a
  store-review question for Chris.

## Consequences
+ New installs get the sync-frame and scam-host blocking without finding a
  switch; scam hosts no longer depend on the newsletter preference.
+ Same IDs means no history or rule-number churn inside the moved rules.
- Upgrades split: any saved settings object already holds
  `adChurnRules: false` (the settings mutation writes the full normalized
  object), so only new or never-saved installs get ad_churn on. `scamAds` is a
  new key, so every install, old or new, gets it on.
- A per-site Newsletter offers override no longer covers rules 19-34, and
  older history logs these hosts as `annoyances`, newer as `scam_ads`.
- One measured site (Variety). The firstcoastnews run B from ADR-021 is still
  pending, and PARKING_LOT's "a few weeks of daily use" bar was set 10-27-2026,
  17 days before this change.

## Alternatives rejected
Flip `annoyanceRules` on by default: turns on newsletter blocking nobody asked for.
Migrate saved `adChurnRules: false` to true: the stored value can't tell an
untouched default from a deliberate Off, so this would flip real choices.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: a sync
host in `ad-churn.json` starts serving something a site needs (a login
iframe, a consent frame), and because it is now default-on, many users see a
broken page with no idea a switch exists. ADR-021's caution was right; one
site's PSS numbers weren't enough.
Early warning sign to watch for: per-site Off overrides for Ad refresh and
sync frames, or site reports naming a sync host, in the first weeks after
release.
