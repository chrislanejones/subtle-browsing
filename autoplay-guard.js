(async () => {
  await subtlePolicy.ready;
  // Pauses videos without a play gesture. An unrelated click can give an ad
  // permission to start with sound too. A video the user starts runs normally.
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

  // Any click or key press gives the page user activation for a few seconds,
  // so reading with PageDown would let a player that autoplays as it scrolls
  // into view through (Investopedia's JW Player does this). A play only counts
  // as the user's when a trusted play gesture was on the player itself or a
  // labeled play control. Synthetic clicks and reading keys don't count.
  const CLICK_WINDOW_MS = 1000;
  const PLAYER_DEPTH = 4;
  let lastGesture = null;
  function controlLabel(control) {
    const labelledBy = control.getAttribute("aria-labelledby")?.split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
    return labelledBy || control.getAttribute("aria-label") || control.title || control.value || control.textContent;
  }
  for (const type of ["pointerdown", "click", "keydown"])
    document.addEventListener(
      type,
      (event) => {
        if (!event.isTrusted) return;
        if (
          (event.type === "keydown" &&
            ![" ", "Enter", "k", "K", "MediaPlayPause"].includes(event.key)) ||
          (event.type !== "keydown" && event.button !== 0)
        ) {
          lastGesture = null;
          return;
        }
        const target = event.composedPath()[0];
        const control = target instanceof Element
          ? target.closest("button, [role='button'], input[type='button'], input[type='submit'], a")
          : null;
        lastGesture = {
          target,
          // Players can replace their icon and its label in the click handler.
          controls: control?.getAttribute("aria-controls"),
          playControl: control ? /^(play|watch|resume|start)(\b|\s)/i.test(controlLabel(control).trim()) : false,
          time: performance.now(),
        };
      },
      true,
    );

  // The video or one of its close ancestors, stopping before page-layout boxes
  function onPlayer(target, video) {
    if (!(target instanceof Node)) return false;
    const { width, height } = video.getBoundingClientRect();
    const maxArea = Math.max(
      (window.innerWidth * window.innerHeight) / 2,
      2 * width * height,
    );
    let element = video;
    for (
      let depth = 0;
      element && element !== document.body && depth <= PLAYER_DEPTH;
      depth++
    ) {
      if (element.matches("article, main, section, aside, nav")) return false;
      const box = element.getBoundingClientRect();
      if (depth > 0 && box.width * box.height > maxArea) return false;
      if (element.contains(target)) return true;
      element = element.parentElement;
    }
    return false;
  }

  function startedByUser(video) {
    if (!navigator.userActivation.isActive || !lastGesture) return false;
    if (onPlayer(lastGesture.target, video)) return true;
    if (performance.now() - lastGesture.time >= CLICK_WINDOW_MS) return false;
    const { controls, playControl } = lastGesture;
    if (controls)
      return controls.split(/\s+/).some((id) => document.getElementById(id)?.contains(video));
    return playControl;
  }

  function shouldPause(video) {
    if (restored.has(video) || !subtlePolicy.enabled("autoplayGuard"))
      return false;
    if (startedByUser(video)) return false;
    return true;
  }

  // A paused video floating over the page (a corner player) shouldn't leave a
  // box on screen. A site's own player floats out of its spot in the article
  // (Investopedia's does), so it goes back there, paused. A player attached
  // straight to the page body has no spot, so it's hidden. Only a fixed box
  // smaller than half the window counts, so page layouts and full-screen
  // viewers are left alone.
  const MAX_FLOAT_DEPTH = 10;
  const docked = new WeakMap();
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
        if (width * height >= halfWindow) return;
        // An empty wrapper around a floating ad has no height, so it isn't a home
        const home = element.parentElement;
        if (
          home &&
          home !== document.body &&
          home !== document.documentElement &&
          home.getBoundingClientRect().height > 0
        ) {
          dock(video, element);
        } else {
          remember(video, element);
          element.style.setProperty("display", "none", "important");
        }
        return;
      }
      element = element.parentElement;
    }
  }

  function dock(video, element) {
    docked.set(video, {
      element,
      value: element.style.getPropertyValue("position"),
      priority: element.style.getPropertyPriority("position"),
    });
    element.style.setProperty("position", "static", "important");
  }

  // A player the user starts is free to float again
  function undock(video) {
    const record = docked.get(video);
    if (!record) return;
    docked.delete(video);
    if (record.value)
      record.element.style.setProperty("position", record.value, record.priority);
    else record.element.style.removeProperty("position");
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
      if (!(video instanceof HTMLVideoElement)) return;
      if (!shouldPause(video)) {
        undock(video);
        return;
      }

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
