import { useState, useEffect, useRef, useCallback } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { addAlert } from "./src/redux/alertSlice";
import { useDispatch } from "react-redux";
import notificationManager from "./src/utils/notificationManager"; // ✅ Enhanced notification manager
import { buildAlertPayloadFromEvent, NotificationTypes } from "./src/utils/notificationContract";
const {
  parseChatPushData,
  buildChatPushRoute,
} = require("./src/utils/chat-flow-helpers");

export const usePushNotifications = (onNotificationReceived) => {
  const router = useRouter();
  // ✅ Initialize enhanced notification manager (native only; web has no notification native module)
  useEffect(() => {
    if (Platform.OS !== "web") {
      notificationManager.initialize();
    }
  }, []);

  const [expoPushToken, setExpoPushToken] = useState("");
  const [notification, setNotification] = useState(false);

  const notificationListener = useRef();
  const responseListener = useRef();
  const lastChatNavRef = useRef({ key: "", at: 0 });
  const onNotificationReceivedRef = useRef(onNotificationReceived);

  const dispatch = useDispatch();

  const navigateFromPushData = useCallback(
    (data) => {
      if (!data || typeof data !== "object") return;
      if (data.route) {
        router.push(data.route);
        return;
      }
      if (data.type && data.type !== NotificationTypes.CHAT_MESSAGE) {
        switch (data.type) {
          case NotificationTypes.FRIEND_REQUEST:
            router.push("/users?tab=received");
            return;
          case NotificationTypes.FRIEND_ACCEPTED:
            router.push("/users?tab=friends");
            return;
          case NotificationTypes.LIKE_RECEIVED:
            router.push("/users?tab=fans");
            return;
          case NotificationTypes.PROFILE_VISITED:
            router.push("/users?tab=visitors");
            return;
          default:
            break;
        }
      }
      const parsed = parseChatPushData(data);
      if (!parsed) return;
      const key = `${parsed.roomId}:${parsed.isMention ? "1" : "0"}:${parsed.messageId || ""}`;
      const now = Date.now();
      if (
        lastChatNavRef.current.key === key &&
        now - lastChatNavRef.current.at < 2000
      ) {
        return;
      }
      lastChatNavRef.current = { key, at: now };
      try {
        const targetRoute = buildChatPushRoute(parsed);
        if (!targetRoute) return;
        router.push(targetRoute);
      } catch (e) {
        console.warn("navigateFromPushData failed", e);
      }
    },
    [router]
  );

  useEffect(() => {
    onNotificationReceivedRef.current = onNotificationReceived;
  }, [onNotificationReceived]);

  const registerForPushNotificationsAsync = async () => {
    let token;
    try {
      if (Device.isDevice) {
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== "granted") {
          dispatch(
            addAlert({
              type: "error",
              message: "Failed to get push token for push notification!",
            })
          );
        }

        token = (
          await Notifications.getExpoPushTokenAsync({
            projectId: "de1242b0-299a-4878-8de2-59dc48a5d788",
          })
        ).data;

        if (!token) {
          dispatch(
            addAlert({
              type: "error",
              message: "Failed to get push token for push notification!",
            })
          );
        }
      } else {
        dispatch(
          addAlert({
            type: "error",
            message: "Must use physical device for Push Notifications",
          })
        );
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF231F7C",
        });
      }

      return token;
    } catch (error) {
      console.log("Error while registering for push notifications", error);
    }
  };
  useEffect(() => {
    if (Platform.OS !== "web") {
      registerForPushNotificationsAsync()
        .then(async (token) => {
          setExpoPushToken(token);
        })
        .catch((error) => {
          console.log({ error });
        });
    }

    if (Platform.OS !== "web") {
      notificationListener.current =
        Notifications.addNotificationReceivedListener((notification) => {
          setNotification(notification);

          console.log("🔔 Notification received:");
          if (onNotificationReceivedRef.current) {
            onNotificationReceivedRef.current(notification);
          }
          const event = notification?.request?.content?.data;
          const alertPayload = buildAlertPayloadFromEvent(event);
          if (alertPayload) {
            dispatch(
              addAlert({
                ...alertPayload,
                duration: alertPayload.priority === "high" ? 6000 : 4500,
              })
            );
          }
        });

      responseListener.current =
        Notifications.addNotificationResponseReceivedListener((response) => {
          console.log("🔔 Notification clicked:", response);
          const data = response?.notification?.request?.content?.data;
          navigateFromPushData(data);
        });

      void Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (!response) return;
          const data = response?.notification?.request?.content?.data;
          navigateFromPushData(data);
        })
        .catch(() => {});
    }

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [navigateFromPushData, dispatch]);
  return { expoPushToken, notification };
};
