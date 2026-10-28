// CSS handles new matching elements without a mutation observer or polling.
(() => {
  const style = document.createElement("style");
  let rules = [];
  async function render() {
    await subtlePolicy.ready;
    const off = !subtlePolicy.enabled("cosmetic");
    style.textContent = off
      ? ""
      : rules
          .filter((r) => r.site === location.hostname.replace(/^www\./, ""))
          .filter((r) => {
            try {
              document.querySelector(r.selector);
              return !/[{}]/.test(r.selector);
            } catch {
              return false;
            }
          })
          .map((r) => `${r.selector}{display:none!important}`)
          .join("\n");
    if (!style.textContent) {
      style.remove();
      return;
    }
    if (!style.isConnected && document.documentElement)
      document.documentElement.append(style);
  }
  chrome.storage.sync.get("hiddenElements").then((data) => {
    rules = data.hiddenElements ?? [];
    render();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.hiddenElements) rules = changes.hiddenElements.newValue ?? [];
    if (
      changes.hiddenElements ||
      changes.pausedSites ||
      changes.pausedEverywhere
    )
      render();
  });
  document.addEventListener("DOMContentLoaded", render, { once: true });
})();
