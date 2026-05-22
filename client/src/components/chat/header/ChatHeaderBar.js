import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  I18nManager,
} from "react-native";
import { router } from "expo-router";
import FeIcon from "react-native-vector-icons/Feather";
import Icon from "react-native-vector-icons/Ionicons";
import UserImage from "../../user-image";
import { UserDisplay } from "../../user";
import ImagePlaceholder from "../../image-placeholder";
import TimeAgo from "../../time-ago";
import ContextMenu from "../../context-menu";
import logger from "../../../utils/logger";

/**
 * Chat room header toolbar: back, title/avatar, selection actions or call buttons + menu.
 */
export default function ChatHeaderBar({
  room,
  user,
  usersTyping,
  isRTL,
  isDarkColorScheme,
  t,
  socket,
  dispatch,
  deleteRoom,
  clearRoom,
  isInitialRender,
  setSelectedMessages,
  navigateBackSafely,
  handleGroupImageClick,
  getGroupTypingIndicator,
  selectedMessages,
  copyMessages,
  canEditSelectedMessage,
  setEditingMessage,
  pinEligible,
  handlePinToggle,
  selectedMessageIsPinned,
  setForward,
  forward,
  setDeleteModal,
  headerMenuOptions,
  showHeaderCallPulse,
  headerCallPulseAnim,
  audioHeaderDisabled,
  videoHeaderDisabled,
  handleHeaderAudioPress,
  handleHeaderVideoPress,
}) {
  return (
    <View className="flex-row items-center justify-between h-16 px-2 py-1.5 bg-chatSurfaceLight dark:bg-chatSurfaceDark">
      <View className="flex-row items-center gap-x-2">
        <TouchableOpacity
          className="mx-1"
          onPress={() => {
            if (socket) {
              socket.emit("leaveRoom", { room: room?._id });
            }
            if (!Object.values(room?.messages || {}).length) {
              dispatch(deleteRoom(room?._id));
            }
            isInitialRender.current = true;
            setSelectedMessages([]);
            dispatch(clearRoom());
            if (router.canGoBack()) {
              logger.debug("Navigation", { canGoBack: true });
              navigateBackSafely();
            } else {
              logger.debug("Navigation", { canGoBack: false });
              router.push("/chats");
            }
          }}
        >
          {isRTL ? (
            <FeIcon
              name="chevron-right"
              size={35}
              color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
            />
          ) : (
            <FeIcon
              name="chevron-left"
              size={35}
              color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
            />
          )}
        </TouchableOpacity>
        {!room?.isGroup ? (
          <UserImage
            size="h-12 w-12"
            border="border-0"
            user={room?.members?.[0]}
            onPress={() => {
              router.push({
                pathname: `/profile/${room?.members?.[0]?._id}`,
                params: { from: `chats/${room?._id}` },
              });
            }}
          />
        ) : (
          <TouchableOpacity onPress={handleGroupImageClick}>
            {room?.image ? (
              <UserImage
                size="h-12 w-12"
                border="border-0"
                user={{ images: [{ path: room?.image }] }}
                showStatus={false}
              />
            ) : (
              <ImagePlaceholder
                size="h-12 w-12"
                border="border-0"
                roomName={room?.name ?? "Group Chat"}
                isGroup
              />
            )}
          </TouchableOpacity>
        )}
        {!room?.isGroup ? (
          <View className="items-start justify-start flex-col">
            {room?.members?.[0] && (
              <UserDisplay
                user={room?.members?.[0]}
                onPress={() => {
                  router.push({
                    pathname: `/profile/${room?.members?.[0]?._id}`,
                    params: { from: `chats/${room?._id}` },
                  });
                }}
                showAvatar={false}
                showStatusDot={false}
                variant="compact"
                className="p-0 bg-transparent"
              />
            )}
            {usersTyping?.[`${room?.members?.[0]?._id}_${room?._id}`] ? (
              <Text className="text-sm text-chatAccent mt-1">
                {t("header.typingIndicator")}
              </Text>
            ) : room?.members?.[0]?.status === "online" ? (
              <Text className="text-xs text-emerald-500 mt-1">
                {t("profileScreen.activeNow")}
              </Text>
            ) : room?.members?.[0]?.lastSeen ? (
              <TimeAgo date={room?.members?.[0]?.lastSeen} className="mt-1" />
            ) : (
              <Text
                className={`text-xs mt-1 ${
                  isDarkColorScheme ? "text-[#EDF6F9]" : "text-[#023047]"
                }`}
              >
                {t("profileScreen.lastSeenLongTimeAgo")}
              </Text>
            )}
          </View>
        ) : (
          <View className="flex-col items-start">
            <Text className="ml-2 text-lg text-slate-900 dark:text-slate-100">
              {room?.name ?? t("general.groupChat")}
            </Text>
            {getGroupTypingIndicator()}
          </View>
        )}
      </View>

      {selectedMessages?.length > 0 ? (
        <View className="flex-row items-center">
          <TouchableOpacity onPress={copyMessages}>
            <FeIcon
              name="copy"
              size={24}
              color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
            />
          </TouchableOpacity>
          {canEditSelectedMessage && (
            <TouchableOpacity
              className="ml-3"
              onPress={() => setEditingMessage(selectedMessages[0])}
            >
              <FeIcon
                name="edit-2"
                size={24}
                color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
              />
            </TouchableOpacity>
          )}
          {pinEligible && (
            <TouchableOpacity className="ml-3" onPress={handlePinToggle}>
              <FeIcon
                name="bookmark"
                size={24}
                color={
                  selectedMessageIsPinned
                    ? "#d97706"
                    : isDarkColorScheme
                    ? "#dee4e6"
                    : "#2D2D37"
                }
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            className="ml-3"
            onPress={() => setForward(!forward)}
          >
            <Icon
              name="return-up-forward"
              size={24}
              color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
            />
          </TouchableOpacity>
          <TouchableOpacity className="ml-3" onPress={() => setDeleteModal(true)}>
            <FeIcon
              name="trash"
              size={24}
              color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
            />
          </TouchableOpacity>
          <ContextMenu
            options={headerMenuOptions}
            placement="bottom"
            width={220}
          >
            <Icon
              name="ellipsis-vertical"
              size={24}
              color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
            />
          </ContextMenu>
        </View>
      ) : (
        <View className="flex-row items-center">
          <Animated.View
            style={{ transform: [{ scale: headerCallPulseAnim }] }}
          >
            <TouchableOpacity
              disabled={audioHeaderDisabled}
              className="ml-1 h-10 w-10 rounded-full items-center justify-center bg-slate-100/80 dark:bg-slate-800/90 active:opacity-80"
              onPress={handleHeaderAudioPress}
              accessibilityRole="button"
              accessibilityLabel={
                showHeaderCallPulse ? "Active call — join" : "Voice call"
              }
            >
              <Icon
                name="call"
                size={28}
                color={
                  audioHeaderDisabled
                    ? isDarkColorScheme
                      ? "#666666"
                      : "#CCCCCC"
                    : showHeaderCallPulse
                    ? "#ef4444"
                    : "#0ea5e9"
                }
              />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View
            style={{ transform: [{ scale: headerCallPulseAnim }] }}
          >
            <TouchableOpacity
              disabled={videoHeaderDisabled}
              className="ml-2 h-10 w-10 rounded-full items-center justify-center bg-slate-100/80 dark:bg-slate-800/90 active:opacity-80"
              onPress={handleHeaderVideoPress}
              accessibilityRole="button"
              accessibilityLabel={
                showHeaderCallPulse ? "Active call — join" : "Video call"
              }
            >
              <Icon
                name="videocam"
                size={28}
                color={
                  videoHeaderDisabled
                    ? isDarkColorScheme
                      ? "#666666"
                      : "#CCCCCC"
                    : showHeaderCallPulse
                    ? "#ef4444"
                    : "#0ea5e9"
                }
              />
            </TouchableOpacity>
          </Animated.View>

          <ContextMenu
            options={headerMenuOptions}
            placement="bottom"
            width={220}
          >
            <Icon
              name="ellipsis-vertical"
              size={24}
              color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
            />
          </ContextMenu>
        </View>
      )}
    </View>
  );
}
