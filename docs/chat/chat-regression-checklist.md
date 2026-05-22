# Chat regression checklist (manual)

Use this after any chat-related change to quickly catch common web/mobile regressions.

## Web (PWA / browser)
- **Layout**
  - Open a chat with a long history: message list fills the available space.
  - Footer stays pinned; messages never render under the footer.
  - Unread “scroll down” button appears above the footer (not hidden / not overlapping).
- **Scrolling**
  - Scroll mid-history and send a message: list should not jump to the wrong position.
  - Jump to quoted message (reply → tap quoted area): lands on the target and highlights correctly (if supported).
- **Composer**
  - Type, send, and clear input: send button enabled/disabled behavior correct.
  - Open emoji picker then close: doesn’t resize/cover the message list unexpectedly.
  - Open attachments then close: doesn’t overlap the message list unexpectedly.
  - Open **More** actions menu: opens anchored to the button (prefer opening upward from the footer).
  - Select each action from More: menu closes, action triggers, no console errors.
- **Threads / pinned**
  - If threads are enabled: open thread panel and close it; footer still usable.
  - If pinned is visible: jump to pinned message works and doesn’t break scroll.

## Mobile (Android/iOS)
- **Keyboard**
  - Focus input: keyboard doesn’t hide the composer; message list remains usable.
  - Send a message while keyboard is open: no overlap; input clears.
- **Composer**
  - Open **More** actions menu: usable with keyboard; closes on select.
  - Emoji / attachments panels open/close cleanly.
- **Media**
  - GIF / sticker / poll modals open and close properly.

## E2EE
- Encrypted message with valid key: decrypts to readable text.
- Message still decrypting: shows “Decrypting…” briefly, then text.
- Decrypt failure (wrong key / corrupt): shows “Could not decrypt this message”, not stuck on “Decrypting…”.

## Common console checks
- No “Unexpected text node” errors.
- No infinite loading after reconnect / token invalidation.
- No repeated render-time `console.log` spam from message rendering.

