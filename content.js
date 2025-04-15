// URL Selector Tool for the URL Blocker extension
// This script injects an element selector tool to the active page

// Create a selector tool object with its state and methods
const SelectorTool = {
  isActive: false,
  selectedElement: null,
  highlightElement: null,

  // Initialize the selector tool
  init: function () {
    // Create highlight overlay element
    this.highlightElement = document.createElement("div");
    this.highlightElement.style.position = "absolute";
    this.highlightElement.style.border = "2px solid #6dd58c";
    this.highlightElement.style.backgroundColor = "rgba(109, 213, 140, 0.2)";
    this.highlightElement.style.pointerEvents = "none";
    this.highlightElement.style.zIndex = "9999999";
    this.highlightElement.style.display = "none";
    document.body.appendChild(this.highlightElement);

    // Listen for messages from the extension
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "startSelector") {
        this.activate();
        sendResponse({ status: "Selector activated" });
      } else if (request.action === "stopSelector") {
        this.deactivate();
        sendResponse({ status: "Selector deactivated" });
      }
      return true;
    });
  },

  // Activate the selector tool
  activate: function () {
    if (this.isActive) return;

    this.isActive = true;

    // Add event listeners
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("click", this.handleClick);

    // Change cursor style
    document.body.style.cursor = "crosshair";

    // Display notification
    this.showNotification(
      "Element selector activated. Click on an element to block its source URL."
    );
  },

  // Deactivate the selector tool
  deactivate: function () {
    if (!this.isActive) return;

    this.isActive = false;

    // Remove event listeners
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("click", this.handleClick);

    // Reset cursor
    document.body.style.cursor = "";

    // Hide highlight
    this.highlightElement.style.display = "none";

    // Clear selected element
    this.selectedElement = null;
  },

  // Handle mouse movement
  handleMouseMove: function (e) {
    if (!SelectorTool.isActive) return;

    // Prevent events from firing on other elements
    e.stopPropagation();

    // Get element under cursor, except our highlight element
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element || element === SelectorTool.highlightElement) return;

    // Update selected element
    SelectorTool.selectedElement = element;

    // Update highlight position
    const rect = element.getBoundingClientRect();
    SelectorTool.highlightElement.style.left = `${
      window.scrollX + rect.left
    }px`;
    SelectorTool.highlightElement.style.top = `${window.scrollY + rect.top}px`;
    SelectorTool.highlightElement.style.width = `${rect.width}px`;
    SelectorTool.highlightElement.style.height = `${rect.height}px`;
    SelectorTool.highlightElement.style.display = "block";
  },

  // Handle click on element
  handleClick: function (e) {
    if (!SelectorTool.isActive) return;

    // Prevent the default action and event propagation
    e.preventDefault();
    e.stopPropagation();

    if (!SelectorTool.selectedElement) return;

    // Find URLs in the element
    const urls = SelectorTool.extractUrls(SelectorTool.selectedElement);

    if (urls.length > 0) {
      // Send found URLs to the background script
      SelectorTool.showUrlSelectionDialog(urls);
    } else {
      SelectorTool.showNotification("No URLs found in this element.");
    }

    // Deactivate after selection
    SelectorTool.deactivate();
  },

  // Extract URLs from an element and its children
  extractUrls: function (element) {
    const urls = new Set();

    // Check for src attribute
    if (element.src) {
      urls.add(element.src);
    }

    // Check for href attribute
    if (element.href) {
      urls.add(element.href);
    }

    // Check for background image
    const style = window.getComputedStyle(element);
    const backgroundImage = style.backgroundImage;
    if (backgroundImage && backgroundImage !== "none") {
      const urlMatch = backgroundImage.match(/url\(['"]?(.*?)['"]?\)/);
      if (urlMatch && urlMatch[1]) {
        urls.add(urlMatch[1]);
      }
    }

    // Check data attributes that might contain URLs
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-") && attr.value.match(/^https?:\/\//)) {
        urls.add(attr.value);
      }
    });

    // Check for iframe src
    if (element.tagName === "IFRAME" && element.src) {
      urls.add(element.src);
    }

    // Get URLs from child elements
    Array.from(element.children).forEach((child) => {
      const childUrls = this.extractUrls(child);
      childUrls.forEach((url) => urls.add(url));
    });

    return Array.from(urls);
  },

  // Show dialog with found URLs
  showUrlSelectionDialog: function (urls) {
    if (urls.length === 0) return;

    // Create dialog container
    const dialog = document.createElement("div");
    dialog.style.position = "fixed";
    dialog.style.top = "50%";
    dialog.style.left = "50%";
    dialog.style.transform = "translate(-50%, -50%)";
    dialog.style.backgroundColor = "#202124";
    dialog.style.color = "#6dd58c";
    dialog.style.padding = "20px";
    dialog.style.borderRadius = "8px";
    dialog.style.zIndex = "10000000";
    dialog.style.boxShadow = "0 0 20px rgba(0,0,0,0.5)";
    dialog.style.minWidth = "400px";
    dialog.style.maxWidth = "80%";

    // Add heading
    const heading = document.createElement("h2");
    heading.textContent = "Select URL to block";
    heading.style.marginTop = "0";
    heading.style.marginBottom = "15px";
    dialog.appendChild(heading);

    // Add description
    const description = document.createElement("p");
    description.textContent = "Choose which URL you want to block:";
    dialog.appendChild(description);

    // Create URL list
    const urlList = document.createElement("div");
    urlList.style.maxHeight = "300px";
    urlList.style.overflowY = "auto";
    urlList.style.border = "1px solid #3c4043";
    urlList.style.padding = "10px";
    urlList.style.marginBottom = "15px";
    urlList.style.borderRadius = "4px";

    urls.forEach((url, index) => {
      const urlItem = document.createElement("div");
      urlItem.style.padding = "8px";
      urlItem.style.cursor = "pointer";
      urlItem.style.borderBottom =
        index < urls.length - 1 ? "1px solid #3c4043" : "none";
      urlItem.style.wordBreak = "break-all";

      // Highlight on hover
      urlItem.addEventListener("mouseover", () => {
        urlItem.style.backgroundColor = "rgba(109, 213, 140, 0.1)";
      });
      urlItem.addEventListener("mouseout", () => {
        urlItem.style.backgroundColor = "transparent";
      });

      // Format URL display: domain highlighted
      try {
        const urlObj = new URL(url);
        const domainPart = document.createElement("span");
        domainPart.textContent = urlObj.hostname;
        domainPart.style.fontWeight = "bold";

        const beforeDomain = document.createElement("span");
        beforeDomain.textContent = `${urlObj.protocol}//`;

        const afterDomain = document.createElement("span");
        afterDomain.textContent = urlObj.pathname + urlObj.search + urlObj.hash;

        urlItem.appendChild(beforeDomain);
        urlItem.appendChild(domainPart);
        urlItem.appendChild(afterDomain);
      } catch (e) {
        // If URL parsing fails, just show the whole URL
        urlItem.textContent = url;
      }

      // Handle click to block this URL
      urlItem.addEventListener("click", () => {
        // Send message to background script to block this URL
        chrome.runtime.sendMessage(
          {
            action: "blockUrl",
            url: url,
          },
          (response) => {
            if (response && response.success) {
              SelectorTool.showNotification(`URL blocked: ${url}`);
            } else {
              SelectorTool.showNotification("Failed to block URL");
            }
          }
        );

        // Remove dialog
        document.body.removeChild(dialog);
        document.body.removeChild(overlay);
      });

      urlList.appendChild(urlItem);
    });

    dialog.appendChild(urlList);

    // Add buttons
    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.gap = "10px";

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    cancelButton.style.padding = "8px 12px";
    cancelButton.style.backgroundColor = "#3c4043";
    cancelButton.style.color = "white";
    cancelButton.style.border = "none";
    cancelButton.style.borderRadius = "4px";
    cancelButton.style.cursor = "pointer";
    cancelButton.addEventListener("click", () => {
      document.body.removeChild(dialog);
      document.body.removeChild(overlay);
    });

    buttonContainer.appendChild(cancelButton);
    dialog.appendChild(buttonContainer);

    // Create background overlay
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
    overlay.style.zIndex = "9999999";

    // Add to document
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);
  },

  // Show notification
  showNotification: function (message) {
    const notification = document.createElement("div");
    notification.textContent = message;
    notification.style.position = "fixed";
    notification.style.bottom = "20px";
    notification.style.left = "50%";
    notification.style.transform = "translateX(-50%)";
    notification.style.backgroundColor = "#202124";
    notification.style.color = "#6dd58c";
    notification.style.padding = "10px 20px";
    notification.style.borderRadius = "4px";
    notification.style.zIndex = "10000000";
    notification.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  },
};

// Initialize the selector tool when the content script loads
SelectorTool.init();

// Bind the event handlers to the SelectorTool object
SelectorTool.handleMouseMove = SelectorTool.handleMouseMove.bind(SelectorTool);
SelectorTool.handleClick = SelectorTool.handleClick.bind(SelectorTool);
