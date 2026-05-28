# E2E Encryption Status

## Current state

| Layer | Status | Location |
|-------|--------|----------|
| Client crypto primitives | Implemented | `client/src/crypto/` |
| Socket key exchange | Partial | `server/src/sockets/handlers/e2ee.handlers.js` |
| Message encryption in chat | Opt-in per room | `client/src/contexts/socket.context.js`, message services |
| Call media (SRTP) | WebRTC default | mediasoup / DTLS-SRTP |
| Full call E2E (double ratchet for media) | **Not implemented** | Backlog |

## What works today

- Users can exchange public keys over Socket.IO (`e2ee.handlers.js`).
- Chat messages support encrypted payloads when E2E is enabled for a conversation.
- Server stores ciphertext; message content is not decrypted on the server when E2E is active.

## Gaps for "full E2E"

1. **Key verification UI** — safety numbers / QR compare between contacts.
2. **Multi-device key sync** — consistent sessions across phone + web.
3. **Call metadata** — encrypt signaling fields that still leak room/timing info.
4. **Recovery** — secure key backup without server-readable escrow.
5. **Automated tests** — cross-client encrypt/decrypt regression suite.

## Recommended next steps

1. Add `client/tests/e2ee-contract.test.js` for encrypt/decrypt round-trip.
2. Document required socket events in `docs/chat/e2ee-contract.md`.
3. Gate E2E rollout behind user setting with clear UX when peer lacks support.
