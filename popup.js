document.addEventListener("DOMContentLoaded", function () {
  const urlInput = document.getElementById("urlInput");
  const addButton = document.getElementById("addButton");
  const urlList = document.getElementById("urlList");
  const selectorButton = document.getElementById("selectorButton");
  const stopSelectorButton = document.getElementById("stopSelectorButton");

  // URL display configuration
  const MAX_DISPLAYED_URLS = 5;
  let showAllUrls = false;

  // Load blocked URLs when popup opens
  loadBlockedUrls();

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

  // Element selector button
  selectorButton.addEventListener("click", function () {
    // Get active tab
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        // Send message to start selector
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "startSelector" },
          function (response) {
            if (chrome.runtime.lastError) {
              console.log("Error: ", chrome.runtime.lastError.message);
            }

            if (response && response.status === "Selector activated") {
              selectorButton.style.display = "none";
              stopSelectorButton.style.display = "block";
              selectorButton.classList.add("active");
            }
          }
        );

        // Close popup to see the page
        window.close();
      }
    });
  });

  // Stop element selector button
  stopSelectorButton.addEventListener("click", function () {
    // Get active tab
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        // Send message to stop selector
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "stopSelector" },
          function (response) {
            if (response && response.status === "Selector deactivated") {
              selectorButton.style.display = "block";
              stopSelectorButton.style.display = "none";
              selectorButton.classList.remove("active");
            }
          }
        );
      }
    });
  });

  // Function to add URL to block list
  function addUrlToBlockList(url) {
    // Normalize URL format (remove http://, https://, www. if present)
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
      urlList.innerHTML = "";

      if (blockedUrls.length === 0) {
        urlList.innerHTML =
          '<p style="color: #666; font-style: italic;">No URLs blocked yet.</p>';
        return;
      }

      // Determine how many URLs to show
      const displayedUrls = showAllUrls
        ? blockedUrls
        : blockedUrls.slice(0, MAX_DISPLAYED_URLS);

      // Add each URL to the list
      displayedUrls.forEach(function (url) {
        const urlItem = document.createElement("div");
        urlItem.className = "url-item";

        const urlText = document.createElement("span");
        urlText.textContent = url;

        const removeButton = document.createElement("button");
        removeButton.className = "remove-btn";
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", function () {
          removeUrlFromBlockList(url);
        });

        urlItem.appendChild(urlText);
        urlItem.appendChild(removeButton);
        urlList.appendChild(urlItem);
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
        urlList.appendChild(showMoreButton);
      }
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
});
