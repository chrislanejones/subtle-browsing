# ADR-002: The element picker is injected on demand, not loaded in every tab
Date: 2026-10-25   Backfilled: 2026-10-26   Status: draft (shipped in 1.1.0, `89118c3`)

## Context
In 1.0.0 the manifest listed `content.js` (340 lines) as a static
content script on `<all_urls>` at `document_idle`, so every tab carried
the picker whether it was used or not. Its Block button also failed
("Failed to block URL") because the background never answered
`blockUrl`.

## Decision
No `content_scripts` in the manifest. `background.js` `sendToTab()` runs
`scripting.executeScript({ files: ["content.js"] })`, then sends the
message. The popup, the DevTools panel and the right-click menu all go
through it. `content.js` sets `globalThis.urlBlockerPickerLoaded` and
returns early if it's already set, so repeat injections keep one copy.
The picker removes its UI (a closed shadow root) when done.

## Consequences
+ Tabs that never open the picker carry none of it.
+ One entry point for three triggers.
- Needs `scripting` plus host access to every site (`<all_urls>`), which
  keeps the "read and change all your data" install warning.
- Only the UI leaves: the message listener and guard flag stay in the
  page until it reloads.
- Can't run on `chrome://` pages or the Web Store; the right-click path
  just logs a warning there.

## Alternatives rejected
Static content script (1.0.0): loaded into every tab. `activeTab`
instead of `<all_urls>` (PARKING_LOT): drops the install warning for the
popup and right-click paths, but the DevTools panel would lose the
picker.

## Pre-mortem
It is six months later and this was a mistake. Most likely reason: the
leftover listener and flag mean a second injection talks to an old copy
after an extension update, and the picker silently does nothing until
the page reloads.
Early warning sign to watch for: "picker won't start" reports right
after an update, fixed by a page reload.
