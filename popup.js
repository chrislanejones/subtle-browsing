document.addEventListener("DOMContentLoaded", function () {
  const urlInput = document.getElementById("urlInput");
  const addButton = document.getElementById("addButton");
  const urlList = document.getElementById("urlList");

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

      // Add each URL to the list
      blockedUrls.forEach(function (url) {
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
