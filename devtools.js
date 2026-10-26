// Create a panel in Chrome DevTools
chrome.devtools.panels.create(
  "URL Blocker", // Panel title
  "images/icon16.png", // Panel icon
  "panel.html", // Panel content page
  (panel) => {
    // Tells the panel when it's the DevTools tab in front, so it skips
    // drawing the log while out of sight
    let panelWindow;
    panel.onShown.addListener((win) => {
      panelWindow = win;
      win.setPanelShown?.(true);
    });
    panel.onHidden.addListener(() => panelWindow?.setPanelShown?.(false));
  }
);
