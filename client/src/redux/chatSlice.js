import { createSlice } from "@reduxjs/toolkit";
import normalizeMongoId from "../utils/normalizeMongoId";
import {
  getEffectiveMessageTimestampMs,
  normalizeDispatchedScheduledMessage,
} from "../utils/effectiveMessageTimestamp";

const normalizeMessageMap = (messages) => {
  if (!messages || typeof messages !== "object") return messages;
  const normalizedEntries = Object.entries(messages).map(([key, message]) => [
    key,
    normalizeDispatchedScheduledMessage(message),
  ]);
  return Object.fromEntries(normalizedEntries);
};

const normalizeRoomLastMessage = (room) => {
  if (!room || !room.lastMessage) return room;
  return {
    ...room,
    lastMessage: normalizeDispatchedScheduledMessage(room.lastMessage),
  };
};

const normalizeRoomsLastMessages = (rooms) => {
  if (!Array.isArray(rooms)) return rooms;
  return rooms.map((room) => normalizeRoomLastMessage(room));
};

/** Newest chat first. Rooms without lastMessage / invalid dates sort to the bottom. */
function lastMessageTimestampMs(room) {
  return getEffectiveMessageTimestampMs(room?.lastMessage);
}

function sortRoomsNewestFirst(rooms) {
  if (!rooms?.length) return;
  rooms.sort(
    (a, b) => lastMessageTimestampMs(b) - lastMessageTimestampMs(a)
  );
}

