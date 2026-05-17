import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Platform,
  ActivityIndicator,
} from "react-native";
import React, { useContext, useEffect, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as MediaLibrary from "expo-media-library";

import MDCIcon from "react-native-vector-icons/MaterialCommunityIcons";
import MDIcon from "react-native-vector-icons/MaterialIcons";
import FeIcon from "react-native-vector-icons/Feather";
import Button from "../button";
import Spinner from "react-native-loading-spinner-overlay";
import { postFile } from "../../api/files";
import { SocketContext } from "../../contexts/socket.context";
import { useSelector } from "react-redux";
import * as WebBrowser from "expo-web-browser";
import ChatInput from "./chat-input";
import _ from "lodash"; // lodash library for debounce function
import IconButton from "../icon-button";
import useSelectedRoom from "../../hooks/use-selected-room";
import { useColorScheme } from "../../../lib/useColorScheme";

const Cam = ({
  toggleCamera,
  setToggleCamera,
  setSelectedMessage,
  message,
  setMessage,
  handleTextChange,
  msgToReply,
  setMsgToReply,
  scrollToEnd,
}) => {
  const { sendMessage, addPendingMsg } = useContext(SocketContext);

  const cameraRef = useRef(null);
  const [cameraMode, setCameraMode] = useState("picture");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0); // State to track recording time
  const room = useSelectedRoom(); // Use the custom hook to get the selected room
  const [cameraZoom, setCameraZoom] = useState(0);

  const [type, setType] = useState("front");
  const [flash, setFlash] = useState("off");
  const [isImageCaptured, setIsImageCaptured] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [hasMultipleCameras, setHasMultipleCameras] = useState(true);
  const [hasFlash, setHasFlash] = useState(true);
  const [uri, setUri] = useState(null);

  useEffect(() => {
    let timer;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingTime((prevTime) => prevTime + 1);
      }, 1000);
    } else {
      clearInterval(timer);
      setRecordingTime(0);
    }
    // Stop recording when time exceeds 60 seconds
    if (recordingTime >= 10) {
      cameraRef.current?.stopRecording();
      setIsRecording(false);
    }

    return () => clearInterval(timer);
  }, [isRecording]);

  const takePicture = async () => {
    if (cameraRef.current) {
      setIsImageCaptured(true);
      const data = await cameraRef.current.takePictureAsync({
        quality: 1,
        exif: true,
        skipProcessing: true,
      });
      setUri(data.uri);

      setIsImageCaptured(false);
    }
  };

  async function toggleRecord() {
    if (isRecording) {
      cameraRef.current?.stopRecording();
      setIsRecording(false);
    } else {
      setIsRecording(true);
      const response = await cameraRef.current?.recordAsync({
        quality: "480p",
        maxDuration: 60, // Limit video duration to 60 seconds
      });

      setUri(response?.uri);
    }
  }

  const handleRetake = () => {
    setUri(null);
  };

  const pickImages = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.cancelled) {
      setUri(result?.assets?.[0]?.uri);
    }
  };

  const handleSave = async () => {
    if (!uri) return;

    const fileType = cameraMode === "picture" ? "image" : "video";
    const fileExtension = cameraMode === "picture" ? "jpg" : "mp4";
    const mimeType = cameraMode === "picture" ? "image/jpeg" : "video/mp4";

    const fileName = `${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 10)}.${fileExtension}`;

    const pendingMsg = {
      text: message,
      type: fileType,
      sentTo: room?.members?.map((m) => m._id) ?? [],
      content: JSON.stringify({ path: uri, type }),
    };

    const uuId = addPendingMsg(pendingMsg);
    scrollToEnd();

    try {
      setUri(null);
      setToggleCamera(false);

      const res = await postFile(uri, fileName, mimeType);

      if (res.type === "success") {
        await sendMessage({
          content: JSON.stringify({ ...res.data, type }),
          type: fileType,
          text: message,
          isPendingMsg: false,
          uuId,
        });
      } else {
        throw new Error("File upload failed");
      }
    } catch (error) {
      console.error("Error saving file:", error);
      // Handle error (e.g., show error message to user, retry logic, etc.)
    }
  };

  const { isDarkColorScheme } = useColorScheme();

  if (!permission) {
    return (
      <View className={`items-center justify-center flex-1`}>
        <ActivityIndicator
          size="large"
          color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
        />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        className={`relative items-center justify-center flex-1 w-full h-screen overflow-y-auto bg-main`}
      >
        <View
          className={`absolute left-0 right-0 flex flex-row items-center justify-between w-full p-3 top-2`}
        >
          <IconButton
            onPress={() => setToggleCamera(!toggleCamera)}
            iconName="close"
            iconComponent={MDIcon}
          />
        </View>
        <Text className={`mb-4 text-center text-papaya`}>
          We need your permission to show the camera
        </Text>
        <Button onPress={requestPermission} label="Grant Permission" />
      </View>
    );
  }

  return (
    <View className={`relative flex-1 w-full h-screen overflow-y-auto bg-main`}>
      {uri ? (
        <View className={`items-center justify-center flex-1 bg-black`}>
          <Image
            source={{ uri: uri }}
            className={`w-full h-full`}
            style={{
              resizeMode: "cover",
              transform: [{ scaleX: type === "front" ? -1 : 1 }],
            }}
          />
          <View
            className={`absolute bottom-0 left-0 right-0 flex flex-row items-center justify-between w-full`}
          >
            <ChatInput
              message={message}
              setMessage={setMessage}
              onSend={handleSave}
              fullInput={false}
              handleTextChange={handleTextChange}
              setSelectedMessage={setSelectedMessage}
              msgToReply={msgToReply}
              setMsgToReply={setMsgToReply}
            />
          </View>
          <View
            className={`absolute left-0 right-0 flex flex-row items-center justify-between w-full p-3 top-2`}
          >
            <IconButton
              onPress={() => setToggleCamera(!toggleCamera)}
              iconName="close"
              iconComponent={MDIcon}
            />
            <IconButton
              onPress={handleRetake}
              iconName="camera-retake"
              iconComponent={MDCIcon}
            />
          </View>
        </View>
      ) : (
        <CameraView
          className={`w-full h-full`}
          ref={cameraRef}
          facing={type}
          ratio={"1:1"}
          flashMode={flash}
          zoom={cameraZoom}
          mode={cameraMode}
          onCameraReady={() => console.log("camera is ready")}
          onPictureSaved={(photo) => console.log({ photo })}
        >
          {isImageCaptured && (
            <Spinner
              visible={true}
              textStyle={{
                color: "#dee4e6",
              }}
            />
          )}
          {isRecording && (
            <View className={`flex items-center justify-center w-full mt-6`}>
              <Text
                className={`px-4 py-2 text-base rounded-full text-papaya bg-[#ef233c]`}
              >
                {`${Math.floor(recordingTime / 60)
                  .toString()
                  .padStart(2, "0")}:${(recordingTime % 60)
                  .toString()
                  .padStart(2, "0")}`}
              </Text>
            </View>
          )}
          <View
            className={`absolute left-0 right-0 flex flex-row items-end justify-between w-full p-3 bottom-2`}
          >
            <IconButton
              onPress={pickImages}
              iconName="image"
              iconComponent={FeIcon}
            />
            <View className={`flex items-center gap-y-2`}>
              <TouchableOpacity
                onPress={cameraMode === "picture" ? takePicture : toggleRecord}
                className={`flex-row items-center justify-center border-4 rounded-full border-papaya h-14 w-14`}
                onLongPress={() => {
                  if (Platform.OS !== "web") {
                    setCameraMode("video");
                  }
                }}
              >
                <View
                  style={
                    [
                      // { transform: [{ scale: isRecording ? scaleAnim : 1 }] }, // Apply the scaling animation
                    ]
                  }
                >
                  <MDCIcon
                    name="circle"
                    size={40}
                    color={
                      cameraMode === "video" && isRecording
                        ? "#ef233c"
                        : "#dee4e6"
                    }
                  />
                </View>
              </TouchableOpacity>
              <View className={`flex-row items-center mt-4 gap-x-3`}>
                {Platform.OS !== "web" && (
                  <Text
                    className={`text-papaya text-base ${
                      cameraMode === "video" ? "" : "text-opacity-50"
                    }`}
                    onPress={() => {
                      setCameraMode("video");
                      setIsRecording(false);
                    }}
                  >
                    Video
                  </Text>
                )}
                <Text
                  className={`text-papaya text-base ${
                    cameraMode === "picture" ? "" : "text-opacity-50"
                  }`}
                  onPress={() => {
                    setCameraMode("picture");
                    setIsRecording(false);
                  }}
                >
                  Picture
                </Text>
              </View>
            </View>

            {hasMultipleCameras && (
              <IconButton
                onPress={() => {
                  setType(type === "back" ? "front" : "back");
                  setIsRecording(false);
                }}
                iconName="flip-camera-android"
                iconComponent={MDIcon}
              />
            )}
          </View>
          <View
            className={`absolute left-0 right-0 flex flex-row items-start justify-between w-full p-3 top-2`}
          >
            <IconButton
              onPress={() => {
                setToggleCamera(!toggleCamera);
                setIsRecording(false);
              }}
              iconName="close"
              iconComponent={MDIcon}
            />
            <View className={`flex-col items-center gap-y-3`}>
              {hasFlash && Platform.OS !== "web" && (
                <IconButton
                  onPress={() => setFlash(flash === "off" ? "on" : "off")}
                  iconName={flash === "off" ? "flash-off" : "flash"}
                  iconComponent={MDCIcon}
                />
              )}

              <IconButton
                onPress={() => {
                  setCameraZoom(cameraZoom + 0.1);
                }}
                iconName="zoom-in"
                iconComponent={FeIcon}
              />
              <IconButton
                onPress={() => {
                  setCameraZoom(cameraZoom - 0.1);
                }}
                iconName="zoom-out"
                iconComponent={FeIcon}
              />
            </View>
          </View>
        </CameraView>
      )}
    </View>
  );
};

export default Cam;
