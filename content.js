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
    h3 { margin: 0 0 6px; font-size: 14px; color: #e8eaed; }
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
      "Element selector activated. Click an element to hide it here or block its source URL. Press Esc to cancel.",
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
            element !== document.body,
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
    showUrlSelectionDialog(urls, element);
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
    const nodes = [element, ...element.querySelectorAll("*")].slice(
      0,
      MAX_SCANNED_ELEMENTS,
    );
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
      for (const [, url] of backgroundImage.matchAll(
        /url\(["']?(.*?)["']?\)/g,
      )) {
        addUrl(url);
      }
    }

    return [...urls];
  }

  // The site being browsed and its parent domains: blocking one of those
  // would block the site itself
  function isPageSite(host) {
    const pageHost = location.hostname.replace(/^www\./, "");
    return host === pageHost || pageHost.endsWith(`.${host}`);
  }

  function createChoiceList(choices, dialog) {
    const list = createElement("ul");
    for (const { label, value, mode } of choices) {
      const button = createElement("button", "url");
      button.type = "button";
      button.append(...label);
      button.addEventListener("click", () => {
        dialog.close();
        blockUrl(value, mode);
      });

      const item = createElement("li");
      item.append(button);
      list.append(item);
    }
    return list;
  }

  function showUrlSelectionDialog(urls, selectedElement) {
    const dialog = createElement("dialog");

    // Ad URLs usually carry tracking numbers that change on every load, so
    // blocking the whole domain is listed first
    const domains = [
      ...new Set(
        urls.map((url) => new URL(url).hostname.replace(/^www\./, "")),
      ),
    ].filter((host) => !isPageSite(host));
    const domainChoices = domains.map((host) => ({
      label: [createElement("b", "", host)],
      value: host,
      mode: "domain",
    }));

    // Show the domain in bold
    const urlChoices = urls.map((url) => {
      const { protocol, host, pathname, search, hash } = new URL(url); // host keeps the port
      return {
        label: [
          `${protocol}//`,
          createElement("b", "", host),
          pathname + search + hash,
        ],
        value: url,
        mode: "exact",
      };
    });

    dialog.append(
      createElement("h2", "", "Select what to block"),
      ...(domainChoices.length > 0
        ? [
            createElement("h3", "", "Whole domain"),
            createChoiceList(domainChoices, dialog),
          ]
        : []),
      createElement("h3", "", "Exact URL"),
      createChoiceList(urlChoices, dialog),
    );

    const hideButton = createElement("button", "cancel", "Hide on this site");
    hideButton.type = "button";
    hideButton.addEventListener("click", async () => {
      hideButton.disabled = true;
      try {
        const selector = selectorFor(selectedElement);
        const response = await chrome.runtime.sendMessage({
          action: "hideElement",
          selector,
        });
        if (response?.error) throw new Error(response.error);
        dialog.close();
        showNotification("Hidden on this site.", async () => {
          const result = await chrome.runtime.sendMessage({
            action: "mutate",
            operation: "unhide",
            data: { site: location.hostname.replace(/^www\./, ""), selector },
          });
          if (result?.error) throw new Error(result.error);
        });
      } catch (error) {
        showNotification(error.message);
        hideButton.disabled = false;
      }
    });
    dialog.append(
      createElement(
        "p",
        "",
        "Hide only this element here, or block a URL on every site.",
      ),
      hideButton,
    );
    if (!urls.length)
      dialog.append(
        createElement(
          "p",
          "",
          "No source URLs found. You can still hide this element.",
        ),
      );
    const cancelButton = createElement("button", "cancel", "Cancel");
    cancelButton.type = "button";
    cancelButton.addEventListener("click", () => dialog.close());

    const actions = createElement("div", "actions");
    actions.append(cancelButton);

    dialog.append(actions);
    // Esc, Cancel and picking a URL all end up here
    dialog.addEventListener("close", () => hide(dialog));

    show(dialog);
    dialog.showModal();
  }

  function selectorFor(element) {
    const parts = [];
    for (
      let node = element;
      node && node !== document.documentElement;
      node = node.parentElement
    ) {
      if (
        node.id &&
        document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1
      ) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const siblings = [...node.parentElement.children].filter(
        (child) => child.tagName === node.tagName,
      );
      parts.unshift(
        `${node.localName}:nth-of-type(${siblings.indexOf(node) + 1})`,
      );
    }
    const selector = parts.join(" > ");
    if (!selector || document.querySelectorAll(selector).length !== 1)
      throw new Error("Choose a smaller, unique element.");
    return selector;
  }

  async function blockUrl(url, mode) {
    try {
      const { added, value, error } = await chrome.runtime.sendMessage({
        action: "blockUrl",
        url,
        mode,
      });
      if (error) showNotification(error);
      else if (added)
        showNotification(`Blocked: ${url}`, async () => {
          const result = await chrome.runtime.sendMessage({
            action: "mutate",
            operation: "removeUrl",
            data: { url: value },
          });
          if (result?.error) throw new Error(result.error);
        });
      else showNotification("That's already blocked.");
    } catch {
      showNotification("Failed to block URL. Try again.");
    }
  }

  function showNotification(message, undo) {
    const notification = createElement("div", "toast", message);
    notification.setAttribute("role", "status");
    if (undo) {
      const button = createElement("button", "cancel", "Undo");
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await undo();
          hide(notification);
          showNotification("Undone. Reload if content was already removed.");
        } catch (error) {
          notification.prepend(`${error.message} `);
          button.disabled = false;
        }
      });
      notification.append(" ", button);
      const dismiss = createElement("button", "cancel", "Dismiss");
      dismiss.addEventListener("click", () => hide(notification));
      notification.append(" ", dismiss);
    }
    show(notification);
    // Undo stays available until dismissed, including for keyboard users.
    if (!undo) setTimeout(() => hide(notification), 5000);
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
