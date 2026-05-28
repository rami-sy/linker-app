import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, useWindowDimensions } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { io } from "socket.io-client";
import { useTranslation } from "react-i18next";
import logger from "../utils/logger";
import {
  addMessage,
  changeMemberLastSeen,
  changeMemberStatus,
  clearMessages,
  clearRoom,
  deleteRoom,
  setMessages,
  threadFetchFailed,
  setRoom,
  unShiftRoom,
  updateMessage,
  updateRooms,
} from "../redux/chatSlice";
import { getItem, removeItem } from "../utils/localStorage";
import {
  changeUserLastSeen,
  changeUserStatus,
  setMe,
  setSocketId,
} from "../redux/userSlice";
import uuid from "react-native-uuid";
import { usePushNotifications } from "../../usePushNotifications";
import { fetchDeviceId, getDeviceInfo, updateProfile } from "../api/me";
import getFullName from "../utils/getFullName";
import Constants from "expo-constants";
import useSelectedRoom from "../hooks/use-selected-room";
import { router, usePathname, useSegments } from "expo-router";
import { removeDevice, setDevices, clearSessionExpired } from "../redux/appSlice";
import { addAlert } from "../redux/alertSlice";
import useInAppNotifications from "../hooks/useInAppNotifications";
import RoomStateSync from "../utils/roomStateSync"; // ✅ Room State Sync
import SocketEventCoordinator from "../utils/socketEventCoordinator"; // ✅ Socket Event Coordinator
import { updateRoom as updateRoomAction } from "../redux/chatSlice"; // ✅ Added for Room State Sync
import offlineQueue from "../utils/offlineQueue"; // ✅ Offline Queue
import normalizeMongoId from "../utils/normalizeMongoId";
import { normalizeDispatchedScheduledMessage } from "../utils/effectiveMessageTimestamp";
import { registerDeviceKeysOnServer, loadOrCreateDeviceKeys } from "../crypto/e2eeDevice";
import {
  getCachedRoomKey,
  ensureRoomKeyFromServer,
  submitWrapForMember,
} from "../crypto/e2eeRoom";
import { encryptTextMessage } from "../crypto/e2eeCore";
import { tryDecryptChatMessage } from "../crypto/e2eeMessageHelpers";
import { hexToBytes } from "@noble/hashes/utils";
import {
  NotificationTypes,
} from "../utils/notificationContract";

const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;
const AUTO_RETRY_DELAYS_MS = [5000, 15000, 30000];
const MAX_AUTO_RETRY_ATTEMPTS = AUTO_RETRY_DELAYS_MS.length;

/** Room id from current route — source of truth for “user is viewing this thread” (fixes stale focus on web/stack). */
function openChatRoomIdFromPathname(pathname) {
  if (!pathname || typeof pathname !== "string") return null;
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const m = normalized.match(/\/chats\/([^/]+)/);
  const seg = m?.[1];
  if (!seg || seg === "index") return null;
  return seg;
}

/** Fallback when pathname omits the dynamic segment (some web / nested layouts). */
function openChatRoomIdFromSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const i = segments.lastIndexOf("chats");
  if (i < 0) return null;
  const next = segments[i + 1];
  if (
    !next ||
    next === "chats" ||
    next === "index" ||
    next.startsWith("(")
  ) {
    return null;
  }
  return next;
}

export const SocketContext = React.createContext({
  socket: null,
  socketConnected: false,
  isReconnecting: false,
  queuedOperations: 0,
  emitWithAck: async () => ({ type: "error", message: "Socket unavailable" }),
});

