(async () => {
  await subtlePolicy.ready;
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
  const restored = new WeakSet();
  const saved = new WeakMap();
  const waiting = new Set();

  function restoreVideo(video) {
    const record = saved.get(video);
    if (!record) return;
    restored.add(video);
    waiting.delete(video);
    if (record.container) {
      if (record.display)
        record.container.style.setProperty(
          "display",
          record.display,
          record.priority,
        );
      else record.container.style.removeProperty("display");
    }
    if (unloaded.has(video)) {
      if (record.src !== null) video.setAttribute("src", record.src);
      for (const source of record.sources) video.append(source.cloneNode(true));
      video.load();
    }
    record.placeholder?.remove();
    video.controls = true;
    video.play().catch(() => {});
  }
  function remember(video, container, showButton = true) {
    let record = saved.get(video);
    if (!record) {
      record = {
        src: video.getAttribute("src"),
        sources: [...video.querySelectorAll("source")].map((s) =>
          s.cloneNode(true),
        ),
      };
      saved.set(video, record);
      waiting.add(video);
    }
    if (!container || record.placeholder || !showButton) return;
    record.container = container;
    record.display = container.style.getPropertyValue("display");
    record.priority = container.style.getPropertyPriority("display");
    const placeholder = document.createElement("subtle-paused-video");
    if (getComputedStyle(container).position === "fixed") {
      const rect = container.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left, innerWidth - 150));
      const top = Math.max(8, Math.min(rect.top, innerHeight - 44));
      placeholder.style.cssText = `position:fixed;left:${left}px;top:${top}px;z-index:2147483647;max-width:calc(100vw - 16px)`;
    }
    const root = placeholder.attachShadow({ mode: "closed" });
    const button = document.createElement("button");
    button.textContent = "Play this video";
    button.style.cssText =
      "font:13px/1.5 system-ui;padding:6px 10px;cursor:pointer";
    button.addEventListener("click", () => restoreVideo(video), { once: true });
    root.append(button);
    container.before(placeholder);
    record.placeholder = placeholder;
  }
  window.addEventListener("message", (event) => {
    if (
      event.source === parent &&
      event.data === "url-blocker:restore-autoplay"
    )
      for (const video of waiting) restoreVideo(video);
  });

  function shouldPause(video) {
    if (restored.has(video) || !subtlePolicy.enabled("autoplayGuard"))
      return false;
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
    for (
      let depth = 0;
      element && element !== document.body && depth < MAX_FLOAT_DEPTH;
      depth++
    ) {
      if (getComputedStyle(element).position === "fixed") {
        const { width, height } = element.getBoundingClientRect();
        if (width * height < halfWindow) {
          remember(video, element);
          element.style.setProperty("display", "none", "important");
        }
        return;
      }
      element = element.parentElement;
    }
  }

  // Unloading doesn't fire a "pause" event, so players that restart on pause stop retrying
  function unload(video) {
    remember(video, video, window.top === window);
    // An ad frame left with nothing to play has its box hidden by frame-collapse.js
    if (!unloaded.has(video) && window.top !== window) {
      parent.postMessage("url-blocker:collapse-frame", "*");
    }
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
        (time) => now - time < RESTART_WINDOW_MS,
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
    true, // Media events don't bubble, so listen in the capture phase
  );
})();
