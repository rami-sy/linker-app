# Privacy Features Roadmap

This document tracks the implementation progress of privacy and permission features for the Linker application.

---

## Overview

| Phase | Feature | Priority | Status |
|-------|---------|----------|--------|
| 1 | Privacy Exceptions System | High | 🟢 Completed |
| 2 | Mute System | High | 🟢 Completed |
| 3 | Temporary Messages | Medium | 🟢 Completed |
| 4 | Granular Admin Permissions | Medium | 🟢 Completed |
| 5 | Message Request System | Low | 🟢 Completed |
| 6 | Typing Indicator Privacy | Low | 🟢 Completed |

**Legend:** 🔴 Not Started | 🟡 In Progress | 🟢 Completed

**Checklist sync:** Detailed `- [ ]` / `- [x]` items below were reconciled with the repository on 2026-03-22. The overview table summarizes product intent; unchecked items are deliberate gaps (not stale “todo” noise).

---

## Phase 1: Privacy Exceptions System

**Priority:** High  
**Status:** 🟢 Completed

### Description
Add "except" and "only" patterns to all privacy settings, allowing users to specify exceptions.

### Current State
- Chat/call settings support base audiences (`everyone`, `friends`, `noOne`, `admin`, `moderator`, `specific`) **plus** `*ExceptUsers` arrays on User, Room, and Call models for “everyone except …” style rules.
- There is **no** top-level `privacyMode` (`include` / `exclude`) field; exception behavior is encoded via `everyone` combined with `*ExceptUsers`.

### Implementation Tasks

- [x] **Schema Changes**
  - [x] Add `*ExceptUsers` arrays to User.privacySettings
  - [x] Add `*ExceptUsers` arrays to Room.chatSettings
  - [ ] Add `privacyMode` field: `include` or `exclude` *(deferred — not required for current exception UX)*

- [x] **Server Logic**
  - [x] Update `server/src/utils/permissions.js` - checkPermissionFromSettings
  - [x] Handle exception logic in permission checks

- [x] **Client Logic**
  - [x] Update `client/src/utils/permissions.js` - mirror server changes

- [x] **UI Changes**
  - [x] Add "Exceptions" option in privacy dropdowns
  - [x] Create user picker modal for selecting exceptions

### Files to Modify
- `server/src/models/user.model.js`
- `server/src/models/room.model.js`
- `server/src/utils/permissions.js`
- `client/src/utils/permissions.js`
- `client/src/components/chat/chat-settings-popup.js`

---

## Phase 2: Mute System

**Priority:** High  
**Status:** 🟢 Completed

### Description
Implement mute functionality separate from blocking. Users can mute notifications without blocking messages.

### Features
- Mute notifications only (still receive messages)
- Mute for duration (1 hour, 8 hours, 1 day, 1 week, forever)
- Mute specific chats/groups
- Mute specific users globally

### Implementation Tasks

- [x] **Schema Changes**
  - [x] Add `mutedChats` array to User model: `{ roomId, until, createdAt }`
  - [x] Add `mutedUsers` array to User model: `{ userId, until, createdAt }`

- [x] **Server Logic**
  - [x] Add mute/unmute socket handlers
  - [x] Check mute status before sending notifications
  - [x] Auto-expire mutes based on `until` field

- [x] **Client Logic**
  - [x] Add mute state to Redux
  - [x] Filter notifications for muted chats/users

- [x] **UI Changes**
  - [x] Add mute option to chat header menu
  - [x] Add mute duration picker modal
  - [x] Show mute indicator in chat list

### Files to Modify
- `server/src/models/user.model.js`
- `server/src/sockets/services/room.services.js`
- `server/src/sockets/services/notification.services.js`
- `client/src/components/chat/header.js`
- `client/src/redux/chatSlice.js`

---

## Phase 3: Temporary Messages

**Priority:** Medium  
**Status:** 🟢 Completed

### Description
Self-destructing messages that automatically delete after a set time.

### Features
- Set timer per chat (off, 24 hours, 7 days, 90 days)
- Messages auto-delete after timer expires
- Visual indicator for temporary messages
- Timer applies to new messages only

### Implementation Tasks

- [x] **Schema Changes**
  - [x] Add `autoDeleteTimer` to Room model (enum: null, 86400, 604800, 7776000)
  - [x] Add `expiresAt` field to Message model

- [x] **Server Logic**
  - [x] Set `expiresAt` on new messages based on room's timer
  - [x] Create cleanup job (cron) for expired messages
  - [x] Socket handler to update room timer

