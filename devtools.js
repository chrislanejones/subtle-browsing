// Create a panel in Chrome DevTools
chrome.devtools.panels.create(
  "URL Blocker", // Panel title
  "images/icon16.png", // Panel icon
  "panel.html", // Panel content page
  function(panel) {
    // Panel created
  }
);
