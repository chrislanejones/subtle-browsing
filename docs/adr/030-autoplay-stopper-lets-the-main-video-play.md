# ADR-030: The autoplay stopper lets a page's main video play, and a paused video can allow its site
Date: 2026-11-13   Status: draft (unreleased; amends ADR-005)

## Context
Under ADR-005's 1.8.1 gesture rules, a watch page (YouTube- or Twitch-style
player) that starts its video on load gets it paused, and each fix has been
another hand-kept entry in the autoplay compatibility list (three of the last
five commits: free streaming, social video, X video and GIFs). That list
can't keep up with every site whose whole point is one video.

## Decision
- `mainVideo()` in `autoplay-guard.js` exempts a video when all hold: top
  frame only; at least 60% of window width and 50% of window height; not
  inside `<article>`; no `position: fixed` box within 10 ancestors; source is
  `blob:` or the same site as the page; largest video on the page.
- The "Play this video" stand-in gets an **Always allow video here** button.
  Only a trusted click counts. It sends `allowSiteVideo`; `background.js`
  takes the site from `sender.tab.url` (never from the page) and writes the
  site control `autoplayGuard = false` for that top-level site and its
  subdomains, so it shows in settings and can be undone there.
- Covered by `tests/site/main-video.html` (`?article`, `?third` variants).

## Consequences
+ Watch pages work without adding them to a list.
+ Users fix a stubborn site in one click, through the existing site-control
  path rather than a new storage shape.
- Known risk: a site's own big hero autoplay player outside `<article>` now
  plays, more often on narrow windows where 60% / 50% is easy to reach.
- "Always allow" is the whole site: every autoplay on it plays, ads included,
  until the control is removed in settings.

## Alternatives rejected
Keep growing the compatibility list: whack-a-mole, and every miss is a
broken video until the next release.
Let the page name its own site for the allow: a page in a frame or a
hostile script could allow a site it isn't on.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: news and
publisher sites serve their ad-led video from their own domain or a `blob:`
URL in a big player outside `<article>`, and the main-video test lets exactly
the autoplay ADR-005 was built to stop play again.
Early warning sign to watch for: a report of a muted video ad playing on a
publisher home or section page with the switch on.
