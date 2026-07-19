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
  chrome.action.setIcon({ tabId, path: active ? ICONS.green : ICONS.red }, () => {
    if (chrome.runtime.lastError) {
      // Ignore: Tab was likely closed before the icon could be updated
    }
  });
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

let offscreenCreating;
let clipboardQueue = Promise.resolve();

async function setupOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL("offscreen.html");
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) return;

  if (!offscreenCreating) {
    offscreenCreating = chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["CLIPBOARD"],
      justification: "Copy captured screenshots to the system clipboard."
    }).finally(() => {
      offscreenCreating = null;
    });
  }

  await offscreenCreating;
}

function copyImageToClipboard(dataUrl) {
  const operation = clipboardQueue.then(() => performImageClipboardCopy(dataUrl));
  clipboardQueue = operation.catch(() => {});
  return operation;
}

async function performImageClipboardCopy(dataUrl) {
  await setupOffscreenDocument();

  try {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "EP_OFFSCREEN_COPY_IMAGE",
        target: "offscreen",
        dataUrl
      }, response => {
        if (chrome.runtime.lastError || !response) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError
              ? chrome.runtime.lastError.message
              : "No clipboard response"
          });
        } else {
          resolve(response);
        }
      });
    });
  } finally {
    if (chrome.offscreen && chrome.offscreen.closeDocument) {
      await chrome.offscreen.closeDocument().catch(() => {});
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "EP_CAPTURE_TAB") {
    const windowId = (sender && sender.tab) ? sender.tab.windowId : null;
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error("[Element Picker] captureVisibleTab failed:", chrome.runtime.lastError.message);
        // Fallback to null (current window) if the window ID was invalid
        chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl2) => {
          if (chrome.runtime.lastError) {
            console.error("[Element Picker] captureVisibleTab fallback failed:", chrome.runtime.lastError.message);
            sendResponse(null);
          } else {
            sendResponse(dataUrl2);
          }
        });
      } else {
        sendResponse(dataUrl);
      }
    });
    return true;
  }

  if (msg.type === "EP_COPY_IMAGE_TO_CLIPBOARD") {
    copyImageToClipboard(msg.dataUrl)
      .then(sendResponse)
      .catch(error => sendResponse({
        ok: false,
        error: error && error.message ? error.message : String(error)
      }));
    return true;
  }
});
