(() => {
  // Guard against double-injection (e.g. if the script somehow runs twice).
  if (window.__elementPickerInstalled) return;
  window.__elementPickerInstalled = true;

  // getReactInfo communicates with inject.js running in the MAIN world.

  function getReactInfo(el) {
    return new Promise(resolve => {
      const id = Math.random().toString(36).substr(2, 9);
      el.setAttribute("data-ep-temp", id);
      
      let timer;
      const listener = (e) => {
        if (e.data.type === "EP_RES_REACT_INFO" && e.data.id === id) {
          if (timer) clearTimeout(timer);
          window.removeEventListener("message", listener);
          el.removeAttribute("data-ep-temp");
          resolve({ compName: e.data.compName, source: e.data.source });
        }
      };
      window.addEventListener("message", listener);
      window.postMessage({ type: "EP_REQ_REACT_INFO", id }, "*");
      
      timer = setTimeout(() => {
        window.removeEventListener("message", listener);
        el.removeAttribute("data-ep-temp");
        resolve({ compName: null, source: null });
      }, 500);
    });
  }
  // ---------------------------------------

  let active = false;

  let multiSelect = true;     // multi-select vs single-select mode
  let targetMode = "aiPrompt";
  let cleanMode = false;
  let panelExpanded = false;
  let hoverEl = null;         // the primary hovered element (under the cursor)
  const selected = new Map(); // el -> { id }

  // ---------- overlay elements ----------
  const hoverBox = document.createElement("div");
  hoverBox.className = "ep-hover-box";
  const hoverLabel = document.createElement("div");
  hoverLabel.className = "ep-hover-label";
  const hoverCode = document.createElement("div");
  hoverCode.className = "ep-hover-code";
  hoverBox.appendChild(hoverLabel);
  hoverBox.appendChild(hoverCode);


  function positionBox(box, el) {
    const rect = el.getBoundingClientRect();
    box.style.top = `${rect.top + window.scrollY}px`;
    box.style.left = `${rect.left + window.scrollX}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    if (rect.left > window.innerWidth - 150) {
      box.classList.add("ep-align-right");
    } else {
      box.classList.remove("ep-align-right");
    }
  }

  const panel = document.createElement("div");
  panel.className = "ep-shell";
  panel.innerHTML = `
    <div class="ep-panel-content" style="display: none;">
      <div class="ep-mode-row">
        <button class="ep-mode-btn ep-mode-active" data-mode="multi">Multi-select</button>
        <button class="ep-mode-btn" data-mode="single">Single-select</button>
        <label class="ep-toolbar-toggle" style="margin-left:auto;" title="Hide hover boxes (click directly selects)">
          <span class="ep-switch">
            <input type="checkbox" class="ep-clean-mode-checkbox" />
            <span class="ep-switch-track"><span class="ep-switch-thumb"></span></span>
          </span>
          <span style="font-size: 11px; margin-left: 6px; font-weight: 500;">Clean Mode</span>
        </label>
      </div>



      <div class="ep-panel-list"></div>
      <div class="ep-panel-empty">Click any element on the page to select it.</div>
      
      <div class="ep-panel-actions">
        <select class="ep-target-select ep-btn" title="Selection Mode">
          <optgroup label="AI Assistant">
            <option value="aiPrompt">For AI (Prompt + Context)</option>
          </optgroup>
          <optgroup label="Formatted">
            <option value="both">Element + Text (Markdown)</option>
            <option value="minimal">Minimal (Tag + Selector)</option>
          </optgroup>
          <optgroup label="Raw Data">
            <option value="outerHtml">Outer HTML</option>
            <option value="innerHtml">Inner HTML</option>
            <option value="selector">CSS Selector</option>
            <option value="jsPath">JS Path</option>
            <option value="xpath">XPath</option>
            <option value="fullXpath">Full XPath</option>
            <option value="css">Computed CSS</option>
            <option value="text">Text Content</option>
          </optgroup>
        </select>
        <button class="ep-btn ep-btn-ghost" data-action="clear">Delete all</button>
      </div>
      <div class="ep-panel-hint">Click to select &middot; click again to deselect &middot; Esc to exit</div>
    </div>

    <div class="ep-toolbar">
      <div class="ep-drag-handle" title="Drag to move">
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
          <circle cx="2" cy="2" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="2" cy="14" r="1.5"/>
          <circle cx="8" cy="2" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
        </svg>
      </div>
      <select class="ep-bottom-label" disabled>
        <option>No element selected</option>
      </select>
      


      <div class="ep-toolbar-divider"></div>

      <button class="ep-btn ep-btn-primary" id="ep-bottom-copy" disabled>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        Copy Code
      </button>
      <button class="ep-btn ep-btn-primary" id="ep-bottom-screenshot" disabled>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
        Screenshot
      </button>
      <button class="ep-btn ep-btn-ghost" id="ep-bottom-clear" disabled>
        Clear
      </button>

      <div class="ep-toolbar-divider"></div>

      <button class="ep-icon-btn ep-toggle-panel-btn" data-action="toggle-panel" title="Toggle Panel" style="transform: rotate(180deg)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
      </button>
      <button class="ep-icon-btn" data-action="close" title="Turn off picker">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  `;

  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let initialLeft = 0, initialTop = 0;

  function mount() {
    if (!document.body) {
      setTimeout(mount, 50);
      return;
    }
    document.body.appendChild(hoverBox);
    document.body.appendChild(panel);

    const dragHandle = panel.querySelector(".ep-drag-handle");
    dragHandle.addEventListener("mousedown", (e) => {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = panel.getBoundingClientRect();
      panel.style.transform = "none";
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.bottom = "auto";
      panel.style.right = "auto";
      initialLeft = rect.left;
      initialTop = rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      panel.style.left = `${initialLeft + dx}px`;
      panel.style.top = `${initialTop + dy}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    }, true);

    document.addEventListener("mouseup", () => {
      isDragging = false;
    }, true);

    panel.querySelector("#ep-bottom-copy").addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await copyAllSelected();
    });

    panel.querySelector("#ep-bottom-screenshot").addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await captureAllScreenshots();
    });

    panel.querySelector("#ep-bottom-clear").addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      clearAllSelected();
    });
  }

  function clearAllSelected() {
    selected.clear();
    renderList();
    renderSelectionBoxes();
    updateBottomToolbar();
  }

  // ---------- helpers ----------
  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      let selector = node.nodeName.toLowerCase();
      if (node.id) {
        selector += `#${node.id}`;
        parts.unshift(selector);
        break;
      } else {
        let sibling = node;
        let nth = 1;
        while ((sibling = sibling.previousElementSibling)) {
          if (sibling.nodeName.toLowerCase() === selector) nth++;
        }
        if (nth > 1) selector += `:nth-of-type(${nth})`;
      }
      parts.unshift(selector);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function xPath(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
    if (el.id) return `//*[@id="${el.id}"]`;
    const parts = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      if (current.id) {
        parts.unshift(`//*[@id="${current.id}"]`);
        return parts.join('/');
      }
      let count = 0;
      let index = 0;
      let s = current.parentNode ? current.parentNode.firstChild : null;
      while (s) {
        if (s.nodeType === Node.ELEMENT_NODE && s.nodeName === current.nodeName) {
          count++;
          if (s === current) index = count;
        }
        s = s.nextSibling;
      }
      const tagName = current.nodeName.toLowerCase();
      const pathIndex = count > 1 ? `[${index}]` : '';
      parts.unshift(`${tagName}${pathIndex}`);
      current = current.parentNode;
    }
    return parts.length ? '/' + parts.join('/') : null;
  }

  function fullXPath(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
    const parts = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let count = 0;
      let index = 0;
      let s = current.parentNode ? current.parentNode.firstChild : null;
      while (s) {
        if (s.nodeType === Node.ELEMENT_NODE && s.nodeName === current.nodeName) {
          count++;
          if (s === current) index = count;
        }
        s = s.nextSibling;
      }
      const tagName = current.nodeName.toLowerCase();
      const pathIndex = count > 1 ? `[${index}]` : '';
      parts.unshift(`${tagName}${pathIndex}`);
      current = current.parentNode;
    }
    return parts.length ? '/' + parts.join('/') : null;
  }

  function shortLabel(el) {
    let label = el.tagName.toLowerCase();
    if (el.id) label += `#${el.id}`;
    else if (el.className && typeof el.className === "string" && el.className.trim()) {
      label += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    }
    return label;
  }

  function outerHtmlTrimmed(el, maxLen = 4000) {
    const html = el.outerHTML || "";
    return html.length > maxLen ? html.slice(0, maxLen) + "\n<!-- truncated -->" : html;
  }

  function computedCssText(el, onlyMeaningful = true) {
    const cs = getComputedStyle(el);
    const lines = [];
    const skipDefaults = new Set(["none", "auto", "normal", "0px", "rgba(0, 0, 0, 0)", "visible"]);
    for (const prop of cs) {
      const val = cs.getPropertyValue(prop);
      if (onlyMeaningful && skipDefaults.has(val)) continue;
      lines.push(`  ${prop}: ${val};`);
    }
    return `${cssPath(el)} {\n${lines.join("\n")}\n}`;
  }

  async function buildElementBlock(el, i) {
    let nodesToCopy = [el];

    if (targetMode === "aiPrompt") {
      const info = await getReactInfo(el);
      let block = [];
      block.push(`### Element ${i !== undefined ? i + 1 : 1}: ${shortLabel(el)}`);
      block.push(`The user is pasting contextual information regarding where they are about to suggest a change.`);
      block.push(`**Page URL:** ${location.href}`);
      if (info.compName) {
        block.push(`**React Component:** \`${info.compName}\``);
      }
      if (info.source && info.source.fileName) {
        let file = info.source.fileName.replace(/^webpack:\/\/\//, '');
        block.push(`**Source File:** \`${file}:${info.source.lineNumber}\``);
      }
      block.push(`**Selector:** \`${cssPath(el)}\``);
      block.push(``);
      block.push(`**Action needed:**`);
      block.push(`[Describe what you want the AI to fix or change here]`);
      return block.join("\n");
    }

    if (targetMode === "minimal") {
      return nodesToCopy.map(n => {
        let tag = n.tagName.toLowerCase();
        let id = n.id ? `#${n.id}` : "";
        let cls = (n.className && typeof n.className === "string") ? "." + n.className.trim().replace(/\s+/g, ".") : "";
        return `<${tag}${id}${cls}> (Selector: ${cssPath(n)})`;
      }).join("\n");
    }

    if (targetMode === "outerHtml") {
      return nodesToCopy.map(n => outerHtmlTrimmed(n, 2000)).join("\n\n");
    }

    if (targetMode === "innerHtml") {
      return nodesToCopy.map(n => n.innerHTML.trim()).join("\n\n");
    }

    if (targetMode === "selector") {
      return nodesToCopy.map(n => cssPath(n)).join("\n\n");
    }

    if (targetMode === "xpath") {
      return nodesToCopy.map(n => xPath(n)).join("\n\n");
    }

    if (targetMode === "fullXpath") {
      return nodesToCopy.map(n => fullXPath(n)).join("\n\n");
    }

    if (targetMode === "css") {
      return nodesToCopy.map(n => computedCssText(n)).join("\n\n");
    }

    if (targetMode === "jsPath") {
      return nodesToCopy.map(n => `document.querySelector("${cssPath(n)}")`).join("\n");
    }

    if (targetMode === "text") {
      return nodesToCopy.map(n => (n.innerText || "").trim()).filter(Boolean).join("\n\n");
    }

    const rect = el.getBoundingClientRect();
    let block = [
      `### Element ${i !== undefined ? i + 1 : 1}: ${shortLabel(el)}`,
      `Selector: ${cssPath(el)}`,
      `Size: ${Math.round(rect.width)}x${Math.round(rect.height)}px`,
      ``
    ];

    let htmlContent = nodesToCopy.map(n => outerHtmlTrimmed(n, 2000)).join("\n\n");
    let cssContent = nodesToCopy.map(n => computedCssText(n)).join("\n\n");
    block.push(`HTML:`, "```html\n" + htmlContent + "\n```", ``);
    block.push(`Key computed styles:`, "```css\n" + cssContent + "\n```", ``);
    
    let textContent = nodesToCopy.map(n => (n.innerText || "").trim()).join("\n\n");
    block.push(`Text Content:`, "```text\n" + textContent + "\n```", ``);
    
    return block.join("\n");
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Failed to read screenshot"));
      reader.readAsDataURL(blob);
    });
  }

  function requestImageClipboard(dataUrl) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "EP_COPY_IMAGE_TO_CLIPBOARD",
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
  }

  function flashPanelMessage(msg) {
    const hint = panel.querySelector(".ep-panel-hint");
    const original = hint.textContent;
    hint.textContent = msg;
    hint.classList.add("ep-flash");
    setTimeout(() => {
      hint.textContent = original;
      hint.classList.remove("ep-flash");
    }, 1400);
  }

  async function copyAllSelected() {
    const els = Array.from(selected.keys());
    if (els.length === 0) {
      flashPanelMessage("No elements selected.");
      return;
    }
    const separator = (targetMode === "both" || targetMode === "aiPrompt") ? "\n\n---\n\n" : "\n\n";
    const blocks = await Promise.all(els.map((el, i) => buildElementBlock(el, i)));
    const text = blocks.join(separator);
    const ok = await copyToClipboard(text);
    flashPanelMessage(ok ? (els.length > 1 ? "All copied!" : "Copied!") : "Copy failed.");
  }

  async function copyOrDownloadScreenshot(els) {
    if (!els || els.length === 0) {
      flashPanelMessage("No elements to capture.");
      return;
    }

    let blob;
    try {
      blob = await captureElementsBlob(els);
    } catch (captureErr) {
      console.error("Capture error:", captureErr);
      flashPanelMessage("Capture failed!");
      return;
    }

    // Try clipboard locally first. If capture took < 1s, the user gesture is still active!
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([
          new window.ClipboardItem({ "image/png": blob })
        ]);
        flashPanelMessage(els.length > 1 ? "Screenshots copied!" : "Screenshot copied!");
        return;
      } catch (clipErr) {
        console.warn("Local clipboard write failed, trying offscreen document:", clipErr);
      }
    }

    // Try offscreen document as secondary clipboard fallback
    try {
      const clipboardResult = await requestImageClipboard(await blobToDataUrl(blob));
      if (clipboardResult && clipboardResult.ok) {
        flashPanelMessage(els.length > 1 ? "Screenshots copied!" : "Screenshot copied!");
        return;
      }
      console.warn("Offscreen clipboard failed, falling back to download:", clipboardResult && clipboardResult.error);
    } catch (offscreenErr) {
      console.warn("Offscreen clipboard error, falling back to download:", offscreenErr);
    }

    // Fallback: save as file using background downloads API which is extremely robust and bypasses size limits
    try {
      const dataUrl = await blobToDataUrl(blob);
      const filename = els.length > 1
        ? `ep-screenshots-${Date.now()}.png`
        : `ep-screenshot-${Date.now()}.png`;
      chrome.runtime.sendMessage({
        type: "EP_DOWNLOAD_IMAGE",
        dataUrl,
        filename
      }, response => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          console.error("Download fallback failed:", chrome.runtime.lastError || (response && response.error));
          flashPanelMessage("Screenshot failed!");
        } else {
          flashPanelMessage("Saved as file!");
        }
      });
    } catch (dlErr) {
      console.error("Download fallback failed:", dlErr);
      flashPanelMessage("Screenshot failed!");
    }
  }

  async function captureAllScreenshots() {
    const els = Array.from(selected.keys());
    await copyOrDownloadScreenshot(els);
  }

  function captureElementsBlob(els) {
    return new Promise(async (resolve, reject) => {
      if (!els || els.length === 0) {
        reject(new Error("No elements to capture"));
        return;
      }

      // Hide UI
      panel.style.display = "none";
      hoverBox.style.display = "none";
      document.querySelectorAll(".ep-select-box").forEach(b => b.style.display = "none");
      clearEnhancedOverlays();

      const croppedCanvases = [];
      const origScroll = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";

      try {
        for (const el of els) {
          el.scrollIntoView({ block: "center", inline: "center" });
          await new Promise(r => setTimeout(r, 150));

          const rect = el.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;

          const dataUrl = await new Promise((resMsg, rejMsg) => {
            chrome.runtime.sendMessage({ type: "EP_CAPTURE_TAB" }, res => {
              if (chrome.runtime.lastError || !res) {
                rejMsg(new Error("Capture failed"));
              } else {
                resMsg(res);
              }
            });
          });

          await new Promise((resImg, rejImg) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const cropX = Math.max(0, rect.left * dpr);
              const cropY = Math.max(0, rect.top * dpr);
              const cropW = Math.min(img.width - cropX, rect.width * dpr);
              const cropH = Math.min(img.height - cropY, rect.height * dpr);

              if (cropW <= 0 || cropH <= 0) {
                resImg();
                return;
              }

              canvas.width = cropW;
              canvas.height = cropH;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
              croppedCanvases.push(canvas);
              resImg();
            };
            img.onerror = () => rejImg(new Error("Image failed to load"));
            img.src = dataUrl;
          });
        }

        document.documentElement.style.scrollBehavior = origScroll;

        if (croppedCanvases.length === 0) {
          throw new Error("No elements were successfully captured");
        }

        // Stitch together
        const gap = 16;
        let totalHeight = 0;
        let maxWidth = 0;

        for (const canvas of croppedCanvases) {
          totalHeight += canvas.height;
          if (canvas.width > maxWidth) {
            maxWidth = canvas.width;
          }
        }
        totalHeight += gap * (croppedCanvases.length - 1);

        const padding = 16;
        const finalWidth = maxWidth + padding * 2;
        const finalHeight = totalHeight + padding * 2;

        const masterCanvas = document.createElement("canvas");
        masterCanvas.width = finalWidth;
        masterCanvas.height = finalHeight;
        const ctx = masterCanvas.getContext("2d");

        ctx.fillStyle = "#f3f4f6";
        ctx.fillRect(0, 0, finalWidth, finalHeight);

        let currentY = padding;
        for (const canvas of croppedCanvases) {
          const xOffset = padding + (maxWidth - canvas.width) / 2;
          
          ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
          ctx.shadowBlur = 8;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 4;
          
          ctx.drawImage(canvas, xOffset, currentY);
          
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          currentY += canvas.height + gap;
        }

        masterCanvas.toBlob(blob => {
          if (active) {
            panel.style.display = "flex";
            renderSelectionBoxes();
          }

          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to generate blob from stitched canvas"));
          }
        }, "image/png");

      } catch (err) {
        document.documentElement.style.scrollBehavior = origScroll;
        if (active) {
          panel.style.display = "flex";
          renderSelectionBoxes();
        }
        reject(err);
      }
    });
  }

  // ---------- selection logic ----------
  function selectElement(el) {
    if (!el || el === document.body || el === document.documentElement) return;
    if (isExtensionUiTarget(el)) return;
    if (selected.has(el)) {
      selected.delete(el);
    } else {
      if (!multiSelect) {
        selected.clear(); // single-select mode: new pick replaces the old one
      }
      selected.set(el, { id: selected.size + 1 });
    }
    renumber();
    renderList();
    renderSelectionBoxes();
    pulseLastSelectionBox();
    updateBottomToolbar();
  }

  function updateBottomToolbar() {
    const els = Array.from(selected.keys());
    const copyBtn = panel.querySelector("#ep-bottom-copy");
    const screenshotBtn = panel.querySelector("#ep-bottom-screenshot");
    const clearBtn = panel.querySelector("#ep-bottom-clear");
    const label = panel.querySelector(".ep-bottom-label");

    if (els.length > 0) {
      label.innerHTML = "";
      label.disabled = false;
      if (els.length === 1) {
        const opt = document.createElement("option");
        opt.textContent = `Selected: ${shortLabel(els[0])}`;
        label.appendChild(opt);
        copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy Code`;
        screenshotBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> Screenshot`;
      } else {
        const headOpt = document.createElement("option");
        headOpt.textContent = `${els.length} selected`;
        label.appendChild(headOpt);
        els.forEach((el, index) => {
          const itemOpt = document.createElement("option");
          itemOpt.textContent = `${index + 1}. ${shortLabel(el)}`;
          label.appendChild(itemOpt);
        });
        
        copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy All`;
        screenshotBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> Screenshot All`;
      }
      copyBtn.disabled = false;
      screenshotBtn.disabled = false;
      if (clearBtn) clearBtn.disabled = false;
    } else {
      label.innerHTML = `<option>No element selected</option>`;
      label.disabled = true;
      copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy Code`;
      screenshotBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> Screenshot`;
      copyBtn.disabled = true;
      screenshotBtn.disabled = true;
      if (clearBtn) clearBtn.disabled = true;
    }
  }

  function pulseLastSelectionBox() {
    requestAnimationFrame(() => {
      const boxes = document.querySelectorAll(".ep-select-box");
      const last = boxes[boxes.length - 1];
      if (last) {
        last.classList.add("ep-just-selected");
        setTimeout(() => last.classList.remove("ep-just-selected"), 300);
      }
    });
  }

  function renumber() {
    let i = 1;
    selected.forEach((meta) => { meta.id = i++; });
  }

  function updateHoverStates(el) {
    document.querySelectorAll(".ep-select-box").forEach(box => {
      if (box._epTarget && (box._epTarget === el || box._epTarget.contains(el))) {
        box.classList.add("ep-box-hovered");
      } else {
        box.classList.remove("ep-box-hovered");
      }
    });
  }

  // ---------- selection boxes rendering ----------
  function renderSelectionBoxes() {
    document.querySelectorAll(".ep-select-box").forEach((n) => n.remove());
    selected.forEach((meta, el) => {
      const rect = el.getBoundingClientRect();
      const box = document.createElement("div");
      box.className = "ep-select-box";
      box._epTarget = el;
      box.style.top = `${rect.top + window.scrollY}px`;
      box.style.left = `${rect.left + window.scrollX}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;

      // Number badge
      const tag = document.createElement("div");
      tag.className = "ep-select-tag";
      tag.textContent = `${meta.id}`;
      box.appendChild(tag);

      // Floating copy button — appears on hover over the overlay
      const copyBtn = document.createElement("button");
      copyBtn.className = "ep-select-copy-btn";
      copyBtn.title = "Copy element";
      copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
      copyBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const text = await buildElementBlock(el, meta.id - 1);
        const ok = await copyToClipboard(text);
        copyBtn.innerHTML = ok
          ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`
          : `✕`;
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        }, 1500);
      });
      box.appendChild(copyBtn);

      // Floating screenshot button
      const screenshotBtn = document.createElement("button");
      screenshotBtn.className = "ep-select-screenshot-btn";
      screenshotBtn.title = "Take screenshot";
      screenshotBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
      screenshotBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();
        await copyOrDownloadScreenshot([el]);
      });
      box.appendChild(screenshotBtn);

      document.body.appendChild(box);
    });

    if (hoverEl) {
      updateHoverStates(hoverEl);
    }
  }

  function renderList() {
    const list = panel.querySelector(".ep-panel-list");
    const empty = panel.querySelector(".ep-panel-empty");
    empty.style.display = selected.size === 0 ? "block" : "none";
    list.innerHTML = "";
    selected.forEach((meta, el) => {
      const row = document.createElement("div");
      row.className = "ep-list-row";
      row.innerHTML = `
        <span class="ep-list-badge">${meta.id}</span>
        <span class="ep-list-label">${shortLabel(el)}</span>
        <button class="ep-list-copy" title="Copy Info">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
        <button class="ep-list-screenshot" title="Screenshot">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
        </button>
        <button class="ep-list-remove" title="Remove">&times;</button>
      `;
      row.querySelector(".ep-list-copy").addEventListener("click", async (e) => {
        e.stopPropagation();
        const text = await buildElementBlock(el, meta.id - 1);
        const ok = await copyToClipboard(text);
        flashPanelMessage(ok ? "Element copied!" : "Copy failed.");
      });
      row.querySelector(".ep-list-screenshot").addEventListener("click", async (e) => {
        e.stopPropagation();
        await copyOrDownloadScreenshot([el]);
      });
      row.querySelector(".ep-list-remove").addEventListener("click", (e) => {
        e.stopPropagation();
        selected.delete(el);
        renumber();
        renderList();
        renderSelectionBoxes();
        updateBottomToolbar();
      });
      row.addEventListener("mouseenter", () => {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      list.appendChild(row);
    });
  }
  function isExtensionUiTarget(target) {
    return Boolean(target && target.closest && target.closest(
      ".ep-shell, .ep-hover-box, .ep-select-box"
    ));
  }

  // ---------- event handlers ----------
  function onMouseMove(e) {
    if (!active) return;
    if (isExtensionUiTarget(e.target)) {
      hoverEl = null;
      hoverBox.style.display = "none";
      return;
    }

    if (cleanMode) {
      hoverBox.style.display = "none";
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || panel.contains(el) || el === hoverBox || hoverBox.contains(el) || el.closest(".ep-select-box")) return;
      hoverEl = el;
      return;
    }



    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || panel.contains(el) || el === hoverBox || hoverBox.contains(el)) return;
    if (el.closest(".ep-select-box")) return; // don't treat our own overlays as page elements
    if (el === hoverEl) return;
    hoverEl = el;
    positionBox(hoverBox, el);
    const rect = el.getBoundingClientRect();
    hoverLabel.textContent = `${shortLabel(el)}  ${Math.round(rect.width)}×${Math.round(rect.height)}`;

    let snippet = `<${el.tagName.toLowerCase()}`;
    if (el.id) snippet += ` id="${el.id}"`;
    if (el.className && typeof el.className === "string" && el.className.trim()) {
      snippet += ` class="${el.className.trim()}"`;
    }
    snippet += `>`;
    hoverCode.textContent = snippet.length > 50 ? snippet.slice(0, 47) + "..." : snippet;

    hoverBox.style.display = "block";

    updateHoverStates(el);
  }

  function onClick(e) {
    if (!active) return;
    if (!e.isTrusted) return;
    if (isExtensionUiTarget(e.target)) return;



    e.preventDefault();
    e.stopPropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    selectElement(el);
  }

  function onContextMenu(e) {
    if (!active) return;
    if (panel.contains(e.target)) return;

    e.preventDefault();
    e.stopPropagation();
    setActive(false);
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && active) {
      setActive(false);
    }
  }

  function onScrollOrResize() {
    if (active) {
      renderSelectionBoxes();
    }
  }

  panel.addEventListener("click", async (e) => {
    const modeBtn = e.target.closest(".ep-mode-btn");
    if (modeBtn) {
      const mode = modeBtn.dataset.mode;
      multiSelect = mode === "multi";
      panel.querySelectorAll(".ep-mode-btn").forEach((b) => {
        b.classList.toggle("ep-mode-active", b === modeBtn);
      });
      if (!multiSelect && selected.size > 1) {
        // Switching into single-select trims any existing multi-selection down to one,
        // so the panel state matches the mode immediately instead of staying stale.
        const [firstEl] = selected.keys();
        selected.clear();
        selected.set(firstEl, { id: 1 });
        renderList();
        renderSelectionBoxes();
      }
      return;
    }

    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "toggle-panel") {
      panelExpanded = !panelExpanded;
      panel.querySelector(".ep-panel-content").style.display = panelExpanded ? "block" : "none";
      panel.querySelector(".ep-toggle-panel-btn").style.transform = panelExpanded ? "rotate(0deg)" : "rotate(180deg)";
      return;
    }
    if (action === "close") {
      setActive(false);
      return;
    }
    if (action === "clear") {
      clearAllSelected();
      return;
    }
    if (action === "copy-all") {
      await copyAllSelected();
      return;
    }
    if (action === "screenshot-all") {
      await captureAllScreenshots();
      return;
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.matches(".ep-target-select")) {
      targetMode = e.target.value;
    }
  });

  const cleanModeCheckbox = panel.querySelector(".ep-clean-mode-checkbox");

  cleanModeCheckbox.addEventListener("change", () => {
    cleanMode = cleanModeCheckbox.checked;
    if (cleanMode) {
      hoverBox.style.display = "none";
    }
  });

  function setActive(next) {
    active = next;
    document.documentElement.classList.toggle("ep-active", active);
    hoverBox.style.display = "none";
    panel.style.display = active ? "flex" : "none";
    if (!active) {
      hoverEl = null;
      clearAllSelected();
      document.querySelectorAll(".ep-select-box").forEach(el => el.remove());
    } else {
      renderSelectionBoxes();
      updateBottomToolbar();
    }
  }

  // ---------- wiring ----------
  function init() {
    mount();
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize, true);
    setActive(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "EP_TOGGLE") {
      setActive(!active);
      sendResponse({ ok: true, active });
    }
  });
})();
