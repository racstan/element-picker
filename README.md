# Element Picker for AI Debugging
A free, local, open-source alternative to Screen Ruler for your specific use case:
hover, click, **multi-select** page elements, and **copy their HTML/CSS** (or a full
bug report) to paste straight into an AI chat.

Nothing is sent anywhere — it's a plain Manifest V3 extension that runs entirely
in your browser. No account, no payment, no tracking.

## Install (unpacked / dev mode — takes 30 seconds)

1. Unzip this folder somewhere permanent (don't delete it after installing — Chrome
   loads the extension live from this folder).
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** on (top-right corner).
4. Click **Load unpacked**.
5. Select the unzipped `element-picker` folder.
6. Pin it to your toolbar (puzzle-piece icon → pin) for one-click access.

## Usage

1. Click the toolbar icon (or press **Alt+Shift+E**) on any page to turn the picker on.
   The icon turns **green** while active, and back to **red** when off.
2. **Hover** over elements — they highlight in blue with their tag/class and size.
3. **Click** an element to select it. All selections use the same blue color with a
   numbered badge (1, 2, 3...). Click a selected element again to deselect it.
4. **Multi-select vs Single-select** — two buttons at the top of the panel. Multi-select
   (default) lets you build up a list of elements. Single-select keeps only the most
   recent click, replacing whatever was selected before — useful when you just want to
   grab one thing at a time without remembering to clear.
5. **Enhanced Mode** (toggle switch): while on, hovering an element also outlines:
   - Its **ancestors** (parent, grandparent, ... up to `<body>`) in dashed **amber**,
     fading out the further up the tree you go.
   - Its **descendants** (children, grandchildren, up to 3 levels deep) in dotted **teal**.
   - Two chip toggles let you turn Ancestors or Descendants off independently if you
     only want one direction of context.
   - **Click directly on any ancestor or descendant outline** to select *that* element
     instead of the one under your main cursor — this is how you grab a parent,
     grandparent, or nested child without having to move your mouse to exactly the
     right pixel on the page.
6. Use the panel buttons:
   - **Copy HTML** — outerHTML of every selected element
   - **Copy CSS** — computed (non-default) CSS for every selected element, as real selectors
   - **Copy Bug Report** — page URL, viewport size, and for each element: its CSS
     selector, dimensions, HTML, and computed styles, all in clean Markdown
   - **Clear All** — deselect everything
7. Press **Esc**, click the × in the panel header, or hit the toolbar icon again to exit
   — turning the picker off also clears all current selections and their overlays, so
   you always start clean next time.

## Appearance

The panel is light by default (white background, dark text) and automatically switches
to a dark variant if your OS is set to dark mode — it follows `prefers-color-scheme`,
no manual toggle needed.

## Customizing the keyboard shortcut

Go to `chrome://extensions/shortcuts` if Alt+Shift+E conflicts with something on your system.

## Notes / limitations

- Doesn't work on Chrome's internal pages (`chrome://...`) or the Web Store — this is
  a Chrome restriction on all extensions, not a bug. The icon flashes a red `!` badge
  if a page can't be reached at all.
- If you toggle the picker on a tab that was already open before the extension was
  loaded (or on an SPA that navigated client-side), the background script auto-injects
  the content script on demand.
- HTML is truncated at ~4000 characters per element to avoid clipboard bloat on huge
  containers — select a more specific child element instead of a giant wrapper if you
  need more detail.
- "Computed CSS" filters out a handful of very common default values (`none`, `auto`,
  `normal`, `0px`, `visible`, transparent) to keep the output focused on what's actually
  set.
- Descendant outlines cap at 12 nodes / 3 levels deep to avoid trying to outline an
  entire large subtree at once — select a descendant and re-hover it if you need to
  go deeper.

## Extending it yourself

It's vanilla JS across `content.js` (logic), `content.css` (overlay/panel styling), and
`background.js` (toolbar/shortcut wiring + icon state) — no build step, no dependencies.
Ideas if you want to extend it further:
- Add a "Copy as JSX" mode
- Send selections directly into a specific AI's web app via a content script bridge
- Persist selections across page reloads via `chrome.storage`
- Make the descendant depth/count caps configurable in the panel

