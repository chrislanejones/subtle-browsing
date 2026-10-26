// A child can only nominate its own frame. The parent identifies ads and
// owns the placeholder, original attributes and one-load restore exemption.
(() => {
  const restored = new WeakSet();
  const removed = new WeakSet();
  const adHosts = [
    "doubleclick.net",
    "googlesyndication.com",
    "amazon-adsystem.com",
    "connatix.com",
    "primis.tech",
    "teads.tv",
    "anyclip.com",
    "aniview.com",
    "vdo.ai",
  ];
  function isAd(frame) {
    let host = "";
    try {
      host = new URL(frame.src).hostname;
    } catch {}
    if (
      adHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))
    )
      return true;
    // Explicit publisher ad slots, not a loose substring like 'download'.
    return (
      Boolean(
        frame.closest(
          "[data-ad-slot], [data-ad-client], [data-ad-unit], ins.adsbygoogle",
        ),
      ) ||
      /^(google_ads_iframe_|aswift_|ad_iframe)/.test(frame.id) ||
      /\b(advertisement|advertising)\b/i.test(frame.title)
    );
  }
  window.addEventListener("message", async (event) => {
    const heavy = event.data?.type === "subtle:heavy";
    if (
      (!heavy && event.data !== "url-blocker:collapse-frame") ||
      !event.source
    )
      return;
    const frame = [...document.querySelectorAll("iframe, frame")].find(
      (f) => f.contentWindow === event.source,
    );
    if (!frame || restored.has(frame) || removed.has(frame)) return;
    await subtlePolicy.ready;
    if (!heavy) {
      if (subtlePolicy.enabled("autoplayGuard"))
        frame.style.setProperty("display", "none", "important");
      return;
    }
    if (!subtlePolicy.enabled("heavyAds")) return;
    // First-party frames are spared even in the broader opt-in mode.
    let host;
    try {
      host = new URL(frame.src, location.href).hostname.replace(/^www\./, "");
    } catch {
      return;
    }
    const top = subtlePolicy.site;
    if (host === top || host.endsWith(`.${top}`) || top.endsWith(`.${host}`))
      return;
    if (!isAd(frame) && !subtlePolicy.enabled("aggressiveHeavyAds")) return;
    // Interaction inside the frame is checked in the child; interaction with
    // the frame element itself is another conservative exemption.
    if (document.activeElement === frame) return;
    removed.add(frame);
    const saved = {
      src: frame.getAttribute("src"),
      srcdoc: frame.getAttribute("srcdoc"),
      display: frame.style.getPropertyValue("display"),
      priority: frame.style.getPropertyPriority("display"),
    };
    const placeholder = document.createElement("subtle-removed-content");
    const root = placeholder.attachShadow({ mode: "closed" });
    const box = document.createElement("div");
    box.style.cssText =
      "font:13px/1.5 system-ui;padding:10px;background:light-dark(#f4f6f7,#252a2e);color:light-dark(#25313a,#e5edf2);border:1px solid #85939c;border-radius:6px;color-scheme:light dark";
    const reason =
      typeof event.data.reason === "string"
        ? event.data.reason.slice(0, 80)
        : "resource limit";
    box.append(`Heavy content stopped (${reason}). `);
    const button = document.createElement("button");
    button.textContent = "Restore this content";
    button.style.cssText = "font:inherit;cursor:pointer;padding:4px 8px";
    button.addEventListener(
      "click",
      () => {
        restored.add(frame);
        if (saved.srcdoc !== null) frame.setAttribute("srcdoc", saved.srcdoc);
        if (saved.src !== null) frame.setAttribute("src", saved.src);
        else frame.removeAttribute("src");
        if (saved.display)
          frame.style.setProperty("display", saved.display, saved.priority);
        else frame.style.removeProperty("display");
        placeholder.remove();
        frame.focus();
      },
      { once: true },
    );
    box.append(button);
    root.append(box);
    frame.before(placeholder);
    frame.removeAttribute("srcdoc");
    frame.src = "about:blank";
    frame.style.setProperty("display", "none", "important");
    chrome.runtime
      .sendMessage({
        action: "heavyAdRemoved",
        reason,
        url: saved.src
          ? new URL(saved.src, location.href).href
          : "embedded content",
      })
      .catch(() => {});
  });
})();
