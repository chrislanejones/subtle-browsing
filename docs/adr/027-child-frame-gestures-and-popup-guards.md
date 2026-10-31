# ADR-027: Child-frame gestures and popup guards

Date: 2026-10-31. Status: draft (implemented in 1.9.0).

Each frame owns its `window.open` and anchor prototypes, so popup interception
must run in every frame. Top-page navigation checks stay top-only; embedded
sign-in and media documents may navigate themselves while loading. Site policy
still inherits the top-level site's switches and exceptions.

A trusted labeled Play control in an iframe can start a video owned by a parent.
Isolated scripts register a short-lived ticket with the extension worker. The
parent identifies the sending frame by its window, verifies the ticket's tab,
document separation, origin, kind and age, then associates it with a nearby
player or the iframe's explicit `aria-controls`. Tickets are consumed once;
verified ancestors receive replacement tickets for nested controls. A paused
video can resume if its play event beat the asynchronous verification. Ordinary
frame clicks and arbitrary page messages never create tickets. Restore buttons
use the same mechanism in the opposite direction.

`document.open()` clears DOM listeners while keeping the extension world alive.
Root-only observers reinstall those listeners after a document replacement.
The MAIN guard requests policy again, avoiding ordering dependence between the
MAIN and isolated observers. No subtree observation or periodic polling is used.

This remains a nuisance filter. Shared page-world hooks can be replaced, and a
site can repurpose a real labeled control. Completely unlabeled controls and
remote controls unrelated to the player's container require a site exception.
