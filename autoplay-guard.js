(() => {
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
  const counted = new WeakSet();

  // These dedicated streaming and social-video apps start the selected or
  // visible video as part of normal navigation. This also covers video-backed
  // GIFs. Pausing it makes the player retry until it loses its source, so keep
  // the exception explicit and limited.
  // `subtlePolicy.site` is the top-level site in child frames too.
  const AUTOPLAY_COMPATIBILITY_SITES = [
    "pluto.tv",
    "plex.tv",
    "tubitv.com",
    "xumo.com",
    "instagram.com",
    "tiktok.com",
    "x.com",
    "twitter.com",
  ];
  const autoplayCompatibilitySite = () =>
    AUTOPLAY_COMPATIBILITY_SITES.some(
      (domain) =>
        subtlePolicy.site === domain || subtlePolicy.site.endsWith(`.${domain}`),
    );

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
      const left = Math.max(8, Math.min(rect.left, innerWidth - 330));
      const top = Math.max(8, Math.min(rect.top, innerHeight - 44));
      placeholder.style.cssText = `position:fixed;left:${left}px;top:${top}px;z-index:2147483647;max-width:calc(100vw - 16px)`;
    }
    const root = placeholder.attachShadow({ mode: "closed" });
    const button = document.createElement("button");
    button.textContent = "Play this video";
    button.style.cssText =
      "font:13px/1.5 system-ui;padding:6px 10px;cursor:pointer";
    button.addEventListener("click", () => restoreVideo(video), { once: true });
    // Turns the autoplay stopper off for this site (and its subdomains) through
    // a site control, so the choice shows up and can be undone in settings.
    const allow = document.createElement("button");
    allow.textContent = "Always allow video here";
    allow.style.cssText = `${button.style.cssText};margin-left:6px`;
    allow.addEventListener("click", async (event) => {
      if (!event.isTrusted || allow.disabled) return;
      allow.disabled = true;
      try {
        const response = await chrome.runtime.sendMessage({ action: "allowSiteVideo" });
        if (!response?.ok) throw new Error(response?.error);
      } catch {
        allow.disabled = false;
        allow.textContent = "Couldn't save; try again";
        return;
      }
      for (const paused of [...waiting]) restoreVideo(paused);
    });
    root.append(button, allow);
    container.before(placeholder);
    record.placeholder = placeholder;
  }

  // Any click or key press gives the page user activation for a few seconds,
  // so reading with PageDown would let a player that autoplays as it scrolls
  // into view through (Investopedia's JW Player does this). A play only counts
  // as the user's when a trusted play gesture was on the player itself or a
  // labeled play control. Synthetic clicks and reading keys don't count.
  const CLICK_WINDOW_MS = 1000;
  const PLAYER_DEPTH = 4;
  let lastGesture = null;
  const stoppedAt = new WeakMap();
  let lastRelay = null;
  async function relayPlay() {
    if (window === parent) return;
    try {
      const { token } = await chrome.runtime.sendMessage({ action: "frameGesture", kind: "play" });
      if (token) parent.postMessage({ type: "subtle:frame-gesture", kind: "play", token }, "*");
    } catch {}
  }
  subtlePolicy.listen(window, "message", async (event) => {
    const data = event.data;
    if (data?.type !== "subtle:frame-gesture" || typeof data.token !== "string") return;
    const restoring = data.kind === "restore" && event.source === parent && parent !== window;
    const frame = restoring ? null : [...document.querySelectorAll("iframe, frame")]
      .find((node) => node.contentWindow === event.source);
    if (!restoring && (!frame || data.kind !== "play")) return;
    try {
      const result = await chrome.runtime.sendMessage({ action: "verifyFrameGesture",
        token: data.token, kind: data.kind, origin: event.origin });
      if (!result?.valid) return;
      if (restoring) {
        for (const video of waiting) restoreVideo(video);
        return;
      }
      lastGesture = { target: frame, fromFrame: true, time: performance.now(), controls: frame.getAttribute("aria-controls"), playControl: false };
      // The page's play() may run before the isolated-world round trip. Resume
      // only a just-paused video belonging to this frame's player container.
      for (const video of document.querySelectorAll("video"))
        if (performance.now() - (stoppedAt.get(video) ?? -Infinity) < CLICK_WINDOW_MS && startedByUser(video)) {
          recentPauses.delete(video);
          if (unloaded.has(video)) restoreVideo(video);
          else video.play().catch(() => {});
        }
      if (window !== parent && result.token)
        parent.postMessage({ ...data, token: result.token }, "*");
    } catch {}
  });
  function controlLabel(control) {
    const labelledBy = control.getAttribute("aria-labelledby")?.split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
    return labelledBy || control.getAttribute("aria-label") || control.title || control.value || control.textContent;
  }
  for (const type of ["pointerdown", "click", "keydown"])
    subtlePolicy.listen(document,
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
        if (lastGesture.playControl && !(type === "click" && lastRelay?.target === target &&
            performance.now() - lastRelay.time < CLICK_WINDOW_MS)) {
          lastRelay = { target, time: performance.now() };
          relayPlay();
        }
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
    if (lastGesture.fromFrame && performance.now() - lastGesture.time >= CLICK_WINDOW_MS) return false;
    if (onPlayer(lastGesture.target, video)) return true;
    if (performance.now() - lastGesture.time >= CLICK_WINDOW_MS) return false;
    const { controls, playControl } = lastGesture;
    if (controls)
      return controls.split(/\s+/).some((id) => document.getElementById(id)?.contains(video));
    return playControl;
  }

  // The page's main video (a watch page, a live stream, a film) is what the
  // visitor came for. In the top page only: a first-party video that fills
  // most of the window, isn't part of an article or pinned to the window, and
  // is the largest video on the page. Article players, background loops and
  // third-party ad video stay paused.
  function mainVideo(video) {
    if (window.top !== window || video.closest("article")) return false;
    const { width, height } = video.getBoundingClientRect();
    if (width < innerWidth * 0.6 || height < innerHeight * 0.5) return false;
    const src = video.currentSrc || video.getAttribute("src") || "";
    // Streaming players feed a blob: URL, which is always the page's own
    if (src && !src.startsWith("blob:")) {
      let host;
      try {
        host = new URL(src, location.href).hostname.replace(/^www\./, "");
      } catch {
        return false;
      }
      const site = subtlePolicy.site;
      if (host !== site && !host.endsWith(`.${site}`) && !site.endsWith(`.${host}`))
        return false;
    }
    // A full-window background loop or an overlay is pinned to the window; a
    // watch page's player sits in the page
    for (let box = video, depth = 0; box && depth < MAX_FLOAT_DEPTH; box = box.parentElement, depth++)
      if (getComputedStyle(box).position === "fixed") return false;
    for (const other of document.querySelectorAll("video")) {
      if (other === video) continue;
      const box = other.getBoundingClientRect();
      if (box.width * box.height > width * height) return false;
    }
    return true;
  }

  function shouldPause(video) {
    if (
      autoplayCompatibilitySite() ||
      restored.has(video) ||
      !subtlePolicy.enabled("autoplayGuard")
    )
      return false;
    if (mainVideo(video) || startedByUser(video)) return false;
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

  function checkVideo(video) {
    if (!(video instanceof HTMLVideoElement) || video.paused) return;

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
    stoppedAt.set(video, now);
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
    if (!counted.has(video)) {
      counted.add(video);
      chrome.runtime
        .sendMessage({ action: "countAction", kind: "autoplay" })
        .catch(() => {});
    }
  }
  subtlePolicy.listen(document, "play", (event) => checkVideo(event.target), true);
  const checkExisting = () => {
    for (const video of document.querySelectorAll("video")) checkVideo(video);
  };
  // Capture gestures immediately; a video may start before the asynchronous
  // policy arrives. Scan once when ready; later settings updates must not
  // reconsider a video the user has already started watching.
  subtlePolicy.ready.then(checkExisting);
})();
