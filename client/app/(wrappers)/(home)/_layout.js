import { Platform, View } from "react-native";
import React, { Suspense, lazy, useEffect, useState } from "react";
import { Slot, usePathname } from "expo-router";
import { SocketContextProvider } from "../../../src/contexts/socket.context";
import { MediasoupProvider } from "../../../src/contexts/mediasoup.context";

const MediasoupCallOverlay = lazy(() =>
  import("../../../src/components/mediasoup-call-overlay")
);
const IncomingCallNotification = lazy(() =>
  import("../../../src/components/incoming-call-notification")
);
const RoomCallStateScrubber = lazy(() =>
  import("../../../src/components/room-call-state-scrubber")
);

// ✅ Set initial route to (providers) which contains the main app content
export const unstable_settings = {
  initialRouteName: "(providers)",
};

const HomeLayout = () => {
  const pathname = usePathname();
  const [mountMediasoup, setMountMediasoup] = useState(false);

  // Hide overlays on recorder page
  const isRecorderPage = pathname?.includes("call-recorder");

  useEffect(() => {
    let timeoutId = null;
    let idleId = null;
    const enableProvider = () => setMountMediasoup(true);

    if (
      Platform.OS === "web" &&
      typeof globalThis.requestIdleCallback === "function"
    ) {
      idleId = globalThis.requestIdleCallback(enableProvider, {
        timeout: 1200,
      });
    } else {
      timeoutId = setTimeout(enableProvider, 120);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (
        idleId &&
        Platform.OS === "web" &&
        typeof globalThis.cancelIdleCallback === "function"
      ) {
        globalThis.cancelIdleCallback(idleId);
      }
    };
  }, []);

  const content = (
    <View className="flex-1 items-center bg-[#dee4e6] dark:bg-[#262a36]">
      {!isRecorderPage && mountMediasoup && (
        <Suspense fallback={null}>
          {/* Flow-first: minimized call bar should occupy layout space, not overlay headers/content */}
          <MediasoupCallOverlay />
          {/* Incoming is a Modal component and remains above content when needed */}
          <IncomingCallNotification />
          <RoomCallStateScrubber />
        </Suspense>
      )}
      <Slot />
    </View>
  );

  return (
    <SocketContextProvider>
      {mountMediasoup ? <MediasoupProvider>{content}</MediasoupProvider> : content}
    </SocketContextProvider>
  );
};

export default HomeLayout;
