chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "EP_OFFSCREEN_COPY_IMAGE" || msg.target !== "offscreen") {
    return false;
  }

  copyImageToClipboard(msg.dataUrl)
    .then(() => sendResponse({ ok: true }))
    .catch(error => sendResponse({
      ok: false,
      error: error && error.message ? error.message : String(error)
    }));

  return true;
});

async function copyImageToClipboard(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") {
    throw new Error("Missing screenshot data");
  }
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error("Image clipboard is unavailable");
  }

  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`Unable to read screenshot data (${response.status})`);
  }
  const blob = await response.blob();
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob })
  ]);
}
