import React, { useContext, useEffect, useState } from "react";
import { Slot } from "expo-router";
import { useDispatch, useSelector } from "react-redux";

import { setSenderReactions } from "~/src/redux/userSlice";
import { SocketContext } from "~/src/contexts/socket.context";
import { useFriends } from "~/src/hooks/use-friends";
import { AppState } from "react-native";
import { fetchDeviceId, getDeviceInfo } from "~/src/api/me";

// ✅ Set initial route to prevent flashing to update-profile (first alphabetical file)
// (tabs) is the default route group for home section
export const unstable_settings = {
  initialRouteName: "(tabs)",
};

const ProvidersLayout = () => {
  const dispatch = useDispatch();
  const { socket } = useContext(SocketContext);
  const [appState, setAppState] = useState(AppState.currentState);

  const getSenderReactions = async () => {
    try {
      const res = await socket.emitWithAck("getSenderReactions", {
        targetModel: "User",
      });

      dispatch(setSenderReactions(res.data));
    } catch (error) {
      console.log({ error });
    }
  };

  // TODO: move this to upper layout
  useFriends();

  const { user } = useSelector((state) => state.users);
  useEffect(() => {
    getSenderReactions();

    const handleAppStateChange = async (nextAppState) => {
      console.log("App State Changed:", nextAppState);
      setAppState(nextAppState);

      if (nextAppState === "background") {
        console.log("📌 التطبيق تم تصغيره إلى الخلفية!");
        const deviceId = await fetchDeviceId();

        socket.emit(
          "userChangeStatus",
          {
            status: "offline",
            // deviceId: deviceId,
          },
          (res) => {
            console.log("userChangeStatus", res);
            // socket.disconnect();
          }
        );
      }

      if (nextAppState === "active") {
        console.log("✅ التطبيق عاد إلى الواجهة!");

        socket.emit(
          "userChangeStatus",
          {
            status: "online",
          },
          (res) => {
            console.log({ res });
            if (res.type === "success") {
              // dispatch(setMe(res.data));
            }
          }
        );

        // يمكنك إعادة تشغيل WebSocket هنا مثلاً
      }
    };

    const appStateListener = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      appStateListener.remove();
    };
  }, [user]);

  return <Slot />;
};

export default ProvidersLayout;
