// Pauses muted videos that start playing before the user has clicked or
// pressed a key. Video ads almost always start muted, because Chrome won't
// autoplay sound. A video the user starts runs normally.
// background.js registers this in every frame while the setting is on.

// Some ad players call play() again the moment they're paused. Pausing them
// forever would be a busy loop, so a video that restarts itself this often
// gets its media unloaded instead, and further restarts have nothing to play.
const RESTART_LIMIT = 3;
const RESTART_WINDOW_MS = 2000;
const recentPauses = new WeakMap();
const unloaded = new WeakSet();

function shouldPause(video) {
  if (navigator.userActivation.isActive) return false; // Started by a click or key press
  return video.muted || video.volume === 0;
}

// Unloading doesn't fire a "pause" event, so players that restart on pause stop retrying
function unload(video) {
  unloaded.add(video);
  video.removeAttribute("src");
  video.querySelectorAll("source").forEach((source) => source.remove());
  video.load();
}

document.addEventListener(
  "play",
  (event) => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement) || !shouldPause(video)) return;

    if (unloaded.has(video)) {
      // The player loaded a new ad into the same element
      if (video.currentSrc) unload(video);
      return;
    }

    const now = performance.now();
    const pauses = (recentPauses.get(video) ?? []).filter(
      (time) => now - time < RESTART_WINDOW_MS
    );
    pauses.push(now);
    recentPauses.set(video, pauses);

    if (pauses.length > RESTART_LIMIT) {
      unload(video);
    } else {
      video.pause();
    }
  },
  true // Media events don't bubble, so listen in the capture phase
);
