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
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const item = new ClipboardItem({ "image/png": blob });
  await navigator.clipboard.write([item]);
}
