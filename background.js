// Initialize default settings if not already set
chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.local.get(['blockedUrls'], function(result) {
    if (!result.blockedUrls) {
      chrome.storage.local.set({blockedUrls: []});
    }
  });
});

// Function to check if a URL should be blocked
function shouldBlockUrl(url, blockedUrls) {
  // Normalize the URL to check
  const urlToCheck = new URL(url);
  const hostname = urlToCheck.hostname.replace(/^www\./, '');
  
  // Check if any blocked URL is contained in the current URL
  return blockedUrls.some(blockedUrl => {
    // Handle URLs with or without www.
    return hostname === blockedUrl || hostname.endsWith('.' + blockedUrl);
  });
}

// Set up a listener for webRequest
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    return new Promise(resolve => {
      chrome.storage.local.get(['blockedUrls'], function(result) {
        const blockedUrls = result.blockedUrls || [];
        
        if (shouldBlockUrl(details.url, blockedUrls)) {
          // Log blocked URL for devtools panel
          logBlockedUrl(details.url);
          
          // Block the request
          resolve({cancel: true});
        } else {
          // Allow the request
          resolve({cancel: false});
        }
      });
    });
  },
  {urls: ["<all_urls>"]},
  ["blocking"]
);

// Function to log blocked URLs for the devtools panel
function logBlockedUrl(url) {
  chrome.storage.local.get(['blockedUrlLogs'], function(result) {
    const blockedUrlLogs = result.blockedUrlLogs || [];
    
    // Add timestamp and URL to logs
    blockedUrlLogs.push({
      timestamp: new Date().toISOString(),
      url: url
    });
    
    // Limit log size (keep last 100 entries)
    if (blockedUrlLogs.length > 100) {
      blockedUrlLogs.shift();
    }
    
    // Save updated logs
    chrome.storage.local.set({blockedUrlLogs: blockedUrlLogs});
  });
}

// Listen for messages from devtools panel
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'getBlockedUrlLogs') {
    // Send blocked URL logs to devtools panel
    chrome.storage.local.get(['blockedUrlLogs'], function(result) {
      sendResponse({logs: result.blockedUrlLogs || []});
    });
    return true; // Keep message channel open for async response
  }
});
