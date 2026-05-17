import { useCallback } from "react";
import { addAlert } from "../redux/alertSlice";
import {
  buildAlertPayloadFromEvent,
  normalizeNotificationEvent,
  NotificationTypes,
} from "../utils/notificationContract";

export default function useInAppNotifications({ dispatch, openChatRoomIdRef }) {
  const emitInAppNotification = useCallback(
    (event, fallback = {}) => {
      const payload = buildAlertPayloadFromEvent(event);
      if (payload) {
        dispatch(
          addAlert({
            ...payload,
            duration: payload.priority === "high" ? 6000 : 4500,
            ...fallback,
          })
        );
        return;
      }

      if (fallback?.message) {
        dispatch(
          addAlert({
            type: fallback.type || "info",
            message: fallback.message,
          })
        );
      }
    },
    [dispatch]
  );

  const shouldSuppressInAppForEvent = useCallback(
    (event) => {
      const e = normalizeNotificationEvent(event);
      if (!e) return false;

      if (e.type === NotificationTypes.CHAT_MESSAGE) {
        const currentRoomId = openChatRoomIdRef?.current;
        const eventRoomId = e?.meta?.roomId || e?.entityId || null;
        return (
          !!currentRoomId &&
          !!eventRoomId &&
          String(currentRoomId) === String(eventRoomId)
        );
      }

      return false;
    },
    [openChatRoomIdRef]
  );

  const handleSocketNotificationEvent = useCallback(
    (event) => {
      if (shouldSuppressInAppForEvent(event)) return;
      emitInAppNotification(event);
    },
    [emitInAppNotification, shouldSuppressInAppForEvent]
  );

  return {
    emitInAppNotification,
    shouldSuppressInAppForEvent,
    handleSocketNotificationEvent,
  };
}

