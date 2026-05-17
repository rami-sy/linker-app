/**
 * Call Waiting Notification
 * إشعار مكالمة واردة أثناء مكالمة نشطة
 */

import React, { useContext, useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";
import { MediasoupContext } from "../contexts/mediasoup.context";
import { useSelector, useDispatch } from "react-redux";
import FeIcon from "react-native-vector-icons/Feather";
import Icon from "react-native-vector-icons/Ionicons";
import { UserImage, UserName } from "./user";
import ImagePlaceholder from "./image-placeholder";
import ContextMenu from "./context-menu";
import { SocketContext } from "../contexts/socket.context";
import { router } from "expo-router";
import { clearRoom, setRoom } from "../redux/chatSlice";
import { addAlert } from "../redux/alertSlice";
import logger from "../utils/logger";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "~/lib/useColorScheme";
import Popup from "./popup";
import CallTypeBadge, { getCallTypeMeta } from "./call/call-type-badge";

const CallWaitingNotification = () => {
  const CALL_MODAL_WIDTH = "w-[500px]";
  const { 
    waitingCall, 
    isWaitingCallMinimized,
    acceptWaitingCall, 
    rejectWaitingCall,
    minimizeWaitingCall,
    restoreWaitingCallModal,
    roomId: currentCallRoomId,
    isVideoCall: currentIsVideoCall,
    hasAudio = true,
    hasVideo = true,
  } = useContext(MediasoupContext);
  const { isDarkColorScheme } = useColorScheme();
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const rooms = useSelector((state) => state.chats.rooms);
  const socketContext = useContext(SocketContext);
  const { socket } = socketContext || {};
  const sendMessage = socketContext?.sendMessage;
  const room = rooms?.find?.((r) => r?._id === waitingCall?.roomId);
  const isGroup = !!(room?.isGroup || room?.members?.length > 2);
  const ringAnim = useRef(new Animated.Value(0)).current;
  const ringAnim2 = useRef(new Animated.Value(0)).current;
  const [dots, setDots] = useState("");
  const [showAcceptTypeMenu, setShowAcceptTypeMenu] = useState(false);

  logger.callEvent("CallWaitingNotification render", {
    waitingCall,
    currentCallRoomId,
  });

  useEffect(() => {
    if (!waitingCall) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ringAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim2, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ringAnim2, {
          toValue: 0,
          duration: 1400,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    loop2.start();
    const intv = setInterval(
      () => setDots((p) => (p.length >= 3 ? "" : p + ".")),
      500
    );
    return () => {
      loop.stop();
      loop2.stop();
      clearInterval(intv);
    };
  }, [waitingCall]);

  if (!waitingCall) return null;

  const handleAccept = async (joinWithVideo) => {
    try {
      if (!hasAudio) {
        dispatch(
          addAlert({
            type: "error",
            message:
              t("call.noMicrophoneAvailable", {
                defaultValue: "No microphone available for this device.",
              }) || "No microphone available for this device.",
          })
        );
        return;
      }
      if (joinWithVideo && !hasVideo) {
        dispatch(
          addAlert({
            type: "warning",
            message:
              t("call.videoUnavailableAcceptedAudio", {
                defaultValue: "Camera unavailable. We joined with audio only.",
              }) || "Camera unavailable. We joined with audio only.",
          })
        );
        await acceptWaitingCall({ joinWithVideo: false });
        return;
      }
      await acceptWaitingCall({ joinWithVideo });
    } catch (error) {
      logger.error("Error accepting waiting call:", error);
      dispatch(
        addAlert({
          type: "error",
          message:
            error?.message ||
            t("call.rejoinJoinError") ||
            "Unable to accept waiting call right now.",
        })
      );
    }
  };

  const renderAcceptTypeMenu = (positionClassName = "bottom-12 right-0") => (
    <View
      className={`absolute ${positionClassName} w-44 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-md overflow-hidden z-20`}
    >
      <TouchableOpacity
        onPress={async () => {
          setShowAcceptTypeMenu(false);
          await handleAccept(false);
        }}
        activeOpacity={0.85}
        className="px-4 py-3"
      >
        <Text className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {t("call.audio") || "Audio"}
        </Text>
      </TouchableOpacity>
      <View className="h-px bg-slate-200 dark:bg-slate-700" />
      <TouchableOpacity
        onPress={async () => {
          setShowAcceptTypeMenu(false);
          await handleAccept(true);
        }}
        activeOpacity={0.85}
        className="px-4 py-3"
      >
        <Text className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {t("call.video") || "Video"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const handleQuickReply = async (text) => {
    if (sendMessage && waitingCall?.roomId && text) {
      sendMessage({
        room: waitingCall.roomId,
        text,
      });
    }
    rejectWaitingCall();
    if (waitingCall?.roomId && room) {
      await dispatch(clearRoom());
      await dispatch(setRoom(room));
      if (socket) {
        await socket.emit("getMessages", {
          room: waitingCall.roomId,
          override: true,
        });
      }
      router.push({
        pathname: `/chats/${waitingCall.roomId}`,
        params: { from: "incomingCall" },
      });
    }
  };

  if (isWaitingCallMinimized) {
    const waitingCallerName = isGroup
      ? room?.name || "Group Chat"
      : `${waitingCall?.firstName || ""} ${waitingCall?.lastName || ""}`.trim() ||
        "Incoming call";

    return (
      <View className="w-full px-2 pt-2 z-[1200]">
        <View className="w-full rounded-2xl border border-cyan-400/35 bg-slate-900/95 px-3 py-2 flex-row items-center">
          <TouchableOpacity
            className="flex-1 flex-row items-center"
            onPress={restoreWaitingCallModal}
            activeOpacity={0.85}
          >
            {isGroup ? (
              room?.image ? (
                <UserImage
                  user={{ images: [{ path: room?.image }] }}
                  size="w-10 h-10"
                  border="border-0"
                  rounded="rounded-full"
                  showStatus={false}
                />
              ) : (
                <ImagePlaceholder size="w-10 h-10" border="border-0" isGroup />
              )
            ) : (
              <UserImage
                user={waitingCall}
                size="w-10 h-10"
                border="border-0"
                rounded="rounded-full"
                showStatus={false}
                text="text-base font-bold"
              />
            )}
            <View className="ml-2 flex-1">
              <Text className="text-base font-bold text-white" numberOfLines={1}>
                {waitingCallerName}
              </Text>
              <Text className="text-sm text-cyan-300" numberOfLines={1}>
                {`${t("call.callWaiting.incomingCall")} • ${
                  waitingCall?.isVideoCall ? t("call.videoCall") : t("call.audioCall")
                }`}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            className="w-10 h-10 rounded-xl bg-danger items-center justify-center ml-2"
            onPress={rejectWaitingCall}
            activeOpacity={0.8}
          >
            <Icon
              name="call"
              size={18}
              color="#f6f8f9"
              style={{ transform: [{ rotate: "135deg" }] }}
            />
          </TouchableOpacity>

          {Boolean(waitingCall?.isVideoCall) ? (
            <View className="relative">
              {showAcceptTypeMenu ? renderAcceptTypeMenu("top-12 right-0") : null}
              <TouchableOpacity
                className="w-10 h-10 rounded-xl bg-primary items-center justify-center ml-2"
                activeOpacity={0.8}
                onPress={() => setShowAcceptTypeMenu((prev) => !prev)}
              >
                <FeIcon
                  name={getCallTypeMeta(Boolean(waitingCall?.isVideoCall)).icon}
                  size={18}
                  color="#f6f8f9"
                />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              className="w-10 h-10 rounded-xl bg-primary items-center justify-center ml-2"
              onPress={async () => {
                await handleAccept(false);
              }}
              activeOpacity={0.8}
            >
              <FeIcon
                name={getCallTypeMeta(Boolean(waitingCall?.isVideoCall)).icon}
                size={18}
                color="#f6f8f9"
              />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            className="w-10 h-10 rounded-xl bg-slate-700/80 items-center justify-center ml-2"
            onPress={restoreWaitingCallModal}
            activeOpacity={0.8}
          >
            <FeIcon name="maximize-2" size={16} color="#f6f8f9" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <Popup
      showModal={true}
      setShowModal={() => {}}
      onClose={minimizeWaitingCall}
      onCancel={minimizeWaitingCall}
      closeOnBackdrop={true}
      withActions={false}
      withCloseButton={true}
      closeIconName="minimize-2"
      title={t("call.callWaiting.incomingCall") || "Incoming call"}
      w={CALL_MODAL_WIDTH}
      z="z-[1200]"
      opacity="75"
      items="items-center"
      justify="justify-center"
    >
      <View className="w-full items-center pt-1">
        {/* Current Call Info */}
        <View className="mb-3 items-center">
          <View className="flex-row items-center justify-center rounded-full border border-slate-200/70 dark:border-slate-700/70 bg-white/80 dark:bg-slate-900/45 px-4 py-2">
            <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {t("call.callWaiting.title")}
            </Text>
            <Text className="mx-2 text-slate-400 dark:text-slate-500">•</Text>
            <FeIcon
              name={currentIsVideoCall ? "video" : "phone"}
              size={14}
              color={isDarkColorScheme ? "#cbd5e1" : "#475569"}
            />
            <Text className="ml-2 text-sm text-slate-700 dark:text-slate-200">
              {currentIsVideoCall ? t("call.videoCall") : t("call.audioCall")}{" "}
              {t("call.callWaiting.inProgress")}
            </Text>
          </View>
        </View>

        {/* Waiting caller info (same style as incoming-call modal) */}
        <View className="items-center mb-8">
          <View className="relative items-center justify-center mb-2">
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                width: 112,
                height: 112,
                borderRadius: 56,
                backgroundColor: isDarkColorScheme
                  ? "rgba(0,178,202,0.15)"
                  : "rgba(45,45,55,0.5)",
                transform: [
                  {
                    scale: ringAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.2],
                    }),
                  },
                ],
                opacity: ringAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.4, 0.1],
                }),
              }}
            />
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                width: 140,
                height: 140,
                borderRadius: 70,
                backgroundColor: isDarkColorScheme
                  ? "rgba(0,178,202,0.10)"
                  : "rgba(45,45,55,0.35)",
                transform: [
                  {
                    scale: ringAnim2.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.25],
                    }),
                  },
                ],
                opacity: ringAnim2.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 0.08],
                }),
              }}
            />
            {isGroup ? (
              room?.image ? (
                <UserImage
                  user={{ images: [{ path: room?.image }] }}
                  size="w-24 h-24"
                  border="border-0"
                  rounded="rounded-full"
                  showStatus={false}
                />
              ) : (
                <ImagePlaceholder size="w-24 h-24" border="border-0" isGroup />
              )
            ) : (
              <UserImage
                user={waitingCall}
                size="w-24 h-24"
                border="border-0"
                rounded="rounded-full"
                showStatus={false}
                text="text-4xl font-bold"
              />
            )}
          </View>

          {isGroup ? (
            <Text className="text-2xl font-bold mb-2 text-black dark:text-white">
              {room?.name || "Group Chat"}
            </Text>
          ) : (
            <UserName
              user={waitingCall}
              className="text-2xl font-bold mb-2 text-black dark:text-white"
            />
          )}

          <View className="flex-row items-center justify-center gap-x-2">
            <CallTypeBadge
              isVideoCall={Boolean(waitingCall?.isVideoCall)}
              variant="inline"
              shortLabel={false}
              iconSize={16}
            />
            <Text className="text-base text-emerald-500 font-medium">
              {t("call.callWaiting.incomingCall")}
              {dots}
            </Text>
          </View>
        </View>

        {/* Same button shell as incoming-call; accept maps to End + Accept */}
        <View className="flex-row gap-5 items-center">
          <TouchableOpacity
            className="w-16 h-16 rounded-full bg-danger justify-center items-center"
            onPress={rejectWaitingCall}
          >
            <Icon
              name="call"
              size={28}
              color="#f6f8f9"
              style={{ transform: [{ rotate: "135deg" }] }}
            />
          </TouchableOpacity>

          {Boolean(waitingCall?.isVideoCall) ? (
            <View className="relative">
              {showAcceptTypeMenu ? renderAcceptTypeMenu("bottom-20 right-0") : null}
              <TouchableOpacity
                className="w-16 h-16 rounded-full bg-primary justify-center items-center"
                onPress={() => setShowAcceptTypeMenu((prev) => !prev)}
              >
                <FeIcon
                  name={getCallTypeMeta(Boolean(waitingCall?.isVideoCall)).icon}
                  size={28}
                  color="#f6f8f9"
                />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              className="w-16 h-16 rounded-full bg-primary justify-center items-center"
              onPress={async () => {
                await handleAccept(false);
              }}
            >
              <FeIcon
                name={getCallTypeMeta(Boolean(waitingCall?.isVideoCall)).icon}
                size={28}
                color="#f6f8f9"
              />
            </TouchableOpacity>
          )}

          <View className="ml-2">
            <ContextMenu
              placement="bottom"
              px="px-0"
              width={200}
              menuClassName="z-[10000]"
              options={[
                {
                  name: "I will call you later",
                  onPress: async () => handleQuickReply("I will call you later"),
                },
                {
                  name: "Can't talk now",
                  onPress: async () => handleQuickReply("Can't talk now"),
                },
                {
                  name: "In a meeting",
                  onPress: async () => handleQuickReply("In a meeting"),
                },
                {
                  name: "Custom message…",
                  onPress: async () => {
                    rejectWaitingCall();
                    if (waitingCall?.roomId && room) {
                      await dispatch(clearRoom());
                      await dispatch(setRoom(room));
                      if (socket) {
                        await socket.emit("getMessages", {
                          room: waitingCall.roomId,
                          override: true,
                        });
                      }
                      router.push({
                        pathname: `/chats/${waitingCall.roomId}`,
                        params: { from: "incomingCall" },
                      });
                    }
                  },
                },
              ]}
            >
              <View
                className="w-16 h-16 rounded-full bg-[#eef1f4] dark:bg-[#0f131a] justify-center items-center"
                accessibilityLabel="Reply with message"
              >
                <FeIcon
                  name="message-square"
                  size={22}
                  color={isDarkColorScheme ? "#34d399" : "#10b981"}
                />
              </View>
            </ContextMenu>
          </View>
        </View>
      </View>
    </Popup>
  );
};

export default CallWaitingNotification;

