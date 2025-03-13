// Initialize default settings if not already set
chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get(["blockedUrls"], function (result) {
    if (!result.blockedUrls) {
      chrome.storage.local.set({ blockedUrls: [] });
    } else {
      // If there are already blocked URLs, update the declarative rules
      updateBlockRules(result.blockedUrls);
    }
  });
});

// Listen for changes to the blocked URLs list
chrome.storage.onChanged.addListener(function (changes, namespace) {
  if (namespace === "local" && changes.blockedUrls) {
    updateBlockRules(changes.blockedUrls.newValue);
  }
});

// Function to update the declarative net request rules based on blocked URLs
async function updateBlockRules(blockedUrls) {
  try {
    // First, remove all existing rules
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: await getExistingRuleIds(),
    });

    // Create new rules for each blocked URL
    if (blockedUrls && blockedUrls.length > 0) {
      const newRules = blockedUrls.map((url, index) => ({
        id: index + 1, // Rule IDs must be > 0
        priority: 1,
        action: {
          type: "block",
        },
        condition: {
          urlFilter: url,
          resourceTypes: [
            "main_frame",
            "sub_frame",
            "stylesheet",
            "script",
            "image",
            "font",
            "object",
            "xmlhttprequest",
            "ping",
            "csp_report",
            "media",
            "websocket",
            "other",
          ],
        },
      }));

      // Add the new rules
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: newRules,
      });
    }
  } catch (error) {
    console.error("Error updating blocking rules:", error);
  }
}

// Helper function to get existing rule IDs
async function getExistingRuleIds() {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  return rules.map((rule) => rule.id);
}

// Function to track blocked requests for logging
chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(function (info) {
  // Log the blocked request
  logBlockedUrl(info.request.url);
});

// Function to log blocked URLs for the devtools panel
function logBlockedUrl(url) {
  chrome.storage.local.get(["blockedUrlLogs"], function (result) {
    const blockedUrlLogs = result.blockedUrlLogs || [];

    // Add timestamp and URL to logs
    blockedUrlLogs.push({
      timestamp: new Date().toISOString(),
      url: url,
    });

    // Limit log size (keep last 100 entries)
    if (blockedUrlLogs.length > 100) {
      blockedUrlLogs.shift();
    }

    // Save updated logs
    chrome.storage.local.set({ blockedUrlLogs: blockedUrlLogs });
  });
}

// Listen for messages from devtools panel
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === "getBlockedUrlLogs") {
    // Send blocked URL logs to devtools panel
    chrome.storage.local.get(["blockedUrlLogs"], function (result) {
      sendResponse({ logs: result.blockedUrlLogs || [] });
    });
    return true; // Keep message channel open for async response
  }
});
