# ADR-021: Ad refresh and sync frames are an opt-in list
Date: 2026-10-26   Status: draft

## Context
A firstcoastnews.com (TEGNA) article tab reached 1.2-1.3 GB in Chrome Task
Manager. Main-frame JS heap went from 200 MB at 8 s to 290 MB at about 5 min
(about 18 MB/min) with the DOM flat near 1,600 nodes, about 1 request/s, a
Prebid auction about every 30 s, and 33 iframes: 5 visible ads plus 28 hidden
0x0 frames, mostly cookie/user sync. Browsi (cdn.browsiprod.com), which
refreshes and injects ad slots, was loaded. Chrome's heavy-ad intervention and
our heavy-ad guard (ADR-009, ADR-016) judge each frame alone, so a slot that
refreshes every 30 s never trips them, and extensions cannot read per-frame
memory.

## Decision
Add a static DNR ruleset `ad_churn` (rules/ad-churn.json), setting
`adChurnRules`, labeled "Ad refresh and sync frames", off by default, with the
existing global and per-site Default/On/Off controls. Rule 1 blocks
`||browsiprod.com^` for script, sub_frame, xmlhttprequest, image, ping and
other. Rules 2-16 block 15 cookie-sync frame URLs copied from the live page,
sub_frame only. imprchmp.taboola.com and i.liadm.com were seen but left out
because their purpose is unclear.

## Consequences
+ Banners still load: the same companies' scripts and bids are untouched; only
  hidden sync frames and Browsi are stopped.
+ On Browsi sites, Browsi-placed extra slots and its refresh stop.
- The memory gain is not measured. An automated A/B hit the site's Akamai bot
  protection (403) and we chose not to evade it; a manual off/on A/B in Chrome
  is pending. That is why the switch is off by default.
- Sync paths can change and need upkeep.
- Publishers lose some ID-match revenue.

## Alternatives rejected
User block-list entries: synced, whole-host, and would block scripts and bids too.
Throttle googletag.pubads().refresh() from a main-world script: more invasive,
runs on every GPT site, and publishers may detect it; kept as a possible later step.
Built later as an opt-in switch; see ADR-022.
Import EasyList/AdGuard privacy lists: ruled out by ADR-004 (licensing, scope).

## Pre-mortem
A sync host starts serving visible creatives at the same path, or Browsi
becomes the only slot loader on a site, and ads or page layout vanish. Watch
for per-site Off overrides on this switch and narrow or drop the rule involved.
