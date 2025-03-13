document.addEventListener('DOMContentLoaded', function() {
  const urlInput = document.getElementById('urlInput');
  const addButton = document.getElementById('addButton');
  const blockedUrlsList = document.getElementById('blockedUrlsList');
  const logsContainer = document.getElementById('logsContainer');
  const refreshButton = document.getElementById('refreshButton');
  const clearLogsButton = document.getElementById('clearLogsButton');
  const noLogsMessage = document.getElementById('noLogsMessage');
  
  // Load blocked URLs and logs when panel opens
  loadBlockedUrls();
  loadBlockedLogs();
  
  // Add URL to block list
  addButton.addEventListener('click', function() {
    const url = urlInput.value.trim();
    if (url) {
      addUrlToBlockList(url);
      urlInput.value = '';
    }
  });
  
  // Allow Enter key to add URL
  urlInput.addEventListener('keyup', function(event) {
    if (event.key === 'Enter') {
      addButton.click();
    }
  });
  
  // Refresh logs button
  refreshButton.addEventListener('click', function() {
    loadBlockedLogs();
  });
  
  // Clear logs button
  clearLogsButton.addEventListener('click', function() {
    clearBlockedLogs();
  });
  
  // Function to add URL to block list
  function addUrlToBlockList(url) {
    // Normalize URL format
    const normalizedUrl = normalizeUrl(url);
    
    // Get current blocked URLs
    chrome.storage.local.get(['blockedUrls'], function(result) {
      const blockedUrls = result.blockedUrls || [];
      
      // Check if URL is already in the list
      if (blockedUrls.includes(normalizedUrl)) {
        alert('This URL is already blocked.');
        return;
      }
      
      // Add URL to the list
      blockedUrls.push(normalizedUrl);
      
      // Save updated list
      chrome.storage.local.set({blockedUrls: blockedUrls}, function() {
        // Update UI
        loadBlockedUrls();
      });
    });
  }
  
  // Function to remove URL from block list
  function removeUrlFromBlockList(url) {
    chrome.storage.local.get(['blockedUrls'], function(result) {
      const blockedUrls = result.blockedUrls || [];
      const updatedList = blockedUrls.filter(item => item !== url);
      
      chrome.storage.local.set({blockedUrls: updatedList}, function() {
        // Update UI
        loadBlockedUrls();
      });
    });
  }
  
  // Function to load and display blocked URLs
  function loadBlockedUrls() {
    chrome.storage.local.get(['blockedUrls'], function(result) {
      const blockedUrls = result.blockedUrls || [];
      
      // Clear current list
      blockedUrlsList.innerHTML = '';
      
      if (blockedUrls.length === 0) {
        blockedUrlsList.innerHTML = '<p>No URLs blocked yet.</p>';
        return;
      }
      
      // Add each URL to the list
      blockedUrls.forEach(function(url) {
        const urlTag = document.createElement('div');
        urlTag.className = 'url-tag';
        
        const urlText = document.createElement('span');
        urlText.textContent = url;
        
        const removeButton = document.createElement('button');
        removeButton.innerHTML = '&times;';
        removeButton.title = 'Remove';
        removeButton.addEventListener('click', function() {
          removeUrlFromBlockList(url);
        });
        
        urlTag.appendChild(urlText);
        urlTag.appendChild(removeButton);
        blockedUrlsList.appendChild(urlTag);
      });
    });
  }
  
  // Function to load and display blocked URL logs
  function loadBlockedLogs() {
    // Request logs from background script
    chrome.runtime.sendMessage({action: 'getBlockedUrlLogs'}, function(response) {
      const logs = response.logs || [];
      
      // Clear current logs
      logsContainer.innerHTML = '';
      
      if (logs.length === 0) {
        noLogsMessage.style.display = 'block';
        logsContainer.appendChild(noLogsMessage);
        return;
      }
      
      noLogsMessage.style.display = 'none';
      
      // Add each log entry to the list (most recent first)
      logs.slice().reverse().forEach(function(log) {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        const logTime = document.createElement('span');
        logTime.className = 'log-time';
        
        // Format timestamp
        const timestamp = new Date(log.timestamp);
        logTime.textContent = formatTimestamp(timestamp);
        
        const logUrl = document.createElement('span');
        logUrl.className = 'log-url';
        logUrl.textContent = log.url;
        
        logEntry.appendChild(logTime);
        logEntry.appendChild(logUrl);
        logsContainer.appendChild(logEntry);
      });
    });
  }
  
  // Function to clear blocked URL logs
  function clearBlockedLogs() {
    chrome.storage.local.set({blockedUrlLogs: []}, function() {
      loadBlockedLogs();
    });
  }
  
  // Helper function to format timestamp
  function formatTimestamp(date) {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  
  // Helper function to normalize URL format
  function normalizeUrl(url) {
    // Remove protocol if present
    let normalizedUrl = url.replace(/^(https?:\/\/)?(www\.)?/, '');
    
    // Remove trailing slash if present
    normalizedUrl = normalizedUrl.replace(/\/$/, '');
    
    return normalizedUrl;
  }
  
  // Auto-refresh logs every 5 seconds
  setInterval(loadBlockedLogs, 5000);
});
