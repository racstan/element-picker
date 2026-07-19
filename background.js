// Toggles the picker on the active tab, either via toolbar icon or keyboard shortcut.
// Content scripts only auto-inject on page load. If the tab was already open when the
// extension was installed/reloaded, or navigation happened client-side (SPA routing,
// common in Next.js/Vite apps), there's no listener on the other end yet. So: try
// messaging first, and if that fails because there's no receiver, inject the script
// programmatically and retry — instead of silently doing nothing.

const ICONS = {
  red: { 16: "icons/red/icon16.png", 48: "icons/red/icon48.png", 128: "icons/red/icon128.png" },
  green: { 16: "icons/green/icon16.png", 48: "icons/green/icon48.png", 128: "icons/green/icon128.png" }
};

function setIconForTab(tabId, active) {
  chrome.action.setIcon({ tabId, path: active ? ICONS.green : ICONS.red });
}

function toggleOnActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id) return;

    if (tab.url && (tab.url.startsWith("chrome://") || tab.url.startsWith("https://chrome.google.com/webstore"))) {
      console.warn("[Element Picker] Can't run on this page:", tab.url);
      flashBadge("!", "#ef4444");
      return;
    }

    sendToggle(tab.id);
  });
}

function sendToggle(tabId) {
  chrome.tabs.sendMessage(tabId, { type: "EP_TOGGLE" }, (response) => {
    if (chrome.runtime.lastError) {
      // No content script listening yet — inject it now, then send the toggle.
      chrome.scripting.insertCSS(
        { target: { tabId }, files: ["content.css"] },
        () => void chrome.runtime.lastError
      );
      chrome.scripting.executeScript(
        { target: { tabId }, files: ["content.js"] },
        () => {
          if (chrome.runtime.lastError) {
            console.warn("[Element Picker] Injection failed:", chrome.runtime.lastError.message);
            flashBadge("!", "#ef4444");
            return;
          }
          chrome.tabs.sendMessage(tabId, { type: "EP_TOGGLE" }, (res) => {
            if (!chrome.runtime.lastError && res) setIconForTab(tabId, res.active);
          });
        }
      );
      return;
    }
    if (response) setIconForTab(tabId, response.active);
  });
}

function flashBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
}

chrome.action.onClicked.addListener(toggleOnActiveTab);

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-picker") {
    toggleOnActiveTab();
  }
});

// Reset icon to red whenever a tab reloads/navigates — content script state resets too,
// so the icon should never show stale "green" after a page reload.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    setIconForTab(tabId, false);
  }
});