export const chatSlice = createSlice({
  name: "chats",
  initialState: {
    rooms: [],
    roomId: null,
    usersTyping: {},
    roomDrafts: {},
    totalUnreadMessages: 0,
    firstLoad: false,
  },
  reducers: {
    setMessages: (state, action) => {
      const roomId = action?.payload?.room;
      const mergeOnly = action?.payload?.mergeOnly === true;
      const threadRoot = action?.payload?.threadRoot;
      const normalizedMessages = normalizeMessageMap(action.payload.messages);
      state.rooms = state?.rooms?.map((r) =>
        String(r?._id) === String(roomId)
          ? {
              ...r,
              ...(mergeOnly
                ? {}
                : {
                    unreadMessagesCount: 0,
                    currentPage: action.payload.currentPage,
                    hasMore: action.payload.hasMore,
                    isLoadingMore: false,
                    threadPagination: null,
                  }),
              ...(threadRoot != null && mergeOnly
                ? {
                    threadPagination: {
                      root: String(threadRoot),
                      page: action.payload.currentPage,
                      hasMore: action.payload.hasMore,
                    },
                    threadFetchError: null,
                  }
                : {}),
              messages: action.payload.override
                ? normalizedMessages
                : {
                    ...r.messages,
                    ...normalizedMessages,
                  },
            }
          : r
      );
    },
    clearThreadPagination: (state, action) => {
      const roomId = action?.payload?.room;
      state.rooms = state?.rooms?.map((r) =>
        String(r?._id) === String(roomId)
          ? { ...r, threadPagination: null, threadFetchError: null }
          : r
      );
    },
    threadFetchFailed: (state, action) => {
      const roomId = action?.payload?.room;
      const threadRoot = action?.payload?.threadRoot;
      const errMsg =
        action?.payload?.message || "Failed to load thread messages";
      state.rooms = state?.rooms?.map((r) =>
        String(r?._id) === String(roomId)
          ? {
              ...r,
              threadFetchError: {
                root: threadRoot != null ? String(threadRoot) : null,
                message: errMsg,
              },
            }
          : r
      );
    },
    clearThreadFetchError: (state, action) => {
      const roomId = action?.payload?.room;
      state.rooms = state?.rooms?.map((r) =>
        String(r?._id) === String(roomId)
          ? { ...r, threadFetchError: null }
          : r
      );
    },
    addMessage: (state, action) => {
      console.log("addMessage", { payload: action.payload });

      const incrementUnread = action.payload.incrementUnread === true;
      const payload = { ...action.payload };
      delete payload.incrementUnread;
      const normalizedPayload = normalizeDispatchedScheduledMessage(payload);

      // ✅ Skip updating lastMessage for stream messages (messages with call field)
      // Stream messages should only appear in StreamChatOverlay, not in chat list
      const isStreamMessage =
        !!normalizedPayload.call ||
        !!normalizedPayload.callId ||
        !!normalizedPayload.isLiveComment;

      // Update the rooms array
      const addRoom = normalizeMongoId(payload?.room);
      state.rooms = state?.rooms?.map((r) =>
        String(normalizeMongoId(r?._id)) === String(addRoom)
          ? {
              ...r,
              // ✅ Only update lastMessage if it's NOT a stream message
              ...(isStreamMessage ? {} : { lastMessage: normalizedPayload }),
              unreadMessagesCount:
                incrementUnread && !isStreamMessage
                  ? (r.unreadMessagesCount || 0) + 1
                  : r.unreadMessagesCount,
              messages: (() => {
                const messageKey =
                  normalizedPayload.uuId || normalizedPayload._id;
                if (!messageKey) {
                  return { ...r.messages };
                }
                return {
                  ...r.messages,
                  [messageKey]: normalizedPayload,
                };
              })(),
            }
          : r
      );

      // ✅ Only sort rooms if we updated lastMessage (non-stream messages)
      if (!isStreamMessage) {
        sortRoomsNewestFirst(state.rooms);
      }
    },
    updateMessage: (state, action) => {
      const unreadRaw = action?.payload?.unreadMessagesCount;
      const shouldBumpUnread =
        typeof unreadRaw === "number" && unreadRaw > 0;
      const updateRoomId = action?.payload?.room;
      state.rooms = state?.rooms?.map((r) => {
        if (String(r?._id) === String(updateRoomId)) {
          const messageKey =
            action.payload.uuId || action.payload._id;
          const normalizedIncoming = normalizeDispatchedScheduledMessage(
            action.payload
          );
          if (!messageKey) {
            return {
              ...r,
              lastMessage: normalizedIncoming,
              unreadMessagesCount: shouldBumpUnread
                ? r.unreadMessagesCount + unreadRaw
                : r.unreadMessagesCount,
              messages: {
                ...r.messages,
              },
            };
          }
          const previousMessage = r.messages?.[messageKey] || {};
          const mergedMessage = normalizeDispatchedScheduledMessage({
            ...previousMessage,
            ...normalizedIncoming,
          });
          return {
            ...r,
            lastMessage: mergedMessage,
            unreadMessagesCount: shouldBumpUnread
              ? r.unreadMessagesCount + unreadRaw
              : r.unreadMessagesCount,
            messages: {
              ...r.messages,
              [messageKey]: mergedMessage,
            },
          };
        }
        return r;
      });

      sortRoomsNewestFirst(state.rooms);
    },
    clearMessages: (state) => {
      state.rooms = state.rooms.map((r) =>
        r?._id === state?.roomId
          ? {
              ...r,
              messages: {},
              currentPage: 1,
              hasMore: true,
              isLoadingMore: false,
              lastMessage: null,
              unreadMessagesCount: 0,
            }
          : r
      );
      sortRoomsNewestFirst(state.rooms);
    },
    setRooms: (state, action) => {
      console.log("setRooms", { payload: action.payload });
      const payload = action.payload;

      if (Array.isArray(payload)) {
        state.rooms = payload.map((room) => normalizeRoomLastMessage(room));
      } else if (payload?.override && payload?.room?._id) {
        state.rooms = state.rooms.map((room) =>
          String(room?._id) === String(payload.room._id)
            ? normalizeRoomLastMessage({ ...room, ...payload.room })
            : room
        );
      } else if (Array.isArray(payload?.rooms)) {
        state.rooms = payload.rooms.map((room) => normalizeRoomLastMessage(room));
      } else if (payload?._id) {
        state.rooms = state.rooms.map((room) =>
          String(room?._id) === String(payload._id)
            ? normalizeRoomLastMessage({ ...room, ...payload })
            : room
        );
      }
      sortRoomsNewestFirst(state.rooms);
    },
    addRoom: (state, action) => {
      // Check if the room already exists in the rooms array
      const roomExists = state.rooms.some(
        (room) => room?._id === action?.payload?._id
      );

      if (!roomExists) {
        // ✅ إضافة room جديد فقط إذا:
        // 1. لم يتم تحديد skipAddIfNotExists
        // 2. أو إذا كان room يحتوي على members array (يعني المستخدم عضو)
        const skipAdd = action?.payload?.skipAddIfNotExists === true;
        const hasMembers = action?.payload?.members && Array.isArray(action?.payload?.members) && action?.payload?.members.length > 0;
        
        if (skipAdd) {
          // ✅ Skip adding room if flag is set (for viewers)
          return;
        }
        
        if (!hasMembers) {
          // ✅ إذا لم يكن هناك members، لا نضيف room جديداً (للمشاهدين)
          return;
        }
        
        // If the room does not exist, add it to the rooms array
        state.rooms.push(normalizeRoomLastMessage(action.payload));
        sortRoomsNewestFirst(state.rooms);
      }
    },
    unShiftRoom: (state, action) => {
      const raw = action?.payload;
      if (!raw?._id) return;

      const { skipAddIfNotExists, ...payloadRaw } = raw;
      const payload = normalizeRoomLastMessage(payloadRaw);
      const pid = String(payload._id);

      const existingIndex = state.rooms.findIndex(
        (room) => String(room?._id) === pid
      );

      // Room already in list: merge server fields (e.g. unreadMessagesCount after joinChat)
      // but keep local messages map — getOneRoom does not return messages.
      if (existingIndex >= 0) {
        const oldRoom = state.rooms[existingIndex];
        state.rooms = state.rooms.map((room, idx) =>
          idx === existingIndex
            ? normalizeRoomLastMessage({
                ...oldRoom,
                ...payload,
                messages: oldRoom.messages ?? {},
              })
            : room
        );
        sortRoomsNewestFirst(state.rooms);
        return;
      }

      // New room: same guards as before (do not persist reducer-only flags on the room)
      const skipAdd = skipAddIfNotExists === true;
      const hasMembers =
        payload.members &&
        Array.isArray(payload.members) &&
        payload.members.length > 0;

      if (skipAdd) return;
      if (!hasMembers) return;

      if (state?.rooms?.length > 0) {
        state.rooms = [payload, ...state.rooms];
      } else {
        state.rooms.push(payload);
      }
      sortRoomsNewestFirst(state.rooms);
    },
    deleteRoom: (state, action) => {
      state.rooms = state.rooms.filter((room) => room?._id !== action.payload);
    },
    setRoom: (state, action) => {
      if (action?.payload?.add) {
        delete action?.payload?.add;
        state.rooms = state.rooms.map((room) =>
          room?._id === action?.payload?._id
            ? normalizeRoomLastMessage({ ...room, ...action.payload })
            : room
        );
      } else {
        state.rooms = state.rooms.map((room) =>
          room?._id === action?.payload?._id
            ? normalizeRoomLastMessage({ ...action.payload })
            : room
        );
      }

      state.roomId = action.payload?._id;
      sortRoomsNewestFirst(state.rooms);
    },

    updateRoom: (state, action) => {
      const roomId = action?.payload?._id;
      if (!roomId) return;
      
      const existingRoomIndex = state.rooms.findIndex((room) => room?._id === roomId);
      
      if (existingRoomIndex >= 0) {
        // ✅ تحديث room موجود
        const oldRoom = state.rooms[existingRoomIndex];
        const newRoom = normalizeRoomLastMessage({
          ...oldRoom,
          ...action.payload,
        });
        // ✅ Ensure roles are properly merged (replace, not merge)
        if (action.payload?.roles) {
          newRoom.roles = action.payload.roles;
        }
        // ✅ Ensure members are properly replaced (not merged)
        if (action.payload?.members && Array.isArray(action.payload.members)) {
          newRoom.members = action.payload.members;
        }
        console.log("updateRoom Redux:", {
          roomId,
          oldRoles: oldRoom?.roles,
          newRoles: newRoom?.roles,
          payloadRoles: action.payload?.roles,
          hasMembers: !!action.payload?.members,
          membersLength: action.payload?.members?.length,
          oldMembersLength: oldRoom?.members?.length,
          oldMembersChatSettings: oldRoom?.members?.[0]?.privacySettings?.chatSettings,
          newMembersChatSettings: newRoom?.members?.[0]?.privacySettings?.chatSettings,
          payloadMembersChatSettings: action.payload?.members?.[0]?.privacySettings?.chatSettings,
          oldMember0Id: oldRoom?.members?.[0]?._id,
          newMember0Id: newRoom?.members?.[0]?._id,
          payloadMember0Id: action.payload?.members?.[0]?._id,
        });
        // ✅ Force a new array reference to ensure React re-renders
        state.rooms = state.rooms.map((r, idx) => 
          idx === existingRoomIndex ? newRoom : r
        );
      } else {
        // ✅ إضافة room جديد فقط إذا:
        // 1. لم يتم تحديد skipAddIfNotExists
        // 2. أو إذا كان room يحتوي على members array (يعني المستخدم عضو)
        const skipAdd = action?.payload?.skipAddIfNotExists === true;
        const hasMembers = action?.payload?.members && Array.isArray(action?.payload?.members) && action?.payload?.members.length > 0;
        
        if (!skipAdd && hasMembers) {
          // ✅ إضافة room جديد فقط إذا كان المستخدم عضواً
          state.rooms.push(normalizeRoomLastMessage({ ...action.payload }));
        } else if (skipAdd) {
          // ✅ Skip adding room if flag is set (for viewers)
          return;
        }
        // ✅ إذا لم يكن هناك members، لا نضيف room جديداً (للمشاهدين)
      }
      sortRoomsNewestFirst(state.rooms);
    },
    // ✅ Call-Chat Integration: Update room with call state
    updateRoomCallState: (state, action) => {
      const { roomId, callState } = action.payload;
      state.rooms = state.rooms.map((room) =>
        room?._id === roomId
          ? {
              ...room,
              hasActiveCall: callState.hasActiveCall || false,
              activeCallId: callState.activeCallId || null,
              activeCallType: callState.activeCallType || null,
              activeCallStartedAt: callState.activeCallStartedAt || null,
              activeCallParticipants: callState.activeCallParticipants || [],
              activeCallState: callState.activeCallState || null,
            }
          : room
      );
    },
    // ✅ Stream-Chat Integration: Update room with stream state
    updateRoomStreamState: (state, action) => {
      const { roomId, streamState } = action.payload;
      state.rooms = state.rooms.map((room) =>
        room?._id === roomId
          ? {
              ...room,
              hasActiveStream: streamState.hasActiveStream || false,
              activeStreamId: streamState.activeStreamId || null,
              activeStreamBroadcaster: streamState.activeStreamBroadcaster || null,
              activeStreamStartedAt: streamState.activeStreamStartedAt || null,
              activeStreamViewersCount: streamState.activeStreamViewersCount || 0,
              activeStreamSettings: streamState.activeStreamSettings || {},
              activeStreamState: streamState.activeStreamState || null,
            }
          : room
      );
    },
    updateRooms: (state, action) => {
      state.rooms = state.rooms.map((room) =>
        room?._id === action?.payload?._id
          ? normalizeRoomLastMessage({ ...room, ...action.payload })
          : room
      );
      sortRoomsNewestFirst(state.rooms);
    },

    clearRoom: (state) => {
      state.roomId = null;
    },
    setRoomDraft: (state, action) => {
      const { roomId, draft } = action.payload || {};
      if (!roomId) return;
      if (!state.roomDrafts) state.roomDrafts = {};
      state.roomDrafts[String(roomId)] = String(draft || "");
    },
    clearRoomDraft: (state, action) => {
      const roomId = action.payload?.roomId || action.payload;
      if (!roomId) return;
      if (!state.roomDrafts) return;
      delete state.roomDrafts[String(roomId)];
    },
    setUsersTyping: (state, action) => {
      state.usersTyping = action.payload;
    },
    setUsersTyping: (state, action) => {
      state.usersTyping = action.payload;
    },
    addUserTyping: (state, action) => {
      const { userId, roomId, timeoutId } = action.payload;
      const key = `${userId}_${roomId}`;
      if (!state.usersTyping) state.usersTyping = {};
      state.usersTyping[key] = action.payload;
    },
    removeUserTyping: (state, action) => {
      const { userId, roomId } = action.payload;
      const key = `${userId}_${roomId}`;
      if (!state.usersTyping) return;
      delete state.usersTyping[key];
    },
    clearChat: (state) => {
      state.rooms = [];
      state.usersTyping = {};
    },
    changeMemberStatus: (state, action) => {
      state.rooms = state.rooms.map((room) => {
        // التحقق من وجود room و members قبل الوصول إليها
        if (!room || !room.members || !Array.isArray(room.members)) {
          return room;
        }
        
        return room.members.some((member) => member?._id === action.payload.userId)
          ? {
              ...room,
              members: room.members.map((m) =>
                m?._id === action.payload.userId
                  ? {
                      ...m,
                      status: action.payload.status
                        ? action.payload.status
                        : m.status,
                    }
                  : m
              ),
            }
          : room;
      });
    },
    changeMemberLastSeen: (state, action) => {
      state.rooms = state.rooms.map((room) => {
        // التحقق من وجود room و members قبل الوصول إليها
        if (!room || !room.members || !Array.isArray(room.members)) {
          return room;
        }
        
        return room.members.some((member) => member?._id === action.payload.userId)
          ? {
              ...room,
              members: room.members.map((m) =>
                m?._id === action.payload.userId
                  ? {
                      ...m,
                      lastSeen: action.payload.lastSeen
                        ? action.payload.lastSeen
                        : m.lastSeen,
                    }
                  : m
              ),
            }
          : room;
      });
    },
    setFirstLoad: (state, action) => {
      state.firstLoad = action.payload;
    },
    updateOrSetRooms: (state, action) => {
      const incomingRooms = action.payload;

      // Convert rooms array to a map for quick lookup
      const roomMap = new Map(state.rooms.map((room) => [room?._id, room]));

      // Update existing rooms and add new rooms
      incomingRooms.forEach((newRoom) => {
        if (roomMap.has(newRoom?._id)) {
          roomMap.set(newRoom?._id, {
            ...roomMap.get(newRoom?._id),
            ...newRoom,
          }); // ✅ Update existing room
        } else {
          roomMap.set(newRoom?._id, newRoom); // ✅ Add new room
        }
      });

      // Convert back to an array
      state.rooms = normalizeRoomsLastMessages(Array.from(roomMap.values()));
      sortRoomsNewestFirst(state.rooms);
    },
  },
});

export const {
  addMessage,
  setMessages,
  clearThreadPagination,
  threadFetchFailed,
  clearThreadFetchError,
  updateMessage,
  setRooms,
  setRoom,
  addRoom,
  deleteRoom,
  clearRoom,
  setRoomDraft,
  clearRoomDraft,
  clearMessages,
  updateRoom,
  updateRoomCallState,
  updateRoomStreamState,
  unShiftRoom,
  updateRooms,
  setUsersTyping,
  addUserTyping,
  removeUserTyping,
  clearChat,
  changeMemberStatus,
  changeMemberLastSeen,
  setFirstLoad,
  updateOrSetRooms,
} = chatSlice.actions;

export const selectChats = (state) => state.chats;

export default chatSlice.reducer;
