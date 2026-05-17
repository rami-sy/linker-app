import React, { useContext, useState, useMemo } from "react";
import { View, Text } from "react-native";
import ShowAttachment from "./show-attachment";
import LocationPicker from "./location-picker";
import { SocketContext } from "../../contexts/socket.context";
import ChatInput from "./chat-input";
import * as DocumentPicker from "expo-document-picker";
import { postFile } from "../../api/files";
import FilePicker from "./file-picker";
// Note: expo-av is still used for recording as expo-audio doesn't support recording yet
import { Audio } from "expo-av";
import useSelectedRoom from "../../hooks/use-selected-room";
import logger from "../../utils/logger";
import { useSelector } from "react-redux";
import { checkChatPermission, getUserRoleInRoom } from "../../utils/permissions";
import { useTranslation } from "react-i18next";
import FeIcon from "react-native-vector-icons/Feather";
import { useColorScheme } from "../../../lib/useColorScheme";

const Footer = ({
  setToggleCamera,
  toggleCamera,
  setSelectedMessage,
  message,
  setMessage,
  handleTextChange,
  msgToReply,
  setMsgToReply,
  scrollToEnd,
  onJumpToQuotedMessage,
  activeThreadRootId = null,
}) => {
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showAttachment, setShowAttachment] = useState(false);
  const [uri, setUri] = useState(null);
  const [marker, setMarker] = useState(null);
  const [recording, setRecording] = useState(null); // تغيير نوعية المتغير
  const [duration, setDuration] = useState(0); // لتخزين مدة التسجيل
  const [soundMeter, setSoundMeter] = useState(0); // لتخزين مستوى الصوت الحالي

  const [fileType, setFileType] = useState(null);
  const { sendMessage, addPendingMsg } = useContext(SocketContext);
  const room = useSelectedRoom(); // Use the custom hook to get the selected room
  const { user } = useSelector((state) => state.users);
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();

  // Check canSend permission - controls entire footer
  const canSend = useMemo(() => {
    if (!room || !user) return true; // Allow by default if data not loaded
    
    const isGroup = room?.isGroup;
    const currentUserRole = isGroup ? getUserRoleInRoom(user?._id, room) : "member";
    
    // For group chats, use room.chatSettings
    // If canSend is not set, empty, or includes "everyone", allow by default
    if (isGroup) {
      const canSendSetting = room?.chatSettings?.canSend;
      
      // If canSend is not set or empty, allow everyone by default
      if (!canSendSetting || canSendSetting.length === 0 || canSendSetting.includes("everyone")) {
        return true;
      }
      
      // Use correct API: checkChatPermission(userId, room, setting, options)
      const result = checkChatPermission(
        user?._id,
        room,
        "canSend",
        { currentUser: user }
      );
      
      return result;
    }
    
    // For private chats, use the other user's defaultChatSettings
    if (!isGroup && room?.members?.[0]) {
      const otherUser = room.members[0];
      const settings = otherUser?.privacySettings?.defaultChatSettings;
      const canSendSetting = settings?.canSend;
      
      // If canSend is not set or empty, allow everyone by default
      if (!canSendSetting || canSendSetting.length === 0 || canSendSetting.includes("everyone")) {
        return true;
      }
      
      // Use correct API: checkChatPermission(userId, room, setting, options)
      return checkChatPermission(
        user?._id,
        room,
        "canSend",
        { currentUser: user, otherUser: otherUser }
      );
    }
    
    return true; // Allow by default
  }, [room, user, room?.chatSettings?.canSend, room?.members]);

  const onLocationSelect = (location, text) => {
    sendMessage({
      content: JSON.stringify(location),
      text: text,
      type: "location",
      replyTo: msgToReply?.uuId ?? null,
    });
    setShowLocationPicker(false);
    setMarker(null);
    setMsgToReply(null);
  };

  const onRecordingStatusUpdate = (status) => {
    logger.debug("Recording status", status);
    if (status.isRecording) {
      setDuration(status.durationMillis);
    } else {
      return;
    }
  };

  const startRecording = async () => {
    setDuration(0);
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        logger.warn("Permission to access microphone was denied");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      logger.debug("Starting recording..");
      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        },
        onRecordingStatusUpdate
      );
      setRecording(recording);
      logger.debug("Recording started", { recording: recording ? "initialized" : null });
    } catch (err) {
      logger.error("Failed to start recording", err);
    }
  };

  const stopRecording = async () => {
    try {
      logger.debug("Stopping recording..");
      setRecording(undefined);
      await recording.stopAndUnloadAsync();

      const uri = recording.getURI({
        format: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
      });
      logger.debug("Recording stopped and stored at", { uri });

      // Upload the recorded audio file
      const res = await postFile(uri);

      // Send audio message
      sendMessage({
        text: "",
        type: "audio",
        content: JSON.stringify({
          ...res.data,
          duration: duration,
        }),
        replyTo: msgToReply?.uuId ?? null,
      });

      setDuration(0);
    } catch (err) {
      logger.error("Failed to stop recording", err);
    }
  };

  const pickFile = async (fileType) => {
    let options = {};
    if (fileType === "image") {
      options = {
        type: "image/*",
      };
    } else if (fileType === "video") {
      options = {
        type: "video/*",
      };
    } else if (fileType === "audio") {
      options = {
        type: "audio/*",
      };
    } else if (fileType === "document") {
      options = {
        // type: "application/pdf"  , all doucments type
        type: "application/*",
      };
    } else {
      options = {
        type: "*/*",
      };
    }

    let result = await DocumentPicker.getDocumentAsync(options);
    if (result.assets) {
      setUri(result.assets[0]);
    }
    setFileType(fileType);
  };

  const handleSave = async () => {
    if (uri) {
      const { uri: fileUri, name: fileName } = uri;
      const uuId = addPendingMsg({
        text: message,
        type: fileType,
        sentTo: room?.members?.map((m) => m._id) ?? [],
        content: JSON.stringify({ path: fileUri, filename: fileName }),
        replyTo: msgToReply?.uuId ?? null,
      });
      scrollToEnd();
      try {
        setUri(null);
        const res = await postFile(fileUri, fileName);

        if (res.type === "success") {
          await sendMessage({
            text: message,
            type: fileType,
            content: JSON.stringify(res?.data),
            isPendingMsg: false,
            uuId,
            replyTo: msgToReply?.uuId ?? null,
          });
          setMsgToReply(null);
        } else {
          throw new Error("File upload failed");
        }
      } catch (error) {
        console.error("Error saving file:", error);
        // Handle error (e.g. show error message to user)
      } finally {
        setUri(null);
      }
    } else if (showLocationPicker) {
      onLocationSelect(marker, message);
    }
  };

  // If user cannot send, show disabled message
  if (!canSend) {
    return (
      <View 
        className={`mx-2 mb-2 rounded-2xl flex-row items-center justify-center p-4 ${
          isDarkColorScheme ? "bg-chatSurfaceDark" : "bg-chatSurfaceLight"
        }`}
      >
        <FeIcon 
          name="slash" 
          size={18} 
          color={isDarkColorScheme ? "#94a3b8" : "#64748b"} 
        />
        <Text 
          className={`ml-2 text-sm ${
            isDarkColorScheme ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {t("general.cannotSend") || "You cannot send messages in this chat"}
        </Text>
      </View>
    );
  }

  return (
    <>
      {showAttachment && (
        <ShowAttachment
          pickFile={pickFile}
          setShowAttachment={setShowAttachment}
          toggleCamera={toggleCamera}
          setToggleCamera={setToggleCamera}
          setShowLocationPicker={setShowLocationPicker}
        />
      )}

      {showLocationPicker && (
        <LocationPicker
          setShowLocationPicker={setShowLocationPicker}
          marker={marker}
          setMarker={setMarker}
        />
      )}
      {uri && <FilePicker uri={uri} setUri={setUri} />}

      <ChatInput
        message={message}
        setMessage={setMessage}
        handleTextChange={handleTextChange}
        setSelectedMessage={setSelectedMessage}
        showAttachment={showAttachment}
        setShowAttachment={setShowAttachment}
        onSend={
          uri || showLocationPicker
            ? () => {
                handleSave();
              }
            : null
        }
        fullInput={showLocationPicker || uri ? false : true}
        msgToReply={msgToReply}
        setMsgToReply={setMsgToReply}
        startRecording={startRecording}
        stopRecording={stopRecording}
        recording={recording}
        setRecording={setRecording}
        duration={duration}
        scrollToEnd={scrollToEnd}
        onJumpToQuotedMessage={onJumpToQuotedMessage}
        activeThreadRootId={activeThreadRootId}
      />
    </>
  );
};

export default Footer;
