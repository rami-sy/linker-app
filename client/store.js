import { configureStore } from "@reduxjs/toolkit";
import rootReducer from "./src/redux/reducers";
import { persistStore, persistReducer } from "redux-persist";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setStoreInstance } from "./lib/useColorScheme";

/** Ensure persisted `chats` has object maps added in later app versions. */
async function migratePersistedState(state) {
  if (!state?.chats) return state;
  const chats = { ...state.chats };
  const rooms = Array.isArray(chats.rooms) ? chats.rooms : [];
  const nowTs = Date.now();
  const ACTIVE_CALL_PERSIST_GRACE_MS = 3 * 60 * 1000;
  let didSanitizeAnyRoom = false;
  const sanitizedRooms = rooms.map((room) => {
    if (!room || typeof room !== "object") return room;
    const syncedAt = Number(room?.activeCallParticipantsSyncedAt || 0);
    const participantsCount = Array.isArray(room?.activeCallParticipants)
      ? room.activeCallParticipants.length
      : 0;
    const isFreshActiveSnapshot =
      room?.hasActiveCall === true &&
      participantsCount > 0 &&
      Number.isFinite(syncedAt) &&
      syncedAt > 0 &&
      nowTs - syncedAt <= ACTIVE_CALL_PERSIST_GRACE_MS;
    if (isFreshActiveSnapshot) {
      return room;
    }
    const hasCallFields =
      room.hasActiveCall != null ||
      room.activeCallId != null ||
      room.activeCallType != null ||
      room.activeCallStartedAt != null ||
      room.activeCallState != null ||
      room.activeCallParticipantsSyncedAt != null ||
      (Array.isArray(room.activeCallParticipants) &&
        room.activeCallParticipants.length > 0);
    if (!hasCallFields) return room;
    didSanitizeAnyRoom = true;
    return {
      ...room,
      // Ephemeral call status must never survive app refresh from persisted cache.
      hasActiveCall: false,
      activeCallId: null,
      activeCallType: null,
      activeCallStartedAt: null,
      activeCallState: null,
      activeCallParticipants: [],
      activeCallParticipantsSyncedAt: nowTs,
    };
  });
  let changed = false;
  if (chats.roomDrafts == null) {
    chats.roomDrafts = {};
    changed = true;
  }
  if (chats.usersTyping == null) {
    chats.usersTyping = {};
    changed = true;
  }
  if (didSanitizeAnyRoom) {
    chats.rooms = sanitizedRooms;
    changed = true;
  }
  if (!changed) return state;
  return { ...state, chats };
}

const persistConfig = {
  key: "root",
  version: 1,
  storage: AsyncStorage,
  whitelist: ["app", "users", "chats", ], // Only persist the users slice, add other slices as needed
  migrate: migratePersistedState,
  debug: true,
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});

export const persistor = persistStore(store);

// Set store instance for useColorScheme to access without Provider
setStoreInstance(store);

export default store;

// import { configureStore } from "@reduxjs/toolkit";
// import rootReducer from "./src/redux/reducers";
// import { autoDeleteAlertMiddleware } from "./src/redux/alertSlice";

// const store = configureStore({
//   reducer: rootReducer,
//   middleware: (getDefaultMiddleware) =>
//     getDefaultMiddleware().concat(autoDeleteAlertMiddleware),
// });

// export default store;
