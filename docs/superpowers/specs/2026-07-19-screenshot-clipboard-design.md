# Screenshot Clipboard Reliability Design

## Goal

When the user clicks a screenshot action, the captured PNG must be written to
the operating system clipboard. The extension must display a success message
only after the clipboard write is confirmed, and must retain the existing PNG
download fallback when copying is unavailable.

## Architecture

The content script remains responsible for capturing and assembling the PNG.
It sends the PNG data to the MV3 background service worker through a dedicated
message. The service worker creates/reuses an offscreen document, forwards the
data to it, and returns the clipboard operation's success or failure. The
offscreen document owns the `navigator.clipboard.write()` call with an
`image/png` `ClipboardItem`, avoiding the unreliable content-script image
clipboard path.

The offscreen document is declared in the manifest with the clipboard reason
and a purpose explaining system image clipboard access. The worker closes the
offscreen document after the operation completes when no longer needed.

## Data flow and errors

1. `content.js` captures the PNG blob and converts it to a transferable data URL.
2. It sends `EP_COPY_IMAGE_TO_CLIPBOARD` to `background.js`.
3. `background.js` ensures the offscreen document exists, sends the data URL,
   and awaits a response.
4. The offscreen document reconstructs the blob and writes it to the system
   clipboard, returning `{ ok: true }` or an error message.
5. Content UI shows “Screenshot copied!” only for `{ ok: true }`; otherwise it
   uses the existing download fallback and reports that it saved a file.

Unexpected message, conversion, or clipboard errors must resolve as failure,
not leave a pending promise or falsely report success.

## Testing and validation

Because the repository has no existing test runner, add a small Node-runnable
regression test for the worker/offscreen message contract using injected mocks
for Chrome APIs and clipboard operations. Validate JavaScript syntax for all
changed scripts and manually verify copy/paste from a loaded unpacked Chrome
extension, including the download fallback when clipboard access is denied.
