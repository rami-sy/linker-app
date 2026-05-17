# Chat + Calls Competitive Parity Spec

## Scope

This document maps high-value capabilities from WhatsApp, Telegram, Messenger, and Snapchat into implementation-ready requirements for this codebase.

## Capability Map

| Capability | Source Apps | Product Requirement | Priority |
| --- | --- | --- | --- |
| Advanced chat privacy | WhatsApp | Add controls to limit export, media auto-download, and AI usage in sensitive chats/groups | P0 |
| Rich in-chat discoverability | WhatsApp, Telegram | Search facets for attachments, call events, mentions, and date ranges | P0 |
| Group moderation depth | Telegram | Expose speaking lock, hand-raise priority, role actions with permission gates | P0 |
| Safer external interaction | Messenger | Warn before suspicious links and risky unknown-contact interactions | P0 |
| Expressive camera-first messaging | Snapchat | Improve quick creative flows and media sharing polish in composer | P1 |
| AI-assisted compose/summaries | Telegram, WhatsApp, Messenger | Add opt-in AI draft assist and summary surfaces with clear transparency | P1 |
| Anti-spam hardening | Messenger, WhatsApp | Progressive throttling for mention spam, repeated call attempts, and burst sends | P0 |
| Operational observability | All | Unified chat+call telemetry, KPI-level metrics, and rollout gates | P0 |

## Functional Requirements

### Messaging
- Scheduled send flow for text messages with cancel/edit before dispatch.
- Failed-send inline retry without message duplication.
- Reaction summaries grouped by emoji and count.
- Multi-select bulk actions for forward/delete with role-safe behavior.

### Calls
- Pre-call readiness checks (microphone, camera, basic network) before accept/join.
- Consistent audio/video join semantics across incoming, waiting, and rejoin entry points.
- Group participant board includes role, moderation state, and actionable controls with reasons when disabled.

### Safety and Trust
- Suspicious-link warning modal with user confirmation before opening.
- Mention spam safeguards (max mentions per message + rate profile).
- Audit events for sensitive moderation and message-removal actions.

### AI + Creativity
- Opt-in AI draft action in composer.
- Optional summaries for long unread chat/call event bundles.
- Telemetry for AI assist usage and success/fallback rate.

### Metrics and Rollout
- `/metrics` exposes chat telemetry, call telemetry, and rollout flag states.
- Feature flags gate risky or experimental features.
- Phase validation requires lint + targeted tests + smoke matrix.

## Non-Functional Requirements

- Backward compatible socket payloads where possible.
- Idempotent request handling for retry-prone flows.
- Low-latency moderation actions (`<500ms` P95 target).
- Clear user-facing error messages in both English and Arabic.

## Success Metrics

- Chat send failure rate down by 30%.
- Call join/rejoin success up by 20%.
- Reduced moderation action failure rates.
- Improved warning precision for suspicious link interactions.
- Increased weekly active usage in chat+call cohorts.