export const SocketContextProvider = ({ children }) => {
  const { t } = useTranslation();
  const [currentSocket, setCurrentSocket] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [queuedOperations, setQueuedOperations] = useState(0);
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.users);
  const { rooms } = useSelector((state) => state.chats);
  const reduxChatsRoomId = useSelector((state) => state.chats?.roomId);
  const sessionExpired = useSelector((state) => state.app.sessionExpired);
  const currentRoom = useSelectedRoom();
  const pathname = usePathname();
  const segments = useSegments();
  const { width: windowWidth } = useWindowDimensions();

  const openChatRoomIdRef = useRef(null);
  const pathnameRef = useRef(pathname);
  const windowWidthRef = useRef(windowWidth);
  const userRef = useRef(user);
  const appActiveRef = useRef(true);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  useEffect(() => {
    windowWidthRef.current = windowWidth;
  }, [windowWidth]);
  useEffect(() => {
    const fromPath = openChatRoomIdFromPathname(pathname);
    // On native stacks, segments can remain stale during transitions and cause
    // false "in-chat" detection. Prefer pathname always; only use segments
    // fallback on web when pathname does not include a concrete room id.
    if (fromPath) {
      openChatRoomIdRef.current = fromPath;
      return;
    }
    if (Platform.OS === "web") {
      const fromSeg = openChatRoomIdFromSegments(segments);
      openChatRoomIdRef.current = fromSeg || null;
      return;
    }
    openChatRoomIdRef.current = null;
  }, [pathname, segments]);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    if (Platform.OS === "web" && typeof globalThis.document !== "undefined") {
      const updateVisibility = () => {
        const visible = globalThis.document.visibilityState === "visible";
        // On web multi-window testing, document.hasFocus() is often false even while
        // the chat is clearly visible, which can suppress legitimate read receipts.
        appActiveRef.current = visible;
      };
      updateVisibility();
      globalThis.document.addEventListener("visibilitychange", updateVisibility);
      globalThis.window?.addEventListener?.("focus", updateVisibility);
      globalThis.window?.addEventListener?.("blur", updateVisibility);
      return () => {
        globalThis.document.removeEventListener(
          "visibilitychange",
          updateVisibility
        );
        globalThis.window?.removeEventListener?.("focus", updateVisibility);
        globalThis.window?.removeEventListener?.("blur", updateVisibility);
      };
    }

    appActiveRef.current = AppState.currentState === "active";
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        appActiveRef.current = nextState === "active";
      }
    );
    return () => {
      appStateSubscription?.remove?.();
    };
  }, []);

  const { emitInAppNotification, handleSocketNotificationEvent } =
    useInAppNotifications({
      dispatch,
      openChatRoomIdRef,
    });

  const e2eeDeviceKeysRef = useRef(null);
  const executeOperationUnsubRef = useRef(null);
  const retryTimersRef = useRef(new Map());
  const autoRetryInFlightRef = useRef(new Set());
  const scheduledCallReminderKeysRef = useRef(new Set());
  const roomsRef = useRef(rooms);
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  const forceLogoutNow = useCallback(
    async (reason = "unknown") => {
      try {
        await removeItem("accessToken");
        await removeItem("refreshToken");
        await removeItem("daysRemaining");
        await removeItem("lastSyncTime");
      } catch (_) {}
      try {
        await offlineQueue.clearQueue?.();
      } catch (_) {}
      try {
        currentSocket?.emit?.("userDisconnected", {}, () => {
          try {
            currentSocket?.disconnect?.();
          } catch (_) {}
        });
      } catch (_) {
        try {
          currentSocket?.disconnect?.();
        } catch (_) {}
      }
      setSocketConnected(false);
      setIsReconnecting(false);
      setCurrentSocket(null);
      router.push({
        pathname: "/welcome",
        params: {
          forceLogout: true,
          reason,
        },
      });
    },
    [currentSocket]
  );

  // When axiosInstance fails to refresh the access token it sets sessionExpired.
  // React to that here and perform a full forced logout.
  useEffect(() => {
    if (!sessionExpired) return;
    dispatch(clearSessionExpired());
    void forceLogoutNow("session_expired");
  }, [sessionExpired]);

  useEffect(() => {
    const REMINDER_WINDOW_MS = 5 * 60 * 1000;
    const tick = () => {
      const now = Date.now();
      for (const room of roomsRef.current || []) {
        const roomId = String(room?._id || "");
        if (!roomId) continue;
        for (const msg of Object.values(room?.messages || {})) {
          if (!msg || msg?.deletedForAll) continue;
          if (String(msg?.type || "") !== "call_event") continue;
          if (String(msg?.status || "") !== "scheduled") continue;
          let meta = null;
          try {
            meta =
              msg?.content && typeof msg.content === "string"
                ? JSON.parse(msg.content)
                : msg?.content || null;
          } catch {
            meta = null;
          }
          const eventKind = String(
            meta?.eventKind || meta?.status || ""
          ).toLowerCase();
          if (eventKind !== "scheduled") continue;
          const whenRaw = meta?.scheduledFor || msg?.scheduledAt || null;
          const when = whenRaw ? new Date(whenRaw).getTime() : NaN;
          if (!Number.isFinite(when)) continue;
          const diff = when - now;
          if (diff <= 0 || diff > REMINDER_WINDOW_MS) continue;
          const messageKey = String(msg?._id || msg?.uuId || "");
          if (!messageKey) continue;
          const scheduleToken = String(
            meta?.scheduledFor || msg?.scheduledAt || ""
          );
          const dedupeKey = `scheduled_call_reminder:${roomId}:${messageKey}:${scheduleToken}`;
          if (scheduledCallReminderKeysRef.current.has(dedupeKey)) continue;
          scheduledCallReminderKeysRef.current.add(dedupeKey);
          dispatch(
            addAlert({
              type: "warning",
              title: t("chat.scheduledCallReminderTitle", {
                defaultValue: "Upcoming scheduled call",
              }),
              message:
                room?.name && String(room.name).trim()
                  ? t("chat.scheduledCallReminderBodyWithRoom", {
                      defaultValue:
                        'Your scheduled call in "{{roomName}}" starts soon.',
                      roomName: String(room.name),
                    })
                  : t("chat.scheduledCallReminderBody", {
                      defaultValue:
                        "Your scheduled call starts in a few minutes.",
                    }),
              eventType: NotificationTypes.SYSTEM_SUCCESS,
              route: `/chats/${roomId}`,
              actionLabel: t("chat.scheduledCallReminderOpenAction", {
                defaultValue: "Open",
              }),
              duration: 9000,
              dedupeKey,
            })
          );
        }
      }
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [dispatch, t]);

  // ✅ إعادة تشغيل WebSocket عند وصول إشعار
  const handleNotification = () => {
    logger.info("Reconnecting socket due to push notification...");
    reconnectSocket();

    // setTimeout(() => {
    //   console.log("🛑 Disconnecting socket after receiving messages...");
    //   disconnectSocket();
    // }, 15000); // يغلق السوكت بعد 15 ثانية
  };

  const { expoPushToken } = usePushNotifications(handleNotification);

  useEffect(() => {
    if (expoPushToken) {
      updateProfile({
        expoPushToken: expoPushToken,
      }).catch((error) => {
        logger.warn("Failed to sync expo push token", error?.message || error);
      });
    }
  }, [expoPushToken]);
  const userNotFound = (data, socket) => {
    logger.info("userNotFound", data);
    try {
      socket?.disconnect?.();
    } catch (error) {
      logger.warn("socket disconnect during userNotFound failed", error);
    }
    void forceLogoutNow("userNotFound");
  };
  const connectSocket = async (force = false) => {
    if (!currentSocket || force) {
      let token = null;
      try {
        const rawToken = await getItem("accessToken");
        token = rawToken ? JSON.parse(rawToken) : null;
      } catch (error) {
        logger.error("Failed to parse auth token for socket connection", error);
      }
      if (!token) {
        setSocketConnected(false);
        setIsReconnecting(false);
        return;
      }

      logger.info("connecting to socket");
      const socket = io(apiUrl, {
        transports: ["websocket", "polling", "flashsocket"],
        auth: {
          token: token,
        },
      });
      // Provide the socket instance immediately so UI handlers can safely
      // no-op/queue while the connection is still being established.
      setCurrentSocket(socket);
      socket.on("connect", async (data) => {
        logger.info("Socket connected.");
        setSocketConnected(true);
        setIsReconnecting(false);

        const device = await getDeviceInfo();
        logger.debug("socket.deviceInfo", device);
        setCurrentSocket(socket);
        registerDeviceKeysOnServer(socket).then((reg) => {
          if (reg?.ok && reg.keys) {
            e2eeDeviceKeysRef.current = reg.keys;
          }
        });
        socket.emit(
          "userConnected",
          {
            userId: user?._id,
            device,
          },
          (res) => {
            logger.info({ res });
            if (res.type === "success") {
              dispatch(setMe(res.data));
            }
          }
        );
      });
      socket.on("socketId", (data) => {
        dispatch(setSocketId(data.socketId));
      });
      socket.on("userNotFound", (data) => userNotFound(data, socket));
      socket.on("connect_error", (error) => {
        logger.error("Socket connect error", error?.message || error);
        setSocketConnected(false);
        setIsReconnecting(true);
        setCurrentSocket(null);
        const msg = String(error?.message || "");
        const isAuthError =
          msg.includes("Invalid token") ||
          msg.toLowerCase().includes("authentication error") ||
          msg.toLowerCase().includes("unauthorized");
        if (isAuthError) {
          void forceLogoutNow("socket_auth_error");
          return;
        }
        try {
          socket.disconnect();
        } catch (_) {}
        dispatch(
          addAlert({
            type: "error",
            title: "Connection issue",
            message:
              error?.message === "Authentication error: Invalid token"
                ? "Session expired. Please sign in again."
                : "Unable to connect. Retrying...",
            eventType: NotificationTypes.SYSTEM_ERROR,
            dedupeKey: "system_error:socket_connect",
          })
        );
      });

      socket.on("disconnect", () => {
        logger.info("Socket disconnected.");
        setSocketConnected(false);
        setIsReconnecting(true);
        setCurrentSocket(null);
      });
    }
  };

  const reconnectSocket = async () => {
    logger.info("Reconnecting socket...");
    if (currentSocket) {
      try {
        currentSocket.disconnect();
      } catch (_) {}
      setCurrentSocket(null);
    }
    await connectSocket(true);
  };

  // دالة فصل السوكت بعد فترة قصيرة
  const disconnectSocket = () => {
    if (currentSocket) {
      logger.info("Disconnecting socket...");
      currentSocket.disconnect();
      setCurrentSocket(null);
    }
  };

  useEffect(() => {
    if (!currentSocket) {
      connectSocket();
    }

    return () => {
      if (currentSocket) {
        currentSocket.off("deliveredTo", deliveredTo);
        currentSocket.off("getOneRoom", getOneRoom);
        currentSocket.disconnect();
        setCurrentSocket(null);
      }
    };
  }, [currentSocket]); // Add dependencies if needed

  useEffect(() => {
    const syncQueueSize = () => setQueuedOperations(offlineQueue.getQueueSize());
    const onQueued = () => syncQueueSize();
    const onProcessed = (result) => {
      syncQueueSize();
      if (result?.successful) {
        dispatch(
          addAlert({
            type: "success",
            title: "Sync complete",
            message: `${result.successful} queued action(s) synced.`,
            eventType: NotificationTypes.SYSTEM_SUCCESS,
            dedupeKey: "system_success:offline_queue_synced",
          })
        );
      }
    };
    const onFailed = (operation) => {
      syncQueueSize();
      if (operation?.type === "sendMessage") {
        const queuedMessage = operation?.data?.message;
        const messageRoom = queuedMessage?.room;
        const messageUuId = queuedMessage?.uuId;
        if (messageRoom && messageUuId) {
          dispatch(
            updateMessage({
              room: messageRoom,
              uuId: messageUuId,
              status: "failed",
            })
          );
        }
      }
    };
    const onCleared = () => syncQueueSize();
    syncQueueSize();
    const unsubQueued = offlineQueue.on("operationQueued", onQueued);
    const unsubProcessed = offlineQueue.on("queueProcessed", onProcessed);
    const unsubFailed = offlineQueue.on("operationFailed", onFailed);
    const unsubCleared = offlineQueue.on("queueCleared", onCleared);
    return () => {
      unsubQueued?.();
      unsubProcessed?.();
      unsubFailed?.();
      unsubCleared?.();
    };
  }, [dispatch]);
  const requestedRooms = useRef(new Set());
  const processedIncomingIdsRef = useRef(new Set());

  useEffect(() => {
    if (!currentSocket) return;
    processedIncomingIdsRef.current = new Set();
  }, [currentSocket]);

  // ✅ Integration Services Refs
  const roomStateSyncRef = useRef(null);
  const socketEventCoordinatorRef = useRef(null);

  // ✅ Initialize Integration Services when socket is ready
  useEffect(() => {
    if (currentSocket && dispatch) {
      // Initialize Room State Sync
      if (!roomStateSyncRef.current) {
        roomStateSyncRef.current = new RoomStateSync(
          dispatch,
          (updates) => dispatch(updateRoomAction(updates)),
          currentSocket
        );
      }

      // Initialize Socket Event Coordinator
      if (!socketEventCoordinatorRef.current) {
        socketEventCoordinatorRef.current = new SocketEventCoordinator(
          currentSocket
        );
      }

      // ✅ Initialize Offline Queue
      offlineQueue.initialize();

      if (executeOperationUnsubRef.current) {
        executeOperationUnsubRef.current();
        executeOperationUnsubRef.current = null;
      }

      // ✅ Register operation handlers for offline queue
      executeOperationUnsubRef.current = offlineQueue.on(
        "executeOperation",
        async (operation) => {
        try {
          switch (operation.type) {
            case "sendMessage":
              if (currentSocket && currentSocket.emit) {
                return new Promise((resolve) => {
                  const queuedMessage = operation?.data?.message;
                  currentSocket.emit(
                    "sendMessage",
                    operation.data,
                    (response) => {
                      const responseType = response?.type;
                      if (
                        responseType === "success" ||
                        responseType === "scheduled" ||
                        responseType === "queued"
                      ) {
                        if (queuedMessage?.room && queuedMessage?.uuId) {
                          dispatch(
                            updateMessage({
                              room: queuedMessage.room,
                              uuId: queuedMessage.uuId,
                              status:
                                responseType === "scheduled"
                                  ? "scheduled"
                                  : responseType === "queued"
                                  ? "queued"
                                  : "sent",
                              ...(responseType === "scheduled"
                                ? {
                                    scheduledAt:
                                      response?.scheduledAt ||
                                      queuedMessage?.scheduledAt ||
                                      null,
                                  }
                                : {}),
                            })
                          );
                        }
                        resolve(true);
                        return;
                      }
                      resolve(false);
                    }
                  );
                });
              }
              break;
            case "reactToMessage":
              if (currentSocket && currentSocket.emit) {
                return new Promise((resolve) => {
                  currentSocket.emit(
                    "reactToMessage",
                    operation.data,
                    (response) => {
                      resolve(response?.type === "success");
                    }
                  );
                });
              }
              break;
            default:
              logger.warn("Unknown operation type in offline queue", {
                type: operation.type,
              });
              return false;
          }
        } catch (error) {
          logger.error("Error executing offline operation:", error);
          return false;
        }
      }
      );

      // ✅ Listen for socket connection state changes to sync offline queue
      const handleConnect = () => {
        logger.info("Socket connected, syncing offline queue...");
        try {
          // Before replaying queued operations, fetch authoritative room state for any rooms touched.
          const roomStateSync = roomStateSyncRef.current;
          const queued = offlineQueue.getQueue?.() || [];
          const roomIds = new Set();
          for (const op of queued) {
            const rid =
              op?.type === "sendMessage"
                ? op?.data?.message?.room
                : op?.data?.room;
            if (rid) roomIds.add(String(rid));
          }
          if (roomStateSync && typeof roomStateSync.fetchLatestState === "function") {
            for (const rid of roomIds) {
              roomStateSync.fetchLatestState(rid);
            }
          }
        } catch (error) {
          logger.warn("Failed to resync rooms after reconnect", error);
        }
      };

      const handleDisconnect = () => {
        logger.info("Socket disconnected, queueing operations...");
      };

      currentSocket.on("connect", handleConnect);
      currentSocket.on("disconnect", handleDisconnect);
    }

    return () => {
      // Cleanup on unmount
      if (roomStateSyncRef.current) {
        roomStateSyncRef.current.cleanup();
        roomStateSyncRef.current = null;
      }
      if (socketEventCoordinatorRef.current) {
        socketEventCoordinatorRef.current.cleanup();
        socketEventCoordinatorRef.current = null;
      }
      if (executeOperationUnsubRef.current) {
        executeOperationUnsubRef.current();
        executeOperationUnsubRef.current = null;
      }

      // Remove socket listeners
      if (currentSocket) {
        currentSocket.off("connect");
        currentSocket.off("disconnect");
      }
    };
  }, [currentSocket, dispatch]);

  useEffect(() => {
    return () => {
      offlineQueue.cleanup();
    };
  }, []);

  const applyIncomingToRedux = useCallback(
    async ({ message, messageRoom, topLevelSender }) => {
      if (!currentSocket || !message) return;

      const isStreamMessage =
        !!message?.call ||
        !!message?.callId ||
        !!message?.isLiveComment;
      if (isStreamMessage) return;

      const incomingRoom =
        normalizeMongoId(message?.room) || normalizeMongoId(messageRoom);
      if (!incomingRoom) return;

      const dedupeKey = String(message?.uuId || message?._id || "");
      if (dedupeKey) {
        if (processedIncomingIdsRef.current.has(dedupeKey)) {
          return;
        }
        processedIncomingIdsRef.current.add(dedupeKey);
      }

      const rawSender =
        topLevelSender ??
        message?.user ??
        message?.senderSnapshot?._id ??
        message?.senderSnapshot?.userId ??
        message?.sender?._id;
      const senderRaw = rawSender;
      const senderId =
        senderRaw != null &&
        typeof senderRaw === "object" &&
        senderRaw._id != null
          ? senderRaw._id
          : senderRaw;
      const me = userRef.current?._id;
      const isOwn =
        me != null &&
        senderId != null &&
        String(senderId) === String(me);

      const viewingRoom = openChatRoomIdRef.current;
      const isViewingThisChat =
        viewingRoom != null && String(viewingRoom) === incomingRoom;

      const rnW = windowWidthRef.current;
      const viewportWidth =
        Platform.OS === "web" && typeof globalThis.window !== "undefined"
          ? globalThis.window.innerWidth
          : rnW;
      const webWideSplit = Platform.OS === "web" && viewportWidth >= 768;
      const incrementUnread =
        !isOwn && (!isViewingThisChat || webWideSplit);

      const roomMeta = roomsRef.current?.find(
        (r) =>
          String(normalizeMongoId(r?._id)) === String(incomingRoom)
      );
      let payload = normalizeDispatchedScheduledMessage(message);
      if (message?.e2ee?.ciphertext && userRef.current?._id) {
        try {
          let dk = e2eeDeviceKeysRef.current;
          if (!dk) {
            dk = await loadOrCreateDeviceKeys();
            e2eeDeviceKeysRef.current = dk;
          }
          payload = await tryDecryptChatMessage(
            message,
            incomingRoom,
            roomMeta?.e2ee,
            currentSocket,
            userRef.current._id,
            dk
          );
        } catch (e) {
          logger.warn("E2EE decrypt incoming", e);
        }
      }
      payload = normalizeDispatchedScheduledMessage(payload);
      const payloadKey = payload?.uuId || payload?._id || null;
      const existingByPayloadKey =
        payloadKey && roomMeta?.messages ? roomMeta.messages[payloadKey] : null;
      const existingByMongoId =
        payload?._id && roomMeta?.messages
          ? Object.values(roomMeta.messages).find(
              (m) => String(m?._id || "") === String(payload._id)
            )
          : null;
      dispatch(
        addMessage({
          ...payload,
          status: "sent",
          room: incomingRoom,
          incrementUnread,
        })
      );

      if (!isOwn && currentSocket && message?._id) {
        currentSocket.emit("deliveredTo", {
          message: message._id,
          room: incomingRoom,
        });
      }

      if (!isOwn && isViewingThisChat && appActiveRef.current) {
        currentSocket.emit("messageSeen", {
          message: message?._id,
          room: incomingRoom,
        });
      }
    },
    [currentSocket, dispatch]
  );

  const deliveredMessage = ({ message, room }) => {
    logger.info("deliveredMessage", message);
    if (
      String(message?.scheduleStatus || "") === "scheduled" &&
      String(message?.user || "") !== String(userRef.current?._id || "")
    ) {
      return;
    }
    currentSocket.emit("deliveredTo", {
      message: message?._id,
      room: room,
    });

    const authorId = normalizeMongoId(message?.user);
    const myId = normalizeMongoId(userRef.current?._id);
    if (authorId && myId && authorId !== myId) {
      void applyIncomingToRedux({
        message,
        messageRoom: room,
        topLevelSender: message?.user,
      });
    }

    const roomExists = rooms.some(
      (r) =>
        String(normalizeMongoId(r?._id)) ===
        String(normalizeMongoId(message?.room))
    );

    const msgRoomKey = normalizeMongoId(message?.room);
    if (
      String(authorId) !== String(myId) &&
      !roomExists &&
      msgRoomKey
    ) {
      if (!requestedRooms.current.has(msgRoomKey)) {
        requestedRooms?.current.add(msgRoomKey);
        logger.info("getOneRoom", msgRoomKey);
        currentSocket.emit("getOneRoom", {
          room: msgRoomKey,
        });
      } else {
        logger.info("Room request already made:", msgRoomKey);
      }
    }

    const incomingRoomId = String(room || message?.room || "");
    const isViewingSameRoom =
      openChatRoomIdRef.current &&
      incomingRoomId &&
      String(openChatRoomIdRef.current) === incomingRoomId;
    if (!isViewingSameRoom && String(authorId) !== String(myId)) {
      emitInAppNotification(
        {
          type: NotificationTypes.CHAT_MESSAGE,
          title:
            getFullName(message?.user || {}, true) ||
            message?.user?.userName ||
            "New message",
          body: message?.text || "You received a new message",
          entityType: "room",
          entityId: incomingRoomId,
          route: incomingRoomId ? `/chats/${incomingRoomId}` : null,
          dedupeKey: `chat_message:${String(message?._id || message?.uuId || "")}`,
          priority: "normal",
          meta: {
            roomId: incomingRoomId,
            messageId: String(message?._id || ""),
          },
        },
        { actionLabel: "Open" }
      );
    }
  };

  const deliveredTo = async ({ message, room }) => {
    logger.info("deliveredTo", message);
    let payload = normalizeDispatchedScheduledMessage(message);
    if (message?.e2ee?.ciphertext && userRef.current?._id) {
      try {
        let dk = e2eeDeviceKeysRef.current;
        if (!dk) {
          dk = await loadOrCreateDeviceKeys();
          e2eeDeviceKeysRef.current = dk;
        }
        const targetRoom = room || message?.room;
        const roomMeta = roomsRef.current?.find(
          (r) =>
            String(normalizeMongoId(r?._id)) ===
            String(normalizeMongoId(targetRoom))
        );
        payload = await tryDecryptChatMessage(
          message,
          targetRoom,
          roomMeta?.e2ee,
          currentSocket,
          userRef.current._id,
          dk
        );
      } catch (e) {
        logger.warn("E2EE decrypt deliveredTo", e);
      }
    }
    payload = normalizeDispatchedScheduledMessage(payload);
    dispatch(
      updateMessage({
        ...payload,
        room: room,
      })
    );
  };

  const getOneRoom = (data) => {
    if (__DEV__) {
      logger.debug("socket.getOneRoom", {
        update: Boolean(data?.update),
        roomId: data?.room?._id ? String(data.room._id) : null,
      });
    }
    if (data?.update) {
      // ✅ Room State Sync: Handle server state update
      const roomStateSync = roomStateSyncRef.current;
      if (roomStateSync && data?.room) {
        roomStateSync.handleServerStateUpdate({
          roomId: data.room._id,
          room: data.room,
          stateVersion: data.room.stateVersion || 1,
        });
      } else {
        // ✅ إضافة skipAddIfNotExists عند update لمنع إنشاء room جديد للمشاهدين
        // ✅ خاصة عند تحويل المكالمة إلى ستريم
        dispatch(updateRoom({
          ...data?.room,
          skipAddIfNotExists: true, // ✅ منع إضافة room جديد للمشاهدين
        }));
      }
    } else {
      if (__DEV__) {
        logger.debug("socket.getOneRoom.unshift", {
          roomId: data?.room?._id ? String(data.room._id) : null,
        });
      }
      requestedRooms?.current?.delete(data?.room?._id);

      // ✅ إضافة skipAddIfNotExists لمنع إنشاء room جديد للمشاهدين
      // ✅ خاصة عند تحويل المكالمة إلى ستريم
      dispatch(unShiftRoom({
        ...data?.room,
        skipAddIfNotExists: true, // ✅ منع إضافة room جديد للمشاهدين
      }));

      // ✅ Room State Sync: Initialize room state sync
      const roomStateSync = roomStateSyncRef.current;
      if (roomStateSync && data?.room) {
        roomStateSync.initializeRoom(
          data.room._id,
          data.room.stateVersion || 1
        );
      }
    }
  };
  const getMessages = async ({
    messages,
    currentPage,
    hasMore,
    room,
    override,
  }) => {
    if (__DEV__) {
      logger.debug("socket.getMessages", {
        roomId: room ? String(room) : null,
        count: Array.isArray(messages) ? messages.length : 0,
        override: Boolean(override),
        currentPage,
        hasMore,
      });
    }
    const roomMeta = roomsRef.current?.find(
      (r) =>
        String(normalizeMongoId(r?._id)) === String(normalizeMongoId(room))
    );
    let dk = e2eeDeviceKeysRef.current;
    if (!dk && messages?.some((m) => m?.e2ee?.ciphertext)) {
      try {
        dk = await loadOrCreateDeviceKeys();
        e2eeDeviceKeysRef.current = dk;
      } catch (e) {
        logger.warn("E2EE keys for getMessages", e);
      }
    }
    const messagesObject = {};
    const list = [...messages].reverse();
    for (const message of list) {
      const key = message?.uuId || message?._id;
      if (!key) {
        continue;
      }
      let m = normalizeDispatchedScheduledMessage(message);
      if (message?.e2ee?.ciphertext && currentSocket && userRef.current?._id && dk) {
        try {
          m = await tryDecryptChatMessage(
            message,
            normalizeMongoId(room),
            roomMeta?.e2ee,
            currentSocket,
            userRef.current._id,
            dk
          );
        } catch (e) {
          logger.warn("E2EE decrypt history", e);
        }
      }
      m = normalizeDispatchedScheduledMessage(m);
      messagesObject[key] = m;
    }
    dispatch(
      setMessages({
        messages: messagesObject,
        currentPage,
        hasMore,
        room,
        override,
      })
    );
  };

  const getThreadMessages = async ({
    messages,
    currentPage,
    hasMore,
    room,
    threadRoot,
    override,
  }) => {
    try {
      const roomMeta = roomsRef.current?.find(
        (r) =>
          String(normalizeMongoId(r?._id)) === String(normalizeMongoId(room))
      );
      let dk = e2eeDeviceKeysRef.current;
      if (!dk && messages?.some((m) => m?.e2ee?.ciphertext)) {
        try {
          dk = await loadOrCreateDeviceKeys();
          e2eeDeviceKeysRef.current = dk;
        } catch (e) {
          logger.warn("E2EE keys for getThreadMessages", e);
        }
      }
      const messagesObject = {};
      const list = [...messages].reverse();
      for (const message of list) {
        const key = message?.uuId || message?._id;
        if (!key) {
          continue;
        }
        let m = normalizeDispatchedScheduledMessage(message);
        if (
          message?.e2ee?.ciphertext &&
          currentSocket &&
          userRef.current?._id &&
          dk
        ) {
          try {
            m = await tryDecryptChatMessage(
              message,
              normalizeMongoId(room),
              roomMeta?.e2ee,
              currentSocket,
              userRef.current._id,
              dk
            );
          } catch (e) {
            logger.warn("E2EE decrypt thread history", e);
          }
        }
        messagesObject[key] = normalizeDispatchedScheduledMessage(m);
      }
      dispatch(
        setMessages({
          messages: messagesObject,
          currentPage,
          hasMore,
          room,
          override: override ?? false,
          mergeOnly: true,
          threadRoot,
        })
      );
    } catch (e) {
      logger.error("getThreadMessages handler failed", e);
      dispatch(
        threadFetchFailed({
          room,
          threadRoot,
          message: e?.message || "Failed to process thread messages",
        })
      );
    }
  };

  const onGetThreadMessagesError = useCallback(
    (payload) => {
      if (payload?.room == null) return;
      dispatch(
        threadFetchFailed({
          room: payload.room,
          threadRoot: payload.threadRoot ?? null,
          message:
            payload.message ||
            payload.error ||
            "Failed to load thread messages",
        })
      );
    },
    [dispatch]
  );

  const getDevices = async (data) => {
    logger.debug("devices.list", { count: Array.isArray(data) ? data.length : 0 });
    const deviceId = await fetchDeviceId();
    const device = data.find((d) => d.deviceId === deviceId);
    dispatch(setDevices(data));

    if (device && device.forceLogout) {
      void forceLogoutNow("device_force_logout");
    }
  };
  const deviceDisconnected = (data) => {
    logger.info("deviceDisconnected", data);
    // dispatch(removeDevice(data.deviceId));
    dispatch(removeDevice(data._id));
    void forceLogoutNow("device_disconnected");
  };

  const [deviceId, setDeviceId] = useState(null);
  useEffect(() => {
    if (currentSocket) {
      currentSocket.on("deliveredTo", deliveredTo);
      currentSocket.on("otherUserStatusChanged", otherUserStatusChanged);
      currentSocket.on("otherUserLastSeenChanged", otherUserLastSeenChanged);
      currentSocket.on("getMessages", getMessages);
      currentSocket.on("getThreadMessages", getThreadMessages);
      currentSocket.on("getThreadMessagesError", onGetThreadMessagesError);
      currentSocket.on("getDevices", getDevices);
      currentSocket.on("deviceDisconnected", deviceDisconnected);
      currentSocket.on("notificationEvent", handleSocketNotificationEvent);

      return () => {
        if (currentSocket) {
          currentSocket.off("deliveredTo", deliveredTo);
          currentSocket.off("otherUserStatusChanged", otherUserStatusChanged);
          currentSocket.off(
            "otherUserLastSeenChanged",
            otherUserLastSeenChanged
          );
          currentSocket.off("getMessages", getMessages);
          currentSocket.off("getThreadMessages", getThreadMessages);
          currentSocket.off("getThreadMessagesError", onGetThreadMessagesError);
          currentSocket.off("getDevices", getDevices);
          currentSocket.off("deviceDisconnected", deviceDisconnected);
          currentSocket.off("notificationEvent", handleSocketNotificationEvent);
          setDeviceId(null);
        }
      };
    }
  }, [currentSocket, handleSocketNotificationEvent]);

  useEffect(() => {
    if (!currentSocket) return;

    const onReceiveMessage = ({ message, room: messageRoom, user: sender }) => {
      void applyIncomingToRedux({
        message,
        messageRoom,
        topLevelSender: sender,
      });
    };

    currentSocket.on("receiveMessage", onReceiveMessage);
    return () => {
      currentSocket.off("receiveMessage", onReceiveMessage);
    };
  }, [currentSocket, applyIncomingToRedux]);

  useEffect(() => {
    if (!currentSocket) return;
    const onPollUpdated = ({ message, room }) => {
      if (!message || !room) return;
      dispatch(
        updateMessage({
          ...message,
          room,
        })
      );
    };
    currentSocket.on("pollUpdated", onPollUpdated);
    return () => {
      currentSocket.off("pollUpdated", onPollUpdated);
    };
  }, [currentSocket, dispatch]);

  const otherUserStatusChanged = (res) => {
    logger.debug("socket.otherUserStatusChanged", { userId: res?.userId });

    dispatch(
      changeMemberStatus({
        userId: res.userId,
        status: res.status,
      })
    );
    dispatch(
      changeUserStatus({
        userId: res.userId,
        status: res.status,
      })
    );
  };

  const otherUserLastSeenChanged = (res) => {
    logger.debug("socket.otherUserLastSeenChanged", { userId: res?.userId });
    dispatch(
      changeMemberLastSeen({
        userId: res.userId,
        lastSeen: res.lastSeen,
      })
    );
    dispatch(
      changeUserLastSeen({
        userId: res.userId,
        lastSeen: res.lastSeen,
      })
    );
  };

  const updateRoom = (data) => {
    logger.debug("socket.updateRoom", { roomId: data?._id });
    const roomExists = rooms.find((r) => String(r._id) === String(data?._id));
    if (roomExists) {
      dispatch(
        updateRooms({
          ...data,
          members: data.members?.filter((m) => m._id !== user?._id) || data.members,
        })
      );
    } else {
      // ✅ إذا كان skipAddIfNotExists === true، لا نضيف room جديداً (للمشاهدين)
      if (data?.skipAddIfNotExists === true) {
        logger.debug("socket.skipRoomAdd", { roomId: data?._id, reason: "skipAddIfNotExists" });
        return;
      }
      
      // ✅ أيضاً، إذا لم يكن هناك members، لا نضيف room جديداً (للمشاهدين)
      const hasMembers = data?.members && Array.isArray(data.members) && data.members.length > 0;
      if (!hasMembers) {
        logger.debug("socket.skipRoomAdd", { roomId: data?._id, reason: "noMembers" });
        return;
      }
      
      logger.debug("socket.unshiftRoom", { roomId: data?._id });
      dispatch(
        unShiftRoom({
          ...data,
          members: data.members.filter((m) => m._id !== user?._id),
        })
      );
    }

    // if (!currentRoom || data?._id === currentRoom?._id) {
    //   dispatch(
    //     setRoom({
    //       ...data,
    //       members: data.members.filter((m) => m._id !== user?._id),
    //       add: true,
    //     })
    //   );
    // }
    // Ensure room is updated
  };

  const sendLinkerMsg = (data) => {
    sendMessage({
      room: data?.room?._id,
      content: JSON.stringify({
        userName: `${getFullName(data?.user)}`,
        message: data?.action,
        targetUserName: `${getFullName(data?.targetUser)}`,
        performedBy: data?.performedBy ? `${getFullName(data?.performedBy)}` : null,
      }),
      type: "linker",
      text: "",
    });
  };

  const removeRoom = (data) => {
    logger.debug("socket.removeRoom", { roomId: data?.room });
    dispatch(deleteRoom(data.room));
    currentSocket.emit("leaveRoom", { room: data.room });
    setTimeout(() => {
      if (currentRoom?._id === data.room) {
        dispatch(clearRoom());
        dispatch(clearMessages());
      }
    }, 1000);
  };

  useEffect(() => {
    if (currentSocket) {
      currentSocket.on("deliveredMessage", deliveredMessage);
      currentSocket.on("sendLinkerMsg", sendLinkerMsg);
      currentSocket.on("removeRoom", removeRoom);
      return () => {
        currentSocket.off("deliveredMessage", deliveredMessage);
        currentSocket.off("sendLinkerMsg", sendLinkerMsg);
        currentSocket.off("removeRoom", removeRoom);
      };
    }
  }, [currentSocket, currentRoom, rooms, applyIncomingToRedux]);

  const fetchUpdatedRoom = (data) => {
    logger.debug("socket.fetchUpdatedRoom", { roomId: data?.room });
    currentSocket.emit("getOneRoom", { room: data.room, update: true });
  };

  const handleMessageEdited = useCallback(
    ({ message, room: rid }) => {
      dispatch(
        updateMessage({
          ...message,
          room: rid,
        })
      );
    },
    [dispatch]
  );

  const handlePinsUpdated = useCallback(
    ({ room: rid, pinnedMessages }) => {
      dispatch(
        updateRoomAction({
          _id: rid,
          pinnedMessages: pinnedMessages || [],
        })
      );
    },
    [dispatch]
  );

  const handleMessageLinkPreview = useCallback(
    ({ message, room: rid }) => {
      if (!message?._id || !rid) return;
      dispatch(
        updateMessage({
          ...message,
          room: rid,
        })
      );
    },
    [dispatch]
  );

  useEffect(() => {
    if (currentSocket) {
      currentSocket.on("updateRoom", updateRoom);
      currentSocket.on("getOneRoom", getOneRoom);

      currentSocket.on("fetchUpdatedRoom", fetchUpdatedRoom);
      currentSocket.on("messageEdited", handleMessageEdited);
      currentSocket.on("pinsUpdated", handlePinsUpdated);
      currentSocket.on("messageLinkPreview", handleMessageLinkPreview);

      // Listen for live stream events
      const handleLiveStreamStarted = ({ roomId, settings }) => {
        // تحديث الـ room عند بدء الستريم
        currentSocket.emit("getOneRoom", { room: roomId, update: true });
      };

      const handleLiveStreamEnded = ({ roomId }) => {
        // تحديث الـ room عند انتهاء الستريم
        currentSocket.emit("getOneRoom", { room: roomId, update: true });
      };

      currentSocket.on("liveStreamStarted", handleLiveStreamStarted);
      currentSocket.on("liveStreamEnded", handleLiveStreamEnded);

      // ✅ Live Stream Request listeners
      // تم إزالة إعادة الإرسال الخاطئة - المكونات تستمع للأحداث مباشرة من السيرفر
      // MediasoupCall component يستمع مباشرة لـ liveStreamRequested و liveStreamRequestResponse

      currentSocket.on("blockedByUser", async ({ user, room: roomId }) => {
        const roomExists = rooms?.some(
          (r) => String(r?._id) === String(roomId)
        );
        if (roomExists) {
          currentSocket.emit("getOneRoom", { room: roomId, update: true });
        } else {
          currentSocket.emit("getOneRoom", { room: roomId });
        }

        // await dispatch(
        //   updateRoom({
        //     members: room?.members.map((member) => {
        //       if (member._id === user?._id) {
        //         return {
        //           ...member,
        //           blockedUsers: user,
        //         };
        //       }
        //       return member;
        //     }),
        //     _id: room?._id,
        //   })
        // );
      });

      // ✅ Listen for chat settings updates (always active, not just when modal is open)
      // This handler updates Room.chatSettings when settings are changed
      const handleChatSettingsUpdated = ({ roomId, chatSettings, updatedBy }) => {
        logger.debug("socket.chatSettingsUpdated", {
          roomId,
          updatedBy,
        });

        // Find the room and update its chatSettings
        const targetRoom = rooms.find(r => r._id?.toString() === roomId?.toString() || r._id === roomId);
        
        if (targetRoom) {
          logger.debug("socket.chatSettingsApplied", { roomId });
          
          // Update the room with the new chatSettings
          dispatch(updateRoomAction({
            _id: roomId,
                  chatSettings,
          }));
        } else {
          logger.warn("socket.chatSettingsRoomMissing", { roomId });
        }
      };

      currentSocket.on("chatSettingsUpdated", handleChatSettingsUpdated);

      return () => {
        currentSocket.off("updateRoom", updateRoom);
        currentSocket.off("getOneRoom", getOneRoom);
        currentSocket.off("chatSettingsUpdated", handleChatSettingsUpdated);
        currentSocket.off("fetchUpdatedRoom", fetchUpdatedRoom);
        currentSocket.off("messageEdited", handleMessageEdited);
        currentSocket.off("pinsUpdated", handlePinsUpdated);
        currentSocket.off("messageLinkPreview", handleMessageLinkPreview);
        currentSocket.off("liveStreamStarted", handleLiveStreamStarted);
        currentSocket.off("liveStreamEnded", handleLiveStreamEnded);
        // ✅ تم إزالة cleanup للـ liveStreamRequested و liveStreamRequestResponse
        // لأنها لم تعد موجودة هنا (المكونات تستمع مباشرة)
        currentSocket.off("blockedByUser");
      };
    }
  }, [
    currentSocket,
    currentRoom,
    rooms,
    handleMessageEdited,
    handlePinsUpdated,
    handleMessageLinkPreview,
  ]);
  const addPendingMsg = ({
    room,
    text,
    type,
    content,
    forwardedFrom,
    forwardedAt,
    sentTo,
    replyTo,
    createdAt,
  }) => {
    const targetRoom = room ? room : currentRoom?._id;

    const uuId = uuid.v4();
    dispatch(
      addMessage({
        room: targetRoom,
        text: text,
        createdAt: new Date().toISOString(),
        user: user?._id,
        type: type,
        content: content,
        forwardedFrom: forwardedFrom,
        forwardedAt: forwardedAt,
        uuId: uuId,
        sentTo: sentTo || [],
        reactions: [],
        deletedForUsers: [],
        deliveredTo: [],
        seenBy: [],
        deletedForAll: false,
        status: "pending",
        replyTo,
      })
    );

    return uuId;
  };

  const emitWithAck = useCallback((eventName, payload, timeoutMs = 8000) => {
    if (!currentSocket) {
      return Promise.resolve({
        type: "error",
        message: "Socket unavailable",
      });
    }
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({
          type: "error",
          message: "Request timed out",
        });
      }, timeoutMs);
      currentSocket.emit(eventName, payload, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response || { type: "success" });
      });
    });
  }, [currentSocket]);

  const editMessage = useCallback(
    (payload) => emitWithAck("editMessage", payload, 12000),
    [emitWithAck]
  );

  const pinRoomMessage = useCallback(
    (payload) => emitWithAck("pinMessage", payload, 12000),
    [emitWithAck]
  );

  const unpinRoomMessage = useCallback(
    (payload) => emitWithAck("unpinMessage", payload, 12000),
    [emitWithAck]
  );

  const sendMessage = async ({
    room = null,
    text,
    type = "text",
    content = null,
    members = null,
    forwardedFrom = null,
    forwardedAt = null,
    isPendingMsg = true,
    uuId = null,
    replyTo = null,
    callId = null,
    mentions = null,
    threadRoot = null,
    scheduledAt = null,
  }) => {
    /** URL `/chats/[roomId]` is source of truth when Redux `roomId` was never set (deep link / refresh). */
    const targetRoom =
      room != null && room !== ""
        ? room
        : currentRoom?._id ?? openChatRoomIdRef.current ?? null;

    const roomMeta =
      targetRoom != null
        ? roomsRef.current?.find(
            (r) =>
              String(normalizeMongoId(r?._id)) ===
              String(normalizeMongoId(targetRoom))
          ) ?? null
        : null;

    const targetMembers =
      members != null
        ? members
        : currentRoom?.members ?? roomMeta?.members ?? null;
    const textValue = typeof text === "string" ? text : "";
    if (type === "text" && !callId && textValue.trim().length === 0) {
      return { type: "error", message: "Empty text message", uuId: null };
    }
    let targetuuId = uuId;
    if (isPendingMsg) {
      targetuuId = addPendingMsg({
        room: targetRoom,
        text,
        type,
        content,
        forwardedFrom,
        forwardedAt,
        sentTo: targetMembers?.map((m) => m._id) ?? [],
        replyTo,
        createdAt: new Date(),
        callId,
      });
    } else if (targetuuId) {
      dispatch(
        updateMessage({
          room: targetRoom,
          uuId: targetuuId,
          status: "pending",
        })
      );
    }
    const useE2ee =
      roomMeta?.e2ee?.enabled &&
      type === "text" &&
      !callId;

    const mentionPayload =
      Array.isArray(mentions) && mentions.length > 0 ? mentions : null;

    let messagePayload = {
      room: targetRoom,
      text,
      createdAt: new Date(),
      type,
      content,
      forwardedFrom,
      forwardedAt,
      uuId: targetuuId,
      sentTo: targetMembers?.map((m) => m._id) ?? [],
      replyTo,
      callId,
      ...(scheduledAt ? { scheduledAt } : {}),
      ...(mentionPayload ? { mentions: mentionPayload } : {}),
      ...(threadRoot ? { threadRoot } : {}),
      requestId: `msg-${String(targetuuId || Date.now())}`,
    };

    if (useE2ee) {
      try {
        let dk = e2eeDeviceKeysRef.current;
        if (!dk) {
          dk = await loadOrCreateDeviceKeys();
          e2eeDeviceKeysRef.current = dk;
        }
        let cached = getCachedRoomKey(targetRoom);
        if (!cached?.key) {
          await ensureRoomKeyFromServer(
            currentSocket,
            targetRoom,
            dk.x25519Priv,
            userRef.current?._id || user?._id
          );
          cached = getCachedRoomKey(targetRoom);
        }
        if (!cached?.key) {
          logger.error("E2EE: missing room key for send");
          dispatch(
            addAlert({
              type: "error",
              message: "Encrypted message failed to prepare. Please try again.",
              eventType: NotificationTypes.SYSTEM_ERROR,
              dedupeKey: "system_error:e2ee_prepare",
            })
          );
          return { type: "error", uuId: targetuuId };
        }
        const kv = roomMeta.e2ee.keyVersion;
        const enc = encryptTextMessage({
          roomKey32: cached.key,
          roomId: String(targetRoom),
          keyVersion: kv,
          text,
          content,
          type,
          replyTo,
          uuId: targetuuId,
          ed25519Priv: dk.ed25519Priv,
          ed25519Pub: hexToBytes(dk.ed25519PubHex),
        });
        messagePayload = {
          ...messagePayload,
          text: "",
          content: null,
          e2ee: {
            v: kv,
            iv: enc.iv,
            ciphertext: enc.ciphertext,
            aadVersion: 0,
          },
          e2eeSignature: enc.signature,
          e2eeSignerPublic: enc.signerPublicHex,
          ...(mentionPayload ? { mentions: mentionPayload } : {}),
          ...(threadRoot ? { threadRoot } : {}),
        };
      } catch (e) {
        logger.error("E2EE encrypt send failed", e);
        dispatch(
          addAlert({
            type: "error",
            message: "Failed to encrypt message. Please try again.",
            eventType: NotificationTypes.SYSTEM_ERROR,
            dedupeKey: "system_error:e2ee_encrypt",
          })
        );
        return { type: "error", uuId: targetuuId };
      }
    }

    if (!currentSocket || !socketConnected) {
      await offlineQueue.addOperation({
        type: "sendMessage",
        data: {
          message: messagePayload,
          members: targetMembers,
        },
      });
      if (targetuuId) {
        dispatch(
          updateMessage({
            room: targetRoom,
            uuId: targetuuId,
            status: "queued",
          })
        );
      }
      logger.chatEvent("sendMessageQueuedOffline", {
        roomId: targetRoom ? String(targetRoom) : "",
        requestId: String(messagePayload.requestId || ""),
      });
      dispatch(
        addAlert({
          type: "warning",
          message: "You are offline. Message queued and will be sent automatically.",
          eventType: NotificationTypes.SYSTEM_SUCCESS,
          dedupeKey: "system_success:message_queued_offline",
        })
      );
      return { type: "queued", uuId: targetuuId };
    }

    if (__DEV__) {
      logger.debug("socket.sendMessage", {
        type,
        room: targetRoom ? String(targetRoom) : null,
        callId: callId ? String(callId) : null,
        e2ee: Boolean(messagePayload?.e2ee),
      });
    }

    const ack = await emitWithAck("sendMessage", {
      message: messagePayload,
      members: targetMembers,
      requestId: messagePayload.requestId,
    });
    if (
      ack?.type !== "success" &&
      ack?.type !== "scheduled" &&
      ack?.type !== "queued"
    ) {
      if (targetuuId) {
        dispatch(
          updateMessage({
            room: targetRoom,
            uuId: targetuuId,
            status: "failed",
          })
        );
      }
      logger.chatEvent("sendMessageFailed", {
        roomId: targetRoom ? String(targetRoom) : "",
        requestId: String(messagePayload.requestId || ""),
        reason: ack?.message || "unknown",
      });
      dispatch(
        addAlert({
          type: "error",
          message: ack?.message || "Failed to send message",
          eventType: NotificationTypes.SYSTEM_ERROR,
          dedupeKey: "system_error:send_message_failed",
        })
      );
      return { type: "error", uuId: targetuuId };
    }
    logger.chatEvent("sendMessageSuccess", {
      roomId: targetRoom ? String(targetRoom) : "",
      requestId: String(messagePayload.requestId || ""),
      type: String(type || "text"),
      scheduleStatus: ack?.type === "scheduled" ? "scheduled" : "none",
    });
    if (ack?.type === "scheduled" && targetuuId) {
      dispatch(
        updateMessage({
          room: targetRoom,
          uuId: targetuuId,
          status: "scheduled",
          scheduledAt: ack?.scheduledAt || scheduledAt || null,
        })
      );
      return {
        type: "scheduled",
        uuId: targetuuId,
        scheduledAt: ack?.scheduledAt || scheduledAt || null,
      };
    }
    if (ack?.type === "queued" && targetuuId) {
      dispatch(
        updateMessage({
          room: targetRoom,
          uuId: targetuuId,
          status: "queued",
        })
      );
      logger.chatEvent("sendMessageQueuedServer", {
        roomId: targetRoom ? String(targetRoom) : "",
        requestId: String(messagePayload.requestId || ""),
      });
      return { type: "queued", uuId: targetuuId };
    }
    if (targetuuId) {
      dispatch(
        updateMessage({
          room: targetRoom,
          uuId: targetuuId,
          status: "sent",
        })
      );
    }
    return { type: "success", uuId: targetuuId };
  };

  const retryFailedMessage = useCallback(
    async (message) => {
      if (!message) return { type: "error", message: "Missing message" };
      const retryRoom = message.room || currentRoom?._id || openChatRoomIdRef.current;
      return sendMessage({
        room: retryRoom,
        text: message.text,
        type: message.type || "text",
        content: message.content || null,
        members: currentRoom?.members || null,
        forwardedFrom: message.forwardedFrom || null,
        forwardedAt: message.forwardedAt || null,
        isPendingMsg: false,
        uuId: message.uuId || null,
        replyTo: message.replyTo || null,
        callId: message.call || message.callId || null,
        mentions: Array.isArray(message.mentions) ? message.mentions : null,
        threadRoot: message.threadRoot || null,
        scheduledAt: message.scheduledAt || null,
      });
    },
    [currentRoom?._id, currentRoom?.members, sendMessage]
  );

  const retryAllFailedMessages = useCallback(
    async ({ roomId = null, onProgress = null } = {}) => {
      const targetRoomId =
        roomId ?? currentRoom?._id ?? openChatRoomIdRef.current ?? null;
      if (!targetRoomId) {
        return { type: "error", message: "Missing room id", retried: 0 };
      }
      const roomMeta = roomsRef.current?.find(
        (r) =>
          String(normalizeMongoId(r?._id)) ===
          String(normalizeMongoId(targetRoomId))
      );
      const myId = userRef.current?._id;
      const failedMessages = Object.values(roomMeta?.messages || {})
        .filter((msg) => String(msg?.user) === String(myId))
        .filter((msg) => msg?.status === "failed")
        .sort(
          (a, b) =>
            new Date(a?.createdAt || 0).getTime() -
            new Date(b?.createdAt || 0).getTime()
        );
      if (failedMessages.length === 0) {
        return { type: "success", retried: 0, succeeded: 0, failed: 0 };
      }
      let succeeded = 0;
      let failed = 0;
      for (let index = 0; index < failedMessages.length; index++) {
        const msg = failedMessages[index];
        if (typeof onProgress === "function") {
          try {
            onProgress({
              current: index + 1,
              total: failedMessages.length,
              messageKey: String(msg?.uuId || msg?._id || ""),
              stage: "running",
            });
          } catch (_) {}
        }
        const result = await retryFailedMessage({
          ...msg,
          room: targetRoomId,
        });
        if (typeof onProgress === "function") {
          try {
            onProgress({
              current: index + 1,
              total: failedMessages.length,
              messageKey: String(msg?.uuId || msg?._id || ""),
              stage: "done",
              result: String(result?.type || "unknown"),
            });
          } catch (_) {}
        }
        if (result?.type === "success" || result?.type === "scheduled") {
          succeeded += 1;
        } else if (result?.type === "queued") {
          // Queued is still a valid retry outcome under unstable network.
          succeeded += 1;
        } else {
          failed += 1;
        }
      }
      logger.chatEvent("retryAllFailedMessages", {
        roomId: String(targetRoomId),
        retried: failedMessages.length,
        succeeded,
        failed,
      });
      return {
        type: "success",
        retried: failedMessages.length,
        succeeded,
        failed,
      };
    },
    [currentRoom?._id, retryFailedMessage]
  );

  useEffect(() => {
    const myId = user?._id ? String(user._id) : null;
    if (!myId) return undefined;
    const nextScheduledKeys = new Set();
    for (const room of rooms || []) {
      const roomId = room?._id;
      if (!roomId || !room?.messages) continue;
      const roomMessages = Object.values(room.messages);
      for (const msg of roomMessages) {
        const messageKey = msg?.uuId || msg?._id;
        if (!messageKey) continue;
        if (String(msg?.user) !== myId) continue;
        const status = msg?.status;
        const isRetryCandidate =
          status === "failed" || (status === "queued" && socketConnected);
        if (!isRetryCandidate) continue;
        const attempts = Number(msg?.autoRetryCount || 0);
        if (attempts >= MAX_AUTO_RETRY_ATTEMPTS) continue;
        const delayMs =
          AUTO_RETRY_DELAYS_MS[attempts] ||
          AUTO_RETRY_DELAYS_MS[AUTO_RETRY_DELAYS_MS.length - 1];
        const now = Date.now();
        const lastRetryAtMs = msg?.lastAutoRetryAt
          ? new Date(msg.lastAutoRetryAt).getTime()
          : Number(
              new Date(
                msg?.updatedAt || msg?.createdAt || 0
              ).getTime()
            );
        const safeLastRetryAtMs = Number.isFinite(lastRetryAtMs)
          ? lastRetryAtMs
          : 0;
        const dueAtMs = safeLastRetryAtMs + delayMs;
        const waitMs = Math.max(0, dueAtMs - now);
        const retryKey = `${String(roomId)}:${String(messageKey)}`;
        nextScheduledKeys.add(retryKey);
        if (retryTimersRef.current.has(retryKey)) continue;
        const timer = setTimeout(async () => {
          retryTimersRef.current.delete(retryKey);
          if (autoRetryInFlightRef.current.has(retryKey)) return;
          autoRetryInFlightRef.current.add(retryKey);
          try {
            dispatch(
              updateMessage({
                room: roomId,
                uuId: msg?.uuId || null,
                _id: msg?._id || null,
                status: "pending",
                autoRetryCount: attempts + 1,
                lastAutoRetryAt: new Date().toISOString(),
              })
            );
            logger.chatEvent("autoRetryAttempt", {
              roomId: String(roomId),
              messageKey: String(messageKey),
              attempt: attempts + 1,
              previousStatus: String(status),
            });
            const retryResult = await retryFailedMessage({
              ...msg,
              room: roomId,
            });
            logger.chatEvent("autoRetryResult", {
              roomId: String(roomId),
              messageKey: String(messageKey),
              attempt: attempts + 1,
              result: String(retryResult?.type || "unknown"),
            });
          } finally {
            autoRetryInFlightRef.current.delete(retryKey);
          }
        }, waitMs);
        retryTimersRef.current.set(retryKey, timer);
      }
    }
    for (const [key, timer] of retryTimersRef.current.entries()) {
      if (nextScheduledKeys.has(key)) continue;
      clearTimeout(timer);
      retryTimersRef.current.delete(key);
      autoRetryInFlightRef.current.delete(key);
    }
  }, [rooms, socketConnected, user?._id, dispatch, retryFailedMessage]);

  useEffect(() => {
    return () => {
      for (const timer of retryTimersRef.current.values()) {
        clearTimeout(timer);
      }
      retryTimersRef.current.clear();
      autoRetryInFlightRef.current.clear();
    };
  }, []);

  const getScheduledMessages = useCallback(
    (payload) => emitWithAck("getScheduledMessages", payload, 12000),
    [emitWithAck]
  );

  const cancelScheduledMessage = useCallback(
    (payload) => emitWithAck("cancelScheduledMessage", payload, 12000),
    [emitWithAck]
  );
  const rescheduleScheduledMessage = useCallback(
    (payload) => emitWithAck("rescheduleScheduledMessage", payload, 12000),
    [emitWithAck]
  );
  const getChatSummary = useCallback(
    (payload) => emitWithAck("getChatSummary", payload, 12000),
    [emitWithAck]
  );
  const searchGlobalMessages = useCallback(
    (payload) => emitWithAck("searchGlobalMessages", payload, 12000),
    [emitWithAck]
  );
  const votePoll = useCallback(
    (payload) => emitWithAck("votePoll", payload, 12000),
    [emitWithAck]
  );

  useEffect(() => {
    if (!currentSocket || !currentRoom?._id || !currentRoom?.e2ee?.enabled) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const dk =
          e2eeDeviceKeysRef.current || (await loadOrCreateDeviceKeys());
        e2eeDeviceKeysRef.current = dk;
        if (cancelled) return;
        await ensureRoomKeyFromServer(
          currentSocket,
          currentRoom._id,
          dk.x25519Priv,
          user?._id
        );
      } catch {
        /* prefetch optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    currentSocket,
    currentRoom?._id,
    currentRoom?.e2ee?.enabled,
    currentRoom?.e2ee?.keyVersion,
    user?._id,
  ]);

  useEffect(() => {
    if (!currentSocket) return undefined;
    const handler = async (payload) => {
      const { roomId, targetUserId, keyVersion, x25519Public } = payload || {};
      if (!roomId || !targetUserId || !keyVersion || !x25519Public) return;
      const myId = userRef.current?._id;
      if (!myId || String(targetUserId) === String(myId)) return;
      const cached = getCachedRoomKey(roomId);
      if (!cached?.key || cached.keyVersion !== Number(keyVersion)) return;
      try {
        await submitWrapForMember(
          currentSocket,
          roomId,
          targetUserId,
          Number(keyVersion),
          cached.key,
          x25519Public
        );
      } catch (e) {
        logger.warn("e2eeRequestWrapForMember", e);
      }
    };
    currentSocket.on("e2eeRequestWrapForMember", handler);
    return () => currentSocket.off("e2eeRequestWrapForMember", handler);
  }, [currentSocket]);

  const socketContextValue = useMemo(
    () => ({
      socket: currentSocket,
      socketConnected,
      isReconnecting,
      queuedOperations,
      sendMessage,
      retryFailedMessage,
      retryAllFailedMessages,
      getScheduledMessages,
      cancelScheduledMessage,
      rescheduleScheduledMessage,
      getChatSummary,
      searchGlobalMessages,
      votePoll,
      addPendingMsg,
      reconnectSocket,
      disconnectSocket,
      emitWithAck,
      editMessage,
      pinRoomMessage,
      unpinRoomMessage,
    }),
    [
      currentSocket,
      socketConnected,
      isReconnecting,
      queuedOperations,
      sendMessage,
      retryFailedMessage,
      retryAllFailedMessages,
      getScheduledMessages,
      cancelScheduledMessage,
      rescheduleScheduledMessage,
      getChatSummary,
      searchGlobalMessages,
      votePoll,
      addPendingMsg,
      reconnectSocket,
      disconnectSocket,
      emitWithAck,
      editMessage,
      pinRoomMessage,
      unpinRoomMessage,
    ]
  );

  return (
    <SocketContext.Provider
      value={socketContextValue}
    >
      {children}
    </SocketContext.Provider>
  );
};
