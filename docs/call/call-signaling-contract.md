# Call Signaling Contract (Client <-> Server)

This document defines the canonical signaling contract for the call system and the required state invariants.

## Scope

- Client runtime: `client/src/hooks/useMediasoup.js`
- Server signaling: `server/src/sockets/handlers/mediasoup.handlers.js`

## Canonical Event Contract

| Stage | Client -> Server | Server -> Client | Required payload fields | Notes |
| --- | --- | --- | --- | --- |
| Invite | `callRequest` | `incomingCall`, `callWaitingIncoming`, `remoteRinging`, `callInviteSummary` | `roomId`, `callerId`, `isVideoCall` | `callerId` must match authenticated socket user |
| Queue | N/A | `callQueueEnqueued`, `callQueuePromoted`, `callQueueBusyTimeout` | `roomId`, `recipientId`, `requestId` | Extra callers for same recipient are queued (FIFO) |
| Accept | `joinRoom` | `joinRoom` ack + `newPeer` | `roomId`, `userId`, `isCaller`, `role` | `userId` must match socket user and room membership |
| Reject | `callRejected` | `callRejected` (caller side) | `roomId`, `callerId`, `rejectedByUserId` | `rejectedByUserId` must be authenticated user |
| Cancel | `callCancelled` | `callCancelled`, `roomUpdated` | `roomId`, `callerId` | `callerId` must be authenticated user |
| Missed | `markCallAsMissed` | (optional push + room updates) | `roomId`, `callerId`, `isVideoCall` | `callerId` must be a valid room member |
| Leave | `leaveRoom` | `peerLeft`, `roomUpdated`, `callParticipantsSnapshot` | `roomId`, `userId` | `userId` optional but if provided must be authenticated |
| End | `endCall` | `callEnded`, `roomUpdated`, `liveStreamEnded` | `roomId`, `userId` | Must be idempotent under race/disconnect |
| Sync | N/A | `roomUpdated`, `callParticipantsSnapshot` | `roomId`, `updates` | Used to keep Redux and active call indicators consistent |

## State Invariants

1. One authoritative active call state per room:
   - `hasActiveCall === false` implies `activeCallId === null` and `activeCallParticipants` is empty.
2. Incoming modal visibility:
   - `incomingCall` should be dropped only for:
     - viewer role
     - bounded cancellation race window (short TTL)
     - explicit same-call cleanup (`callCancelled`/`callEnded`).
3. Multi-caller queue policy:
   - recipient keeps first incoming as `activeIncoming`.
   - additional callers enter `waitingIncoming` FIFO.
   - queued callers move `calling -> busy_timeout` unless promoted.
4. Membership/auth consistency:
   - Every user-scoped signaling event must pass socket-user verification.
5. Multi-device routing:
   - User-targeted emits should support multiple connected sockets for the same user.
6. Disconnect consistency:
   - Disconnect path must update call persistence and room updates using valid room id source (`room.id`/`peer.roomId`).

## Validation Checklist

- [ ] `callRequest` rejects spoofed `callerId`.
- [ ] `callRejected` rejects spoofed `rejectedByUserId`.
- [ ] `callCancelled` rejects spoofed `callerId`.
- [ ] `getRouterRtpCapabilities` validates authenticated user membership.
- [ ] `disconnect` updates use canonical room id, never undefined room key.
- [ ] User-targeted room/call updates fan out to all active sockets for the same user.

## Observability Contract

Each key transition should produce structured trace logs (`[call-trace]`) including:

- `event`
- `socketId`
- `actorUserId`
- `roomId`
- `callId` (when available)
- `at` (timestamp)
- queue lifecycle events: `queue_enqueued`, `queue_timeout_busy`, `queue_promoted`, `queue_removed`

These fields are required for reproducible debugging of intermittent call races.
