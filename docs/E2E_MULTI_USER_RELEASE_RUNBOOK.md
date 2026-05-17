# Multi-User E2E Release Runbook

This runbook defines the minimum multi-user scenarios to validate before progressive rollout.

## Scope

- Users: `A` (caller/moderator), `B`, `C`
- Platforms: Web (required), mobile optional
- Features covered:
  - Pre-call readiness
  - Delivery reliability v2
  - AI summary (server-backed)
  - Advanced moderation
  - Safety/anti-scam v2

## Environment

- Server running with socket + Redis
- Client running in 3 independent sessions
- Distinct accounts for `A`, `B`, `C`
- Shared group room with all 3 users

## Gate 1: Pre-Call Readiness

1. `A` starts video call with camera disabled at OS level.
2. Verify warning appears and call falls back to audio.
3. Rejoin panel:
   - Join as video when camera unavailable.
   - Verify auto-fallback to audio and warning.
4. Disconnect mic and try to start/join call.
5. Verify join/start is blocked with microphone error.

Expected:
- No silent failure.
- Explicit fallback and alerts.

## Gate 2: Delivery Reliability v2

1. `A` sends messages, then toggles offline.
2. Send 3 messages while offline.
3. Verify status transitions: `pending -> queued`.
4. Return online, verify auto-retry with backoff.
5. Force one message failure, use:
   - Inline retry button
   - Retry all failed
   - Failed-only filter
6. Verify summary badge and progress counter.

Expected:
- No message data loss during status updates.
- Retry-all behaves deterministically.

## Gate 3: Advanced Moderation

1. In active group call, `A` (authorized):
   - Mute all participants
   - Grant/revoke moderator to `B`
   - Lock/unlock speaking for `C`
   - Increase `C` hand-raise priority
2. Verify disabled states for illegal targets (self/owner/no permission).
3. Verify moderation activity feed updates.

Expected:
- Permission guards enforce actions correctly.
- UI reflects pending operations and final state.

## Gate 4: Safety / Anti-Scam v2

1. Send medium-risk suspicious link.
2. Verify warning appears first time.
3. Select `Trust this domain`.
4. Open similar link from same host again.
5. Verify warning is suppressed for trusted host.
6. Send high-risk link (IP/puny-like).
7. Verify stronger warning body.

Expected:
- Lower false-positive friction for trusted domains.
- High-risk still blocks with strong warning.

## Gate 5: AI Summary (Server-backed)

1. Generate summary from room menu.
2. Verify:
   - Summary fetched from server
   - Topics and actions populated
   - Call insight and health score shown
3. Edit/delete/schedule/cancel messages.
4. Generate summary again.
5. Verify cache invalidated and new summary reflects updates.

Expected:
- Correct freshness after message mutations.
- Fallback works if endpoint fails.

## Rollout Readiness Checklist

- [ ] All gates pass in staging
- [ ] No critical regressions in 24h soak
- [ ] KPI dashboard alerts configured
- [ ] Rollback switch verified

