# Screenshot Clipboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably copy captured PNG screenshots to the system clipboard through an MV3 offscreen document.

**Architecture:** `content.js` captures the image and requests clipboard writing through the background service worker. `background.js` creates/reuses `offscreen.html`, forwards the PNG data URL, and returns the result. `offscreen.js` performs `navigator.clipboard.write()` and responds with success or failure; content keeps the existing download fallback.

**Tech Stack:** Chrome Manifest V3, vanilla JavaScript, Web Clipboard API, Node.js VM-based regression tests.

---

### Task 1: Add a failing clipboard contract test

**Files:**
- Create: `tests/clipboard-contract.test.js`

- [ ] **Step 1: Write the failing test**

Create a Node test that loads `background.js` in a VM with mocked Chrome APIs, sends an `EP_COPY_IMAGE_TO_CLIPBOARD` message, and asserts the worker creates the offscreen document, sends the offscreen message, and returns `{ ok: true }`. Also assert an offscreen `{ ok: false }` response is passed through as failure.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test tests/clipboard-contract.test.js
```

Expected: FAIL because `background.js` does not yet register the image clipboard message or create an offscreen document.

### Task 2: Implement the offscreen clipboard writer

**Files:**
- Create: `offscreen.html`
- Create: `offscreen.js`
- Modify: `manifest.json`

- [ ] **Step 1: Add the offscreen document declaration**

Add the `offscreen` permission and keep the document minimal:

```json
"permissions": ["activeTab", "scripting", "storage", "clipboardWrite", "offscreen"]
```

```html
<!doctype html>
<html><body><script src="offscreen.js"></script></body></html>
```

- [ ] **Step 2: Add the clipboard message handler**

In `offscreen.js`, listen for `EP_OFFSCREEN_COPY_IMAGE`, reject missing data, convert the data URL to a Blob, write an `image/png` `ClipboardItem` with `navigator.clipboard.write()`, and always respond with `{ ok: true }` or `{ ok: false, error: ... }`. Return `true` from the listener so asynchronous responses stay open, and ignore messages not targeted at the offscreen document.

- [ ] **Step 3: Run the regression test**

Run:

```bash
node --test tests/clipboard-contract.test.js
```

Expected: still FAIL only because the background routing is not implemented; the test must load the new offscreen contract without syntax errors.

### Task 3: Route image writes through the service worker

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Add serialized offscreen-document creation**

Implement `setupOffscreenDocument()` using `chrome.runtime.getContexts()` and `chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["CLIPBOARD"], justification: "Copy captured screenshots to the system clipboard." })`, with a shared `creating` promise to prevent concurrent creation races.

- [ ] **Step 2: Add the message route**

Handle `EP_COPY_IMAGE_TO_CLIPBOARD` by ensuring the offscreen document exists, sending `{ type: "EP_OFFSCREEN_COPY_IMAGE", dataUrl: msg.dataUrl, target: "offscreen" }`, and forwarding the response. Catch setup/send errors and respond with `{ ok: false, error }`; return `true` for the async response.

- [ ] **Step 3: Run the regression test to verify green**

Run:

```bash
node --test tests/clipboard-contract.test.js
```

Expected: PASS for both success and failure forwarding cases.

### Task 4: Update screenshot UI to use the real result

**Files:**
- Modify: `content.js:464-509`

- [ ] **Step 1: Add Blob-to-data-URL conversion**

Add a small Promise helper using `FileReader.readAsDataURL(blob)`.

- [ ] **Step 2: Replace direct image clipboard writing**

After `captureElementsBlob(els)`, convert the Blob to a data URL and send `EP_COPY_IMAGE_TO_CLIPBOARD`. Show “Screenshot copied!” only when the response exists and has `ok: true`. If the response is absent or unsuccessful, use the existing download block and show “Saved as file!”. Remove the content-script `navigator.clipboard.write()` branch so it cannot falsely report success.

- [ ] **Step 3: Preserve all existing capture errors and fallback cleanup**

Keep capture failures as “Capture failed!” and ensure conversion/message failures flow into the download fallback rather than an uncaught rejection.

### Task 5: Validate the complete change

**Files:**
- Verify: `background.js`, `content.js`, `offscreen.js`, `manifest.json`, `tests/clipboard-contract.test.js`

- [ ] **Step 1: Run tests**

```bash
node --test tests/clipboard-contract.test.js
```

- [ ] **Step 2: Validate JavaScript syntax**

```bash
node --check background.js
node --check content.js
node --check offscreen.js
```

- [ ] **Step 3: Manually verify in Chrome**

Load the `element-picker` directory as an unpacked extension, select an element, click Screenshot, paste into a native text/image-capable app, and confirm the PNG appears. Then test a denied/unavailable clipboard path and confirm a PNG download occurs instead of a false success message.
