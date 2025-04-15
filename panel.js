document.addEventListener("DOMContentLoaded", function () {
  const urlInput = document.getElementById("urlInput");
  const addButton = document.getElementById("addButton");
  const blockedUrlsList = document.getElementById("blockedUrlsList");
  const logsContainer = document.getElementById("logsContainer");
  const refreshButton = document.getElementById("refreshButton");
  const clearLogsButton = document.getElementById("clearLogsButton");
  const noLogsMessage = document.getElementById("noLogsMessage");
  const selectorButton = document.getElementById("selectorButton");
  const stopSelectorButton = document.getElementById("stopSelectorButton");
  const openInspectorButton = document.getElementById("openInspectorButton");

  // URL display configuration
  const MAX_DISPLAYED_URLS = 10;
  let showAllUrls = false;

  // Load blocked URLs and logs when panel opens
  loadBlockedUrls();
  loadBlockedLogs();

  // Add URL to block list
  addButton.addEventListener("click", function () {
    const url = urlInput.value.trim();
    if (url) {
      addUrlToBlockList(url);
      urlInput.value = "";
    }
  });

  // Allow Enter key to add URL
  urlInput.addEventListener("keyup", function (event) {
    if (event.key === "Enter") {
      addButton.click();
    }
  });

  // Refresh logs button
  refreshButton.addEventListener("click", function () {
    loadBlockedLogs();
  });

  // Clear logs button
  clearLogsButton.addEventListener("click", function () {
    clearBlockedLogs();
  });

  // Element selector button
  selectorButton.addEventListener("click", function () {
    // Send message to background script to start the selector
    chrome.runtime.sendMessage(
      { action: "startSelector" },
      function (response) {
        if (response && response.status === "Selector activated") {
          selectorButton.style.display = "none";
          stopSelectorButton.style.display = "inline-flex";
          selectorButton.classList.add("active");
        }
      }
    );
  });

  // Stop element selector button
  stopSelectorButton.addEventListener("click", function () {
    // Send message to background script to stop the selector
    chrome.runtime.sendMessage({ action: "stopSelector" }, function (response) {
      if (response && response.status === "Selector deactivated") {
        selectorButton.style.display = "inline-flex";
        stopSelectorButton.style.display = "none";
        selectorButton.classList.remove("active");
      }
    });
  });

  // Open inspector button
  openInspectorButton.addEventListener("click", function () {
    // Chrome DevTools has no API to programmatically switch to another panel,
    // so we'll show instructions to the user
    alert(
      "To use the element selector, click on the 'Select Element to Block' button, then click on the ad element you want to block on the page."
    );
  });

  // Function to add URL to block list
  function addUrlToBlockList(url) {
    // Normalize URL format
    const normalizedUrl = normalizeUrl(url);

    // Get current blocked URLs
    chrome.storage.local.get(["blockedUrls"], function (result) {
      const blockedUrls = result.blockedUrls || [];

      // Check if URL is already in the list
      if (blockedUrls.includes(normalizedUrl)) {
        alert("This URL is already blocked.");
        return;
      }

      // Add URL to the list
      blockedUrls.push(normalizedUrl);

      // Save updated list - this will trigger the storage listener in background.js
      // which will update the declarative rules
      chrome.storage.local.set({ blockedUrls: blockedUrls }, function () {
        // Update UI
        loadBlockedUrls();
      });
    });
  }

  // Function to remove URL from block list
  function removeUrlFromBlockList(url) {
    chrome.storage.local.get(["blockedUrls"], function (result) {
      const blockedUrls = result.blockedUrls || [];
      const updatedList = blockedUrls.filter((item) => item !== url);

      chrome.storage.local.set({ blockedUrls: updatedList }, function () {
        // Update UI
        loadBlockedUrls();
      });
    });
  }

  // Function to load and display blocked URLs
  function loadBlockedUrls() {
    chrome.storage.local.get(["blockedUrls"], function (result) {
      const blockedUrls = result.blockedUrls || [];

      // Clear current list
      blockedUrlsList.innerHTML = "";

      if (blockedUrls.length === 0) {
        blockedUrlsList.innerHTML = "<p>No URLs blocked yet.</p>";
        return;
      }

      // Determine how many URLs to show
      const displayedUrls = showAllUrls
        ? blockedUrls
        : blockedUrls.slice(0, MAX_DISPLAYED_URLS);

      // Add each URL to the list
      displayedUrls.forEach(function (url) {
        const urlTag = document.createElement("div");
        urlTag.className = "url-tag";

        const urlText = document.createElement("span");
        urlText.textContent = url;

        const removeButton = document.createElement("button");
        removeButton.innerHTML = "&times;";
        removeButton.title = "Remove";
        removeButton.addEventListener("click", function () {
          removeUrlFromBlockList(url);
        });

        urlTag.appendChild(urlText);
        urlTag.appendChild(removeButton);
        blockedUrlsList.appendChild(urlTag);
      });

      // Add "Show more" / "Show less" button if there are more than MAX_DISPLAYED_URLS
      if (blockedUrls.length > MAX_DISPLAYED_URLS) {
        const showMoreButton = document.createElement("button");
        showMoreButton.className = "show-more-btn";
        showMoreButton.textContent = showAllUrls
          ? "Show fewer URLs"
          : `Show all URLs (${blockedUrls.length})`;
        showMoreButton.addEventListener("click", function () {
          showAllUrls = !showAllUrls;
          loadBlockedUrls();
        });
        blockedUrlsList.appendChild(showMoreButton);
      }
    });
  }

  // Function to load and display blocked URL logs
  function loadBlockedLogs() {
    // Request logs from background script
    chrome.runtime.sendMessage(
      { action: "getBlockedUrlLogs" },
      function (response) {
        const logs = response.logs || [];

        // Clear current logs
        logsContainer.innerHTML = "";

        if (logs.length === 0) {
          noLogsMessage.style.display = "block";
          logsContainer.appendChild(noLogsMessage);
          return;
        }

        noLogsMessage.style.display = "none";

        // Add each log entry to the list (most recent first)
        logs
          .slice()
          .reverse()
          .forEach(function (log) {
            const logEntry = document.createElement("div");
            logEntry.className = "log-entry";

            const logTime = document.createElement("span");
            logTime.className = "log-time";

            // Format timestamp
            const timestamp = new Date(log.timestamp);
            logTime.textContent = formatTimestamp(timestamp);

            const logUrl = document.createElement("span");
            logUrl.className = "log-url";
            logUrl.textContent = log.url;

            logEntry.appendChild(logTime);
            logEntry.appendChild(logUrl);
            logsContainer.appendChild(logEntry);
          });
      }
    );
  }

  // Function to clear blocked URL logs
  function clearBlockedLogs() {
    chrome.storage.local.set({ blockedUrlLogs: [] }, function () {
      loadBlockedLogs();
    });
  }

  // Helper function to format timestamp
  function formatTimestamp(date) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  // Helper function to normalize URL format
  function normalizeUrl(url) {
    // Remove protocol if present
    let normalizedUrl = url.replace(/^(https?:\/\/)?(www\.)?/, "");

    // Remove trailing slash if present
    normalizedUrl = normalizedUrl.replace(/\/$/, "");

    return normalizedUrl;
  }

  // Auto-refresh logs every 5 seconds
  setInterval(loadBlockedLogs, 5000);

  // Handle sidebar navigation
  const sidebarItems = document.querySelectorAll(".sidebar-item");

  sidebarItems.forEach((item) => {
    item.addEventListener("click", function () {
      // Remove active class from all items
      sidebarItems.forEach((i) => i.classList.remove("active"));

      // Add active class to clicked item
      this.classList.add("active");

      // For now, only URL Blocking is implemented
      // In the future, we can use this to show different sections
      const section = this.textContent.trim();

      if (section !== "URL Blocking") {
        alert("This section is not yet implemented.");
      }
    });
  });
});
