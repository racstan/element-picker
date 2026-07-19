const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const contentSource = fs.readFileSync(
  require("node:path").join(__dirname, "..", "content.js"),
  "utf8"
);

test("picker ignores every extension UI surface during element picking", () => {
  for (const selector of [
    ".ep-shell",
    ".ep-hover-box",
    ".ep-select-box",
  ]) {
    assert.match(contentSource, new RegExp(selector.replace(/[.-]/g, "\\$&")));
  }

  assert.match(contentSource, /function isExtensionUiTarget\(target\)/);
  assert.match(contentSource, /function isEnhancedOverlayTarget\(target\)/);
  assert.match(contentSource, /if \(isExtensionUiTarget\(e\.target\)\) return;/);
  assert.match(contentSource, /if \(isExtensionUiTarget\(el\)\) return;/);
});

test("enhanced overlay controls remain available for selecting their page target", () => {
  assert.match(
    contentSource,
    /function isEnhancedOverlayTarget\(target\)[\s\S]*?\.ep-ancestor-box, \.ep-descendant-box/
  );
});

test("picker ignores synthetic clicks from screenshot/download actions", () => {
  assert.match(contentSource, /if \(!e\.isTrusted\) return;/);
});
