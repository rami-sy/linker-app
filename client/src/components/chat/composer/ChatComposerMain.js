import React, { useEffect, useRef, useState } from "react";
import {
  View,
  TouchableOpacity,
  TextInput,
  Platform,
  Keyboard,
  Text,
  I18nManager,
  TouchableHighlight,
  ScrollView,
} from "react-native";
import ENIcon from "react-native-vector-icons/Entypo";
import MDCIcon from "react-native-vector-icons/MaterialCommunityIcons";
import Icon from "react-native-vector-icons/Ionicons";
import { emojis } from "rn-emoji-picker/dist/data";
import EmojiPicker from "rn-emoji-picker";

import RenderContent from "../render-content";
import ContextMenu from "../../context-menu";
import UserImage from "../../user-image";
import UserName from "../../user-name";
import { chatFlags } from "../../../constants/chatFlags";

export default function ChatComposerMain({
  message,
  setMessage,
  handleTextChange,
  msgToReply,
  setMsgToReply,
  showAttachment,
  setShowAttachment,
  fullInput,
  onSend,
  recording,
  setRecording,
  startRecording,
  stopRecording,
  duration,
  onJumpToQuotedMessage,
  showEmoji,
  setShowEmoji,
  isDarkColorScheme,
  isRTL,
  t,
  user,
  room,
  canSendMessages,
  canSendFiles,
  canSendMedia,
  youBlockedUser,
  userBlockedYou,
  mentionCtx,
  mentionSuggestions,
  insertMention,
  actionsDisabled,
  moreActionOptions,
  submitComposerMessage,
  dismissComposerOverlays,
  keyboardHeight,
  setKeyboardHeight,
}) {
  const [inputHeight, setInputHeight] = useState(48);
  const [paused, setPaused] = useState(false);
  const [recent, setRecent] = useState([]);
  const textInputRef = useRef(null);

  useEffect(() => {
    let keyboardDidShowListener;
    if (keyboardHeight === 0) {
      keyboardDidShowListener = Keyboard.addListener("keyboardDidShow", (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      });
      return () => keyboardDidShowListener.remove();
    }
  }, [keyboardHeight, setKeyboardHeight]);

  useEffect(() => {
    if (!message) {
      setInputHeight(48);
    }
  }, [message]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${minutes < 10 ? "0" : ""}${minutes}:${sec < 10 ? "0" : ""}${sec}`;
  };

  const handlePauseRecording = async () => {
    if (paused) {
      await recording.startAsync();
    } else {
      await recording.pauseAsync();
    }
    setPaused(!paused);
  };

  const handleDeleteRecording = async () => {
    if (recording) {
      await recording.stopAndUnloadAsync();
      setRecording(null);
    }
  };

  return (
    <>
      <View className="flex-row items-end justify-between w-full p-2.5 pt-1">
        <View className="relative flex-1 mr-3">
          {msgToReply && (
            <View className="relative flex-row items-center justify-between w-full bg-chatSurfaceLight dark:bg-chatSurfaceDark rounded-t-3xl">
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={!onJumpToQuotedMessage}
                onPress={() => {
                  const key = msgToReply?.uuId || msgToReply?._id;
                  if (key && onJumpToQuotedMessage) {
                    onJumpToQuotedMessage(key);
                  }
                }}
                className="flex-1"
              >
                <View className="flex-col items-stretch min-h-[40px] w-full justify-start pb-0 rounded-b-none rounded-3xl z-10">
                  {msgToReply.type !== "text" && (
                    <View className="relative w-full overflow-hidden rounded-b-none">
                      <RenderContent
                        message={msgToReply}
                        rounded="rounded-3xl"
                        bg="bg-black/0"
                        w="w-full"
                        small={!isDarkColorScheme}
                      />
                    </View>
                  )}
                  <Text
                    className={`px-3 pb-3 pt-2 w-full ${
                      isRTL ? "text-right" : "text-left"
                    } text-base break-words ${
                      isDarkColorScheme || message?.user === user?._id
                        ? "text-slate-100"
                        : "text-slate-900"
                    }`}
                    style={{ wordBreak: "break-word" }}
                  >
                    {msgToReply?.text}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity className="flex-row items-center justify-between">
            {!recording && (
              <TouchableOpacity
                className="absolute left-2 top-1/2"
                style={{ transform: [{ translateY: -12 }], zIndex: 1 }}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowEmoji(!showEmoji);
                  setShowAttachment(false);
                }}
              >
                <ENIcon
                  name="emoji-happy"
                  size={25}
                  color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              className="w-full"
              activeOpacity={1}
              onPress={() => {
                setShowEmoji(false);
                if (Platform.OS === "android") {
                  textInputRef.current?.focus();
                } else {
                  setTimeout(() => textInputRef.current?.focus(), 100);
                }
              }}
            >
              <View>
                {room?.isGroup &&
                  chatFlags.mentionSuggestionsEnabled &&
                  mentionCtx &&
                  mentionSuggestions.length > 0 && (
                    <View
                      className="mb-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden"
                      style={{ maxHeight: 200 }}
                    >
                      <ScrollView keyboardShouldPersistTaps="handled">
                        {mentionSuggestions.map((mem) => (
                          <TouchableOpacity
                            key={String(mem._id)}
                            onPress={() => insertMention(mem)}
                            className="flex-row items-center gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-slate-700"
                          >
                            <UserImage
                              user={mem}
                              size="w-8 h-8"
                              border="border-0"
                              text="text-xs"
                              showStatus={false}
                            />
                            <UserName user={mem} onlyFirst />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                {recording ? (
                  <View
                    className={`p-3 justify-between flex-row w-full items-center h-12 bg-chatSurfaceLight dark:bg-chatSurfaceDark ${
                      msgToReply ? "rounded-b-3xl" : "rounded-3xl"
                    }`}
                  >
                    <Text className="text-base text-slate-800 dark:text-slate-200">
                      {formatTime(Math.floor(duration / 1000))}
                    </Text>
                    <View className="flex-row items-center gap-x-2">
                      <TouchableOpacity onPress={handlePauseRecording}>
                        <Icon
                          name={paused ? "play" : "pause"}
                          size={25}
                          color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleDeleteRecording}>
                        <MDCIcon
                          name="close"
                          size={25}
                          color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TextInput
                    ref={textInputRef}
                    accessibilityLabel={t("chat.a11y.composer")}
                    style={{
                      minHeight: 48,
                      height: inputHeight,
                      maxHeight: 140,
                    }}
                    className={`p-3 pl-10 pr-16 text-slate-800 dark:text-slate-100 ${
                      msgToReply ? "rounded-b-3xl" : "rounded-3xl"
                    } bg-chatSurfaceLight dark:bg-chatSurfaceDark ${
                      !canSendMessages ? "opacity-50" : ""
                    }`}
                    placeholder={
                      !canSendMessages
                        ? "You don't have permission to send messages"
                        : "Type a message"
                    }
                    value={message}
                    numberOfLines={1}
                    onChangeText={handleTextChange}
                    placeholderTextColor={
                      isDarkColorScheme ? "#94a3b8" : "#64748b"
                    }
                    multiline
                    showsVerticalScrollIndicator={false}
                    onContentSizeChange={(event) => {
                      const nextHeight =
                        event?.nativeEvent?.contentSize?.height || 48;
                      setInputHeight(
                        Math.max(48, Math.min(140, nextHeight))
                      );
                    }}
                    editable={
                      canSendMessages && !youBlockedUser && !userBlockedYou
                    }
                    keyboardType="default"
                    returnKeyType="send"
                  />
                )}
              </View>
            </TouchableOpacity>
            {fullInput && !recording && (
              <View
                className="absolute flex-row items-center justify-center right-4 top-1/2 gap-x-2"
                style={{ transform: [{ translateY: -12 }], zIndex: 1 }}
              >
                <TouchableOpacity
                  onPress={() => {
                    setShowAttachment(!showAttachment);
                    setShowEmoji(false);
                  }}
                  disabled={
                    youBlockedUser ||
                    userBlockedYou ||
                    (!canSendFiles && !canSendMedia)
                  }
                >
                  <MDCIcon
                    name="attachment"
                    size={25}
                    color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                  />
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View className="flex-row items-end gap-2">
          <ContextMenu
            placement="top"
            width={220}
            offset={12}
            disabled={actionsDisabled}
            onOpen={() => {
              setShowEmoji(false);
              setShowAttachment(false);
              dismissComposerOverlays();
            }}
            options={moreActionOptions}
          >
            <View
              className="w-12 rounded-full h-12 bg-slate-500/30 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={t("chat.moreActions", {
                defaultValue: "More actions",
              })}
              style={{ opacity: actionsDisabled ? 0.6 : 1 }}
            >
              <MDCIcon name="dots-vertical" size={22} color="#dee4e6" />
            </View>
          </ContextMenu>

          {msgToReply && (
            <TouchableOpacity
              className="w-12 rounded-full h-12 items-center justify-center bg-danger"
              accessibilityRole="button"
              accessibilityLabel={t("chat.cancelReply", {
                defaultValue: "Cancel reply",
              })}
              onPress={() => setMsgToReply(null)}
            >
              <MDCIcon name="close" size={22} color="#dee4e6" />
            </TouchableOpacity>
          )}

          {message || onSend ? (
            <TouchableHighlight
              className={`w-12 rounded-full h-12 ${
                message || onSend ? "bg-chatAccent" : "bg-drakGray"
              } items-center justify-center`}
              accessibilityLabel={t("chat.a11y.send")}
              accessibilityRole="button"
              disabled={actionsDisabled || (!message && !onSend)}
              onPress={submitComposerMessage}
              style={{
                opacity: actionsDisabled || (!message && !onSend) ? 0.6 : 1,
              }}
            >
              <Icon
                name="send"
                size={25}
                color="#dee4e6"
                style={{ transform: isRTL ? [{ rotateY: "180deg" }] : [] }}
              />
            </TouchableHighlight>
          ) : (
            <TouchableOpacity
              className="w-12 rounded-full h-12 bg-chatAccent items-center justify-center"
              onPress={async () => {
                setPaused(false);
                if (recording) {
                  await stopRecording();
                } else {
                  await startRecording();
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={
                recording ? t("chat.a11y.send") : t("chat.a11y.record")
              }
              disabled={actionsDisabled}
              style={{ opacity: actionsDisabled ? 0.6 : 1 }}
            >
              {recording ? (
                <Icon
                  name="send"
                  size={25}
                  color="#dee4e6"
                  style={{ transform: isRTL ? [{ rotateY: "180deg" }] : [] }}
                />
              ) : (
                <Icon name="mic" size={25} color="#dee4e6" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {showEmoji && (
        <View
          className="h-48 overflow-scroll"
          style={{
            height: keyboardHeight || 200,
            overflow: "scroll",
          }}
        >
          <EmojiPicker
            emojis={emojis}
            recent={recent}
            autoFocus
            loading={false}
            darkMode={isDarkColorScheme}
            perLine={7}
            onSelect={(emoji) => {
              setMessage((prev) => prev + emoji.emoji);
            }}
            onChangeRecent={setRecent}
          />
        </View>
      )}
    </>
  );
}
