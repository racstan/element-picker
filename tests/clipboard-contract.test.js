const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadBackground({ offscreenResponse = { ok: true } } = {}) {
  let messageListener;
  const calls = [];
  const chrome = {
    action: {
      setIcon() {},
      setBadgeText() {},
      setBadgeBackgroundColor() {},
      onClicked: { addListener() {} }
    },
    commands: { onCommand: { addListener() {} } },
    tabs: {
      query() {},
      sendMessage() {},
      onUpdated: { addListener() {} },
      captureVisibleTab() {}
    },
    scripting: { insertCSS() {}, executeScript() {} },
    runtime: {
      lastError: null,
      getURL: path => `chrome-extension://test/${path}`,
      getContexts: async () => [],
      sendMessage(message, callback) {
        calls.push({ type: "sendMessage", message });
        callback(offscreenResponse);
      },
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        }
      }
    },
    offscreen: {
      createDocument: async options => calls.push({ type: "createDocument", options })
    }
  };

  vm.runInNewContext(fs.readFileSync("background.js", "utf8"), {
    chrome,
    console,
    setTimeout
  });

  return { calls, messageListener };
}

function sendImageMessage(message) {
  return new Promise((resolve, reject) => {
    const result = message.listener(message.payload, {}, response => resolve(response));
    if (result !== true) reject(new Error("clipboard message must stay open asynchronously"));
  });
}

test("routes screenshot PNG data to the offscreen clipboard writer", async () => {
  const loaded = loadBackground();
  const response = await sendImageMessage({
    listener: loaded.messageListener,
    payload: { type: "EP_COPY_IMAGE_TO_CLIPBOARD", dataUrl: "data:image/png;base64,AAA" }
  });

  assert.deepEqual(response, { ok: true });
  assert.equal(loaded.calls[0].type, "createDocument");
  assert.equal(loaded.calls[1].type, "sendMessage");
  assert.equal(loaded.calls[1].message.type, "EP_OFFSCREEN_COPY_IMAGE");
  assert.equal(loaded.calls[1].message.target, "offscreen");
  assert.equal(loaded.calls[1].message.dataUrl, "data:image/png;base64,AAA");
});

test("forwards clipboard failure instead of reporting success", async () => {
  const loaded = loadBackground({ offscreenResponse: { ok: false, error: "denied" } });
  const response = await sendImageMessage({
    listener: loaded.messageListener,
    payload: { type: "EP_COPY_IMAGE_TO_CLIPBOARD", dataUrl: "data:image/png;base64,AAA" }
  });

  assert.deepEqual(response, { ok: false, error: "denied" });
});
