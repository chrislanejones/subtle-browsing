// Hides the box of a child frame that unloaded itself (a heavy ad, or a video
// ad that kept restarting), so it doesn't leave a blank rectangle behind.
// The child posts COLLAPSE_MESSAGE to this frame just before unloading. Only
// the frame the message came from is hidden, so a frame can only hide itself.
// background.js registers this in every frame while the autoplay stopper or
// heavy ad removal is on.
window.addEventListener("message", (event) => {
  if (event.data !== "url-blocker:collapse-frame" || !event.source) return;
  for (const frame of document.querySelectorAll("iframe, frame")) {
    if (frame.contentWindow === event.source) {
      frame.style.setProperty("display", "none", "important");
      return;
    }
  }
});
