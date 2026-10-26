# ADR-013: A settings page holds the lists, and the popup shows counts
Date: 2026-10-26   Status: draft (shipped in 1.5.0, `6b498fa`)

## Context
Chrome caps an extension popup at 600 px tall. With the site row and 5
blocked URLs the 1.4.0 popup was about 720 px, so the bottom of the
list scrolled (PARKING_LOT). There was also nowhere to search a long
list, see paused sites, change the shortcut, or make a backup.

## Decision
A full-tab settings page (`options.html`, `options_ui` with
`open_in_tab`) holds the four switches, the block list with search and
Remove, paused sites with Unpause, the keyboard shortcut with a Change
button (opens `chrome://extensions/shortcuts`), and backup export and
import. The popup swaps its URL list for one row, "Blocked URLs and
paused sites", that shows counts and opens the page. Shared styles move
out of `popup.html` into `ui.css`, used by both pages. The popup now
measures 531 px.

## Consequences
+ The popup fits under the cap with room to spare.
+ The full list is searchable, and paused sites can be unpaused without
  visiting the site.
- Removing a URL takes one more click: popup, then settings page.
- The four switches now exist in two places that must stay in step.

## Alternatives rejected
Not recorded beyond the PARKING_LOT note that started it.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: a
new popup feature pushes it back past 600 px, because the cap is only
checked by hand, or the two copies of the switches drift and one page
shows a switch the other doesn't.
Early warning sign to watch for: the popup's measured height passing
about 580 px, or a switch added to one page's HTML but not the other.

## 1.6.0 follow-up
1.6.0 adds per-site controls to the popup and DevTools, plus saved hidden elements and site overrides in settings and DevTools. See [ADR-017](017-site-protections-use-tab-session-rules.md).
