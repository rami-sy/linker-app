# Call Feature Maturity Roadmap

This roadmap defines staged feature delivery after stabilization and hardening work.

## Phase 1 - Reliability and User Trust

### Phase 1 Goals

- Eliminate intermittent missing incoming-call modal.
- Keep call status indicators accurate after cancel/end/disconnect.
- Improve recoverability under rapid action sequences.

### Phase 1 Deliverables

- Deterministic race guard policy for incoming/cancel paths.
- Idempotent `cancel`, `leave`, and `disconnect` transitions.
- Structured call trace logs with correlation fields.
- Stress scenarios for rapid redial, parallel callers, and reconnect.

## Phase 2 - Platform-grade Calling UX

### Phase 2 Goals

- Improve perceived call continuity and background behavior.
- Reduce confusion during network instability.

### Phase 2 Deliverables

- Explicit reconnecting / degraded quality UI states.
- Better call waiting transitions and conflict resolution UI.
- Native integration plan for lock-screen and background behavior (CallKit/ConnectionService parity path).

## Phase 3 - Collaboration and Productivity

### Phase 3 Goals

- Expand call utility inside chats and groups.

### Phase 3 Deliverables

- Add participant / escalate to group flow.
- Ownership transfer and improved moderation controls.
- Improved call history quality and actionability.

## Phase 4 - Security and Quality Enhancements

### Phase 4 Goals

- Raise trust guarantees and media quality.

### Phase 4 Deliverables

- End-to-end encryption feasibility and rollout decision.
- Advanced abuse controls and policy hooks.
- Deeper quality analytics and adaptive recommendations.

## Priority Backlog (Ordered)

1. Incoming-call reliability under fast call sequences.
2. Server disconnect consistency and idempotent call state transitions.
3. Multi-device routing correctness for all user-targeted signaling emits.
4. Automated stress test coverage for race-heavy scenarios.
5. Reconnection UX and network degradation feedback.
6. Feature expansion (escalation, transfer, richer moderation).
