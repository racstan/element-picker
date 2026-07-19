chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "EP_OFFSCREEN_COPY_IMAGE") {
    copyToClipboard(msg.dataUrl).then(() => {
      sendResponse({ ok: true });
    }).catch(err => {
      console.error("Offscreen clipboard error:", err);
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }
});

async function copyToClipboard(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => {
      document.body.appendChild(img);
      
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNode(img);
      selection.removeAllRanges();
      selection.addRange(range);
      
      let success = false;
      try {
        success = document.execCommand("copy");
      } catch (e) {
        success = false;
      }
      
      selection.removeAllRanges();
      document.body.removeChild(img);
      
      if (success) {
        resolve();
      } else {
        reject(new Error("execCommand('copy') failed"));
      }
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}
