// Pauses muted videos that start playing before the user has clicked or
// pressed a key. Video ads almost always start muted, because Chrome won't
// autoplay sound. A video the user starts runs normally.
// background.js registers this in every frame while the setting is on.
document.addEventListener(
  "play",
  (event) => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement)) return;
    if (navigator.userActivation.isActive) return; // Started by a click or key press
    if (!video.muted && video.volume > 0) return;
    video.pause();
  },
  true // Media events don't bubble, so listen in the capture phase
);
