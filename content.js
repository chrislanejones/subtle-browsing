// Element picker for the URL Blocker extension.
// background.js injects this only when the picker is needed. It can be
// injected more than once into the same page, so the guard keeps one copy.
(() => {
  if (globalThis.urlBlockerPickerLoaded) return;
  globalThis.urlBlockerPickerLoaded = true;

  const MAX_SCANNED_ELEMENTS = 2000;
  const STYLES = `
    :host { all: initial; }
    .shield {
      position: fixed;
      inset: 0;
      cursor: crosshair;
      z-index: 2147483646;
    }
    .highlight {
      position: fixed;
      box-sizing: border-box;
      border: 2px solid #6dd58c;
      background: rgba(109, 213, 140, 0.2);
      pointer-events: none;
      z-index: 2147483647;
      display: none;
    }
    .toast, dialog {
      background: #202124;
      color: #6dd58c;
      font: 14px/1.4 system-ui, sans-serif;
    }
    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 20px;
      border-radius: 4px;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
    }
    dialog {
      padding: 20px;
      border: none;
      border-radius: 8px;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
      min-width: min(400px, 90vw);
      max-width: 80vw;
    }
    dialog::backdrop { background: rgba(0, 0, 0, 0.5); }
    h2 { margin: 0 0 15px; font-size: 18px; }
    ul {
      list-style: none;
      max-height: 300px;
      overflow-y: auto;
      margin: 0 0 15px;
      padding: 10px;
      border: 1px solid #3c4043;
      border-radius: 4px;
    }
    li + li { border-top: 1px solid #3c4043; }
    .url {
      display: block;
      width: 100%;
      padding: 8px;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      word-break: break-all;
      cursor: pointer;
    }
    .url:hover, .url:focus-visible { background: rgba(109, 213, 140, 0.1); }
    .actions { display: flex; justify-content: flex-end; }
    .cancel {
      padding: 8px 12px;
      border: none;
      border-radius: 4px;
      background: #3c4043;
      color: white;
      font: inherit;
      cursor: pointer;
    }
  `;

  // Everything the picker draws lives in a closed shadow root, so the page's
  // CSS can't restyle it. The host is only in the page while something shows.
  const host = document.createElement("url-blocker-ui");
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = STYLES;
  root.append(style);

  // The shield sits over the page while picking, so clicks never reach the
  // ad and iframes can be picked too
  const shield = createElement("div", "shield");
  const highlight = createElement("div", "highlight");
  let hoveredElement = null;
  let isActive = false;

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function show(...elements) {
    root.append(...elements);
    if (!host.isConnected) document.documentElement.append(host);
  }

  function hide(...elements) {
    elements.forEach((element) => element.remove());
    // Only the <style> is left: take the host out of the page
    if (root.childElementCount === 1) host.remove();
  }

  function activate() {
    if (isActive) return;
    isActive = true;

    show(shield, highlight);
    shield.addEventListener("mousemove", handleMouseMove);
    shield.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("scroll", updateHighlight, {
      capture: true,
      passive: true,
    });

    showNotification(
      "Element selector activated. Click on an element to block its source URL. Press Esc to cancel."
    );
  }

  function deactivate() {
    if (!isActive) return;
    isActive = false;

    shield.removeEventListener("mousemove", handleMouseMove);
    shield.removeEventListener("click", handleClick);
    window.removeEventListener("keydown", handleKeyDown, true);
    window.removeEventListener("scroll", updateHighlight, true);
    highlight.style.display = "none";
    hoveredElement = null;
    hide(shield, highlight);

    // Lets an open DevTools panel reset its buttons
    chrome.runtime.sendMessage({ action: "selectorStopped" }).catch(() => {});
  }

  // The topmost page element under the pointer, looking through the shield
  function elementAt(x, y) {
    return (
      document
        .elementsFromPoint(x, y)
        .find(
          (element) =>
            element !== host &&
            element !== document.documentElement &&
            element !== document.body
        ) ?? null
    );
  }

  // elementsFromPoint forces a layout, so look up at most once per frame
  let lastPointer = null;
  let frameRequested = false;
  function handleMouseMove(e) {
    lastPointer = { x: e.clientX, y: e.clientY };
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(() => {
      frameRequested = false;
      if (!isActive) return;
      hoveredElement = elementAt(lastPointer.x, lastPointer.y);
      updateHighlight();
    });
  }

  function updateHighlight() {
    if (!hoveredElement) {
      highlight.style.display = "none";
      return;
    }
    const { left, top, width, height } = hoveredElement.getBoundingClientRect();
    Object.assign(highlight.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      display: "block",
    });
  }

  function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const element = elementAt(e.clientX, e.clientY);
    deactivate();
    if (!element) return;

    const urls = extractUrls(element);
    if (urls.length > 0) {
      showUrlSelectionDialog(urls);
    } else {
      showNotification("No URLs found in this element.");
    }
  }

  function handleKeyDown(e) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    deactivate();
  }

  // Collect http(s) URLs from an element and everything inside it
  function extractUrls(element) {
    const urls = new Set();
    const addUrl = (value) => {
      // SVG elements expose href as an object, not a string
      if (typeof value !== "string" || !value) return;
      try {
        const url = new URL(value, location.href);
        if (url.protocol === "http:" || url.protocol === "https:") {
          urls.add(url.href);
        }
      } catch {
        // Not a URL
      }
    };

    // Picking a huge container would otherwise freeze the page while every
    // child's style is read
    const nodes = [element, ...element.querySelectorAll("*")].slice(0, MAX_SCANNED_ELEMENTS);
    for (const node of nodes) {
      addUrl(node.currentSrc || node.src); // img, video, iframe, script
      addUrl(node.href);
      addUrl(node.poster);
      addUrl(node.getAttribute("data")); // <object data="...">

      for (const attr of node.attributes) {
        if (attr.name.startsWith("data-") && /^https?:\/\//.test(attr.value)) {
          addUrl(attr.value);
        }
      }

      const { backgroundImage } = getComputedStyle(node);
      for (const [, url] of backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)) {
        addUrl(url);
      }
    }

    return [...urls];
  }

  function showUrlSelectionDialog(urls) {
    const dialog = createElement("dialog");
    const list = createElement("ul");

    for (const url of urls) {
      const button = createElement("button", "url");
      button.type = "button";

      // Show the domain in bold
      const { protocol, hostname, pathname, search, hash } = new URL(url);
      button.append(
        `${protocol}//`,
        createElement("b", "", hostname),
        pathname + search + hash
      );

      button.addEventListener("click", () => {
        dialog.close();
        blockUrl(url);
      });

      const item = createElement("li");
      item.append(button);
      list.append(item);
    }

    const cancelButton = createElement("button", "cancel", "Cancel");
    cancelButton.type = "button";
    cancelButton.addEventListener("click", () => dialog.close());

    const actions = createElement("div", "actions");
    actions.append(cancelButton);

    dialog.append(
      createElement("h2", "", "Select URL to block"),
      createElement("p", "", "Choose which URL you want to block:"),
      list,
      actions
    );
    // Esc, Cancel and picking a URL all end up here
    dialog.addEventListener("close", () => hide(dialog));

    show(dialog);
    dialog.showModal();
  }

  async function blockUrl(url) {
    try {
      const { added } = await chrome.runtime.sendMessage({
        action: "blockUrl",
        url,
      });
      showNotification(added ? `URL blocked: ${url}` : "That URL is already blocked.");
    } catch {
      showNotification("Failed to block URL");
    }
  }

  function showNotification(message) {
    const notification = createElement("div", "toast", message);
    show(notification);
    setTimeout(() => hide(notification), 3000);
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startSelector") {
      activate();
      sendResponse({ status: "Selector activated" });
    } else if (request.action === "stopSelector") {
      deactivate();
      sendResponse({ status: "Selector deactivated" });
    }
  });
})();
