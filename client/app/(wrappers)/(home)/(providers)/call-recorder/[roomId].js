import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useDispatch } from "react-redux";
import MediasoupCall from "../../../../../src/components/mediasoup-call";
import { setMe } from "../../../../../src/redux/userSlice";
import { SocketContextProvider } from "../../../../../src/contexts/socket.context";
import { MediasoupProvider } from "../../../../../src/contexts/mediasoup.context";

// Recorder page - minimal setup with providers
const RecorderPage = () => {
  const { roomId } = useLocalSearchParams();
  const dispatch = useDispatch();

  // Inject a dummy user for the recorder
  useEffect(() => {
    dispatch(
      setMe({
        _id: "recorder-bot",
        firstName: "Recording",
        lastName: "Bot",
        email: "recorder@system.local",
        images: [],
        isCompleted: true, // ✅ Mark as completed to prevent redirect
        emailVerification: { verified: true }, // ✅ Mark as verified
        phoneVerification: { verified: true }, // ✅ Mark as verified
      })
    );
  }, [dispatch]);

  return (
    <SocketContextProvider>
      <MediasoupProvider>
        <View style={styles.container}>
          <MediasoupCall
            roomId={roomId}
            isViewer={false}
            isRecorder={true}
            isVideoCall={true}
            onClose={() => {}}
          />
        </View>
      </MediasoupProvider>
    </SocketContextProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
});

export default RecorderPage;