- [x] **Client Logic**
  - [x] Show timer countdown on messages (optional)
  - [x] Handle message deletion events

- [x] **UI Changes**
  - [x] Add timer option in chat settings
  - [x] Show timer icon on messages
  - [x] Show room timer indicator

### Files to Modify
- `server/src/models/room.model.js`
- `server/src/models/message.model.js`
- `server/src/sockets/services/message.services.js`
- `server/src/jobs/cleanup.js` (create new)
- `client/src/components/chat/chat-settings-popup.js`
- `client/src/components/chat/message-item.js`

---

## Phase 4: Granular Admin Permissions

**Priority:** Medium  
**Status:** 🟢 Completed

### Description
Split admin permissions into specific capabilities that can be assigned to different roles.

### Permissions
| Permission | Description |
|------------|-------------|
| `canKickMembers` | Remove members from group |
| `canDeleteMessages` | Delete others' messages |
| `canManageRoles` | Change member roles |
| `canInviteMembers` | Add new members |
| `canPinMessages` | Pin messages |
| `canEditGroupInfo` | Edit name/photo/description (exists) |

### Implementation Tasks

- [x] **Schema Changes**
  - [x] Add `adminPermissions` object to Room model
  - [x] Each permission: `{ enabled: Boolean, roles: ["admin", "moderator"] }`

- [x] **Server Logic**
  - [x] Check specific permissions before actions
  - [x] Update kick, delete, role change handlers

- [x] **UI Changes**
  - [x] Add admin permissions section in group settings
  - [x] Toggle switches for each permission
  - [x] Role selector for each permission

### Files to Modify
- `server/src/models/room.model.js`
- `server/src/sockets/services/room.services.js`
- `server/src/sockets/services/message.services.js`
- `client/src/components/chat/group-settings-popup.js`

---

## Phase 5: Message Request System

**Priority:** Low  
**Status:** 🟢 Completed

### Description
Messages from non-friends go to a separate "requests" folder that users can accept or decline.

### Features
- Separate inbox for message requests
- Accept/Decline requests
- Accepted requests become normal chats
- Option to disable (receive all messages normally)

### Implementation Tasks

- [x] **Schema Changes**
  - [x] Add `isRequest` Boolean to Room model
  - [x] Add `requestStatus` enum: `pending`, `accepted`, `declined`
  - [x] Add `messageRequestsEnabled` to User.privacySettings

- [x] **Server Logic**
  - [x] Check friendship before creating room
  - [x] Create room as request if not friends
  - [x] Accept/decline handlers

- [x] **UI Changes**
  - [x] Add "Requests" tab in chat list
  - [x] Show request count badge
  - [x] Accept/Decline buttons in chat

### Files to Modify
- `server/src/models/room.model.js`
- `server/src/models/user.model.js`
- `server/src/sockets/services/room.services.js`
- `client/src/app/(tabs)/chats/index.js`
- `client/src/components/chat/header.js`

---

## Phase 6: Typing Indicator Privacy

**Priority:** Low  
**Status:** 🟢 Completed

### Description
Control who can see your typing status.

### Options
- `everyone` - All users can see when you're typing
- `friends` - Only friends can see
- `noOne` - No one can see

### Implementation Tasks

- [x] **Schema Changes**
  - [x] Add `typingIndicator` to User.privacySettings.interactions

- [x] **Server Logic**
  - [x] Check privacy setting before broadcasting typing event

- [x] **Client Logic**
  - [x] Add setting to privacy settings screen

### Files to Modify
- `server/src/models/user.model.js`
- `server/src/sockets/handlers/chat.handlers.js`
- `client/src/screens/privacy-settings.js`

---

## Changelog

| Date | Phase | Change |
|------|-------|--------|
| 2026-01-25 | All | All 6 phases implemented |
| 2026-01-25 | 6 | Typing Indicator Privacy completed |
| 2026-01-25 | 5 | Message Request System completed |
| 2026-01-25 | 4 | Granular Admin Permissions completed |
| 2026-01-25 | 3 | Temporary Messages completed |
| 2026-01-25 | 2 | Mute System completed |
| 2026-01-25 | 1 | Privacy Exceptions System completed |
| 2026-01-25 | - | Initial roadmap created |
| 2026-03-22 | All | Roadmap checklists synced with codebase; Phase 1 `privacyMode` left explicitly open |

---

## Notes

- All features should support both Arabic (RTL) and English (LTR)
- All settings should sync between devices
- Consider backwards compatibility with existing data
- Add translations for all new UI elements
