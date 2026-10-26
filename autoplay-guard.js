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

// The site in the address bar, also from inside third-party ad frames
function topSite() {
  try {
    const origins = location.ancestorOrigins;
    const host = origins?.length
      ? new URL(origins[origins.length - 1]).hostname
      : location.hostname;
    return host.replace(/^www\./, "");
  } catch {
    return ""; // Hidden by the frame's referrer policy
  }
}

// Sites paused in the popup are left alone. The check is async, but it
// finishes long before a video has loaded enough to autoplay.
let siteIsPaused = false;
const site = topSite();
chrome.storage.local.get("pausedSites").then(({ pausedSites = [] }) => {
  siteIsPaused = pausedSites.some(
    (pausedSite) => site === pausedSite || site.endsWith(`.${pausedSite}`)
  );
});

function shouldPause(video) {
  if (siteIsPaused) return false;
  if (navigator.userActivation.isActive) return false; // Started by a click or key press
  return video.muted || video.volume === 0;
}

// A paused ad floating over the page (a corner player) is hidden too, so it
// doesn't leave an empty box on screen. Only a fixed box smaller than half
// the window counts, so page layouts and full-screen viewers are left alone.
const MAX_FLOAT_DEPTH = 10;
function hideFloatingPlayer(video) {
  const halfWindow = (window.innerWidth * window.innerHeight) / 2;
  let element = video;
  for (let depth = 0; element && element !== document.body && depth < MAX_FLOAT_DEPTH; depth++) {
    if (getComputedStyle(element).position === "fixed") {
      const { width, height } = element.getBoundingClientRect();
      if (width * height < halfWindow) {
        element.style.setProperty("display", "none", "important");
      }
      return;
    }
    element = element.parentElement;
  }
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
    if (pauses.length === 1) hideFloatingPlayer(video);
  },
  true // Media events don't bubble, so listen in the capture phase
);
