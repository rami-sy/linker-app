# Calls Quarterly Expansion — Phase Gates

## Phase 1 Gate — Reliability Baseline
- Added `joinRequestId` contract in socket validation for `joinRoom`.
- Added server-side join dedupe state per socket to prevent duplicate peer creation from repeated requests.
- Added lifecycle operation lock (`leaveRoom`, `endCall`, `disconnect`) to reduce parallel teardown races.
- Added client `joinRequestId` emission in `useMediasoup.joinRoom`.

## Phase 2 Gate — UX Improvements
- Added actionable error alert on waiting-call accept failures in `call-waiting-notification`.
- Preserved unified accept flow behavior for audio/video entry points.

## Phase 3 Gate — Moderation/Safety Expansion
- Added new group moderation server actions:
  - `setParticipantSpeakingLock`
  - `setParticipantHandRaisePriority`
- Added permission enforcement (`muteOthers`) for both actions.
- Added client state/listeners/actions for:
  - `participantSpeakingLockUpdated`
  - `participantHandRaisePriorityUpdated`

## Phase 4 Gate — Analytics/Ops
- Added server runtime call telemetry counters (`global.__callTelemetryCounters`) in signaling layer.
- Wired counters into `/metrics` response under `callMetrics.telemetry`.
- Notification contract extensions were already present and remain compatible.

## Validation Summary
- Server lint: passed.
- Phase-gate runtime check: passed (`joinRoom` schema supports `joinRequestId`; permission `everyoneExcept` path verified).
- Existing unrelated test failure remains in `message-queue-push-payload.test` (not from call changes).

