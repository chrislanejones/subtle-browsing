// Stops unwanted cross-site redirects and click-triggered popunders.
// Runs in each frame's own world. Google's ad frames are often same-origin
// (no src), so an ad's script can set top.location; Chrome only blocks that
// for cross-origin frames. The Navigation API's navigate event lets the page
// cancel it. A link click or form, the user's own address bar, reloads and
// back/forward all go through. page-world-policy.js says whether the site
// has it on; the page world can't read the extension's settings itself.
(() => {
  if (!window.navigation) return;
  let on = false;
  const listeners = [];
  const listen = (target, type, callback, options) => {
    listeners.push([target, type, callback, options]);
    target.addEventListener(type, callback, options);
  };
  let root = document.documentElement;
  new MutationObserver(() => {
    if (root === document.documentElement) return;
    root = document.documentElement;
    intent = null;
    for (const [target, type, callback, options] of listeners)
      target.addEventListener(type, callback, options);
    window.dispatchEvent(new Event("subtle-page-policy-request"));
  }).observe(document, { childList: true });
  listen(window, "subtle-page-policy", (event) => {
    on = event.detail?.adRedirectGuard === true;
  });

  const siteOf = (hostname) => hostname.replace(/^www\./, "");
  const sameSite = (a, b) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
  const local = (url) => sameSite(siteOf(url.hostname), siteOf(location.hostname));
  const INTENT_MS = 1000;
  let intent = null;

  // Browser activation lasts several seconds after *any* click/key. An ad can
  // borrow that activation from article text or a Play button. Record an
  // actual navigation control instead, binding links to their chosen URL.
  function mediaControl(element) {
    const labelledBy = element.getAttribute("aria-labelledby")?.split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
    const label = labelledBy || element.getAttribute("aria-label") || element.title || element.value || element.textContent;
    if (/\b(play|pause|mute|volume|fullscreen)\b/i.test(label.trim())) return true;
    for (let box = element, depth = 0; box && box !== document.body && depth < 3; box = box.parentElement, depth++) {
      if (box.querySelector("video, audio")) return true;
    }
    return false;
  }
  for (const type of ["pointerdown", "click", "keydown"])
    listen(window, type, (event) => {
      if (!event.isTrusted) return;
      if ((type === "keydown" && !["Enter", " "].includes(event.key)) ||
          (type !== "keydown" && event.button !== 0)) {
        intent = null;
        return;
      }
      const target = event.composedPath()[0];
      const control = target instanceof Element
        ? target.closest("a[href], area[href], button, [role='button'], input[type='button'], input[type='submit']")
        : null;
      const href = control?.matches("a[href], area[href]") ? control.href : null;
      if (!control || (!href && mediaControl(control))) {
        intent = null;
        return;
      }
      // Don't give a pointerdown handler and a click handler separate popups.
      if (type === "click" && intent?.control === control && performance.now() - intent.time < INTENT_MS) return;
      intent = { control, href, time: performance.now(), used: false };
    }, true);

  function intended(url, consume = false) {
    if (!navigator.userActivation?.isActive || !intent || intent.used ||
        performance.now() - intent.time >= INTENT_MS) return false;
    if (intent.href && intent.href !== url.href) return false;
    if (consume) intent.used = true;
    return true;
  }
  const stopped = (kind, url) => console.info(`Subtle stopped a ${kind} to ${url.origin}`);

  const originalOpen = window.open;
  window.open = function (...args) {
    if (!on) return Reflect.apply(originalOpen, this, args);
    const target = String(args[1] ?? "_blank").toLowerCase();
    // These go through the navigate listener; don't consume the intent twice.
    if (["_self", "_top", "_parent"].includes(target)) {
      if (window === top || target === "_self") return Reflect.apply(originalOpen, this, args);
      let destination;
      try { destination = new URL(args[0] || "about:blank", document.baseURI); } catch { return null; }
      if (intended(destination)) return Reflect.apply(originalOpen, this, args);
      stopped("redirect", destination);
      return null;
    }
    let url;
    try { url = new URL(args[0] || "about:blank", document.baseURI); }
    catch { return Reflect.apply(originalOpen, this, args); }
    if (intended(url, true)) return Reflect.apply(originalOpen, this, args);
    stopped("popup", url);
    return null;
  };

  // Synthetic links bypass window.open. Detached links don't bubble events
  // to window, so cover their click() method as well as dispatched events.
  function blockSyntheticLink(link) {
    if (!on || !link.hasAttribute("href")) return false;
    let url;
    try { url = new URL(link.href, document.baseURI); } catch { return false; }
    const target = (link.target || document.querySelector("base[target]")?.target || "_self").toLowerCase();
    const popup = !["_self", "_top", "_parent"].includes(target);
    // Embedded sign-in/media frames can navigate themselves while loading.
    if (!popup && (local(url) || (window !== top && target === "_self"))) return false;
    if (intended(url)) return false;
    stopped(popup ? "popup" : "redirect", url);
    return true;
  }
  for (const prototype of [HTMLAnchorElement.prototype, HTMLAreaElement.prototype]) {
    const originalClick = prototype.click;
    Object.defineProperty(prototype, "click", {
      configurable: true,
      writable: true,
      value: function (...args) {
        if (blockSyntheticLink(this)) return;
        return Reflect.apply(originalClick, this, args);
      },
    });
  }
  listen(window, "click", (event) => {
    if (!on || event.isTrusted) return;
    const link = event.composedPath().find((node) => node instanceof Element && node.matches("a[href], area[href]"));
    if (link && blockSyntheticLink(link)) event.preventDefault();
  }, true);

  listen(navigation, "navigate", (event) => {
    if (!on || window !== top || !event.cancelable) return;
    if (event.navigationType === "reload" || event.navigationType === "traverse")
      return;
    // Sign-in pages post forms to each other on their own
    if (event.formData) return;
    let url;
    try {
      url = new URL(event.destination.url);
    } catch {
      return;
    }
    if (!/^https?:$/.test(url.protocol)) return;
    if (local(url)) return;
    if (event.userInitiated && (!intent?.href || intent.href === url.href)) return;
    if (intended(url)) return;
    event.preventDefault();
    stopped("redirect", url);
  });
})();
