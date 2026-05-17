import React, { useContext, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { usePathname, router } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import Popup from "./popup";
import { ChatMemberCard } from "./user";
import { MediasoupContext } from "../contexts/mediasoup.context";
import { addAlert } from "../redux/alertSlice";
import getFullName from "../utils/getFullName";
import { useColorScheme } from "~/lib/useColorScheme";
import { useTranslation } from "react-i18next";
import { isRoomCallActiveForIndicator } from "../utils/roomActiveCall";

const normalizeId = (value) => (value != null ? String(value) : "");

const getRoomRoleForUser = (room, userId) => {
  const roleEntry = (room?.roles || []).find(
    (entry) =>
      normalizeId(entry?.user?._id || entry?.user) === normalizeId(userId)
  );
  return roleEntry?.role || "member";
};

const CallRejoinPanel = ({ visible, onClose, room }) => {
  const dispatch = useDispatch();
  const pathname = usePathname();
  const { user } = useSelector((state) => state.users);
  const {
    joinRoom,
    isJoined,
    roomId: joinedRoomId,
    startCall,
    runPreCallReadiness,
  } = useContext(MediasoupContext);
  const [joining, setJoining] = useState(false);
  const [calling, setCalling] = useState(false);
  const [showCallTypeMenu, setShowCallTypeMenu] = useState(false);
  const { isDarkColorScheme } = useColorScheme();
  const { t } = useTranslation();
  const currentUserId = normalizeId(user?._id);
  const callerId = normalizeId(room?.user?._id || room?.user);
  const isCallActive = isRoomCallActiveForIndicator(room);
  const activeCallIsVideo = room?.activeCallType === "video";
  const panelState = isCallActive ? "active" : "closed";

  const activeParticipantIds = useMemo(() => {
    const ids = new Set();
    (room?.activeCallParticipants || []).forEach((entry) => {
      const id = normalizeId(entry?.userId || entry?.user?._id || entry?.user);
      if (id) ids.add(id);
    });
    return ids;
  }, [room?.activeCallParticipants]);

  const members = useMemo(() => {
    const base = Array.isArray(room?.members) ? room.members : [];
    const currentId = normalizeId(user?._id);
    const withCurrent = currentId && !base.some((m) => normalizeId(m?._id) === currentId)
      ? [user, ...base]
      : base;

    return withCurrent
      .filter(Boolean)
      .sort((a, b) => {
        const aId = normalizeId(a?._id);
        const bId = normalizeId(b?._id);
        if (callerId) {
          if (aId === callerId && bId !== callerId) return -1;
          if (bId === callerId && aId !== callerId) return 1;
        }
        const aIsMe = normalizeId(a?._id) === currentId ? 1 : 0;
        const bIsMe = normalizeId(b?._id) === currentId ? 1 : 0;
        return bIsMe - aIsMe;
      });
  }, [room?.members, user, callerId]);

  const handleJoin = async (joinWithVideo = activeCallIsVideo) => {
    setShowCallTypeMenu(false);
    if (panelState !== "active") return;
    const targetRoomId = normalizeId(room?._id);
    if (!targetRoomId || !user?._id) return;
    if (isJoined && normalizeId(joinedRoomId) === targetRoomId) {
      onClose?.();
      return;
    }

    setJoining(true);
    try {
      const readiness = await runPreCallReadiness?.({
        expectVideo: Boolean(activeCallIsVideo && joinWithVideo),
      });
      if (!readiness?.ok) {
        dispatch(
          addAlert({
            type: "error",
            title: t("call.callAction") || "Call",
            message:
              t("call.noMicrophoneAvailable") ||
              "No microphone detected. Please connect a microphone first.",
          })
        );
        return;
      }
      const joinWithVideoResolved = Boolean(joinWithVideo && readiness?.joinWithVideo);
      if (joinWithVideo && !joinWithVideoResolved) {
        dispatch(
          addAlert({
            type: "warning",
            title: t("call.callAction") || "Call",
            message:
              t("call.videoUnavailableAcceptedAudio") ||
              "No camera was found, so the call will continue as audio.",
          })
        );
      }
      if (!pathname?.includes(`/chats/${targetRoomId}`)) {
        router.push(`/chats/${targetRoomId}`);
      }
      await joinRoom({
        roomId: targetRoomId,
        userId: user._id,
        userData: user,
        isVideoCall: activeCallIsVideo,
        callIsVideo: activeCallIsVideo,
        joinWithVideo: joinWithVideoResolved,
        isCaller: false,
      });
      onClose?.();
    } catch (error) {
      dispatch(
        addAlert({
          type: "error",
          title: t("call.callAction") || "Call",
          message:
            t("call.rejoinJoinError") || "Unable to rejoin this call right now.",
        })
      );
    } finally {
      setJoining(false);
    }
  };

  const handleStartCall = async (isVideoCall) => {
    const targetRoomId = normalizeId(room?._id);
    if (!targetRoomId || !user?._id) return;
    setShowCallTypeMenu(false);
    setCalling(true);
    try {
      const readiness = await runPreCallReadiness?.({
        expectVideo: Boolean(isVideoCall),
      });
      if (!readiness?.ok) {
        dispatch(
          addAlert({
            type: "error",
            title: t("call.callAction") || "Call",
            message:
              t("call.noMicrophoneAvailable") ||
              "No microphone detected. Please connect a microphone first.",
          })
        );
        return;
      }
      const startWithVideo = Boolean(isVideoCall && readiness?.joinWithVideo);
      if (isVideoCall && !startWithVideo) {
        dispatch(
          addAlert({
            type: "warning",
            title: t("call.callAction") || "Call",
            message:
              t("call.videoUnavailableAcceptedAudio") ||
              "No camera was found, so the call will continue as audio.",
          })
        );
      }
      await startCall({
        roomId: targetRoomId,
        userId: user._id,
        userData: {
          images: user?.images,
          firstName: user?.firstName,
          lastName: user?.lastName,
          colors: user?.colors,
          _id: user?._id,
          email: user?.email,
          phoneNumber: user?.phoneNumber,
        },
        isVideoCall: startWithVideo,
      });
      onClose?.();
    } catch (error) {
      dispatch(
        addAlert({
          type: "error",
          title: t("call.callAction") || "Call",
          message:
            t("call.rejoinStartCallError") || "Unable to start a call right now.",
        })
      );
    } finally {
      setCalling(false);
    }
  };

  return (
    <Popup
      showModal={visible}
      setShowModal={(value) => {
        if (!value) onClose?.();
      }}
      withActions={false}
      title={room?.name || "Active call"}
      subtitle={
        panelState === "closed"
          ? t("call.rejoinClosedSubtitle") ||
            "This group call has ended. Start a new call."
          : t("call.rejoinActiveSubtitle") ||
            "Group call is still running. Join anytime."
      }
      w="w-[95%] md:w-[760px] lg:w-[820px]"
      withCloseButton
      justify="justify-start"
      items="items-start"
      p="p-0"
    >
      <View className="w-full px-4 pb-4 pt-1">
        <View className="mb-2 rounded-xl bg-white dark:bg-slate-800/50 px-3 py-2">
          <Text className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {members.length} members
          </Text>
        </View>

        <ScrollView
          className="w-full max-h-[360px]"
          showsVerticalScrollIndicator={false}
        >
          {members.map((member) => {
            const memberId = normalizeId(member?._id);
            const inCallNow = activeParticipantIds.has(memberId);
            const isCurrentUser = memberId === currentUserId;
            const isCaller = callerId && memberId === callerId;
            let subtitle = null;
            let subtitleClassName = undefined;

            if (!isCurrentUser) {
              if (panelState === "closed") {
                subtitle = t("call.closed") || "Closed";
                subtitleClassName = "text-xs text-rose-600 dark:text-rose-400 mt-0.5";
              } else if (isCaller) {
                subtitle = t("call.caller") || "Caller";
                subtitleClassName = "text-xs text-sky-600 dark:text-sky-300 mt-0.5";
              } else if (inCallNow) {
                subtitle = t("call.inCall") || "In call";
                subtitleClassName =
                  "text-xs text-emerald-600 dark:text-emerald-400 mt-0.5";
              } else {
                subtitle = t("call.ringingUser") || "Ringing...";
                subtitleClassName =
                  "text-xs text-emerald-600 dark:text-emerald-300 mt-0.5";
              }
            }

            return (
              <ChatMemberCard
                key={memberId || getFullName(member)}
                item={member}
                room={room}
                role={getRoomRoleForUser(room, memberId)}
                isOwner={normalizeId(room?.user?._id || room?.user) === memberId}
                subtitle={subtitle}
                subtitleClassName={subtitleClassName}
                className={`mb-2 ${isCurrentUser ? "bg-primary/5 dark:bg-primary/10" : ""}`}
              />
            );
          })}
        </ScrollView>

        <View className="mt-3 flex-row items-center justify-end gap-x-2">
          <TouchableOpacity
            onPress={onClose}
            disabled={joining}
            activeOpacity={0.85}
            className="min-w-[120px] rounded-3xl border border-slate-200 dark:border-slate-700 bg-chatSurfaceLight dark:bg-chatSurfaceDark px-5 py-2.5 items-center justify-center"
          >
            <Text
              className={`text-sm font-semibold ${
                isDarkColorScheme ? "text-slate-200" : "text-slate-700"
              }`}
            >
              {t("call.dismissAction") || "Dismiss"}
            </Text>
          </TouchableOpacity>
          {panelState === "active" ? (
            <View className="relative">
              {showCallTypeMenu && activeCallIsVideo && (
                <View className="absolute bottom-12 right-0 w-44 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-md overflow-hidden z-20">
                  <TouchableOpacity
                    onPress={() => handleJoin(false)}
                    disabled={joining}
                    activeOpacity={0.85}
                    className="px-4 py-3"
                  >
                    <Text className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {t("call.audio") || "Audio"}
                    </Text>
                  </TouchableOpacity>
                  <View className="h-px bg-slate-200 dark:bg-slate-700" />
                  <TouchableOpacity
                    onPress={() => handleJoin(true)}
                    disabled={joining}
                    activeOpacity={0.85}
                    className="px-4 py-3"
                  >
                    <Text className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {t("call.video") || "Video"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                onPress={() => {
                  if (activeCallIsVideo) {
                    setShowCallTypeMenu((prev) => !prev);
                    return;
                  }
                  handleJoin(false);
                }}
                disabled={joining}
                activeOpacity={0.9}
                className="min-w-[120px] rounded-3xl bg-primary px-5 py-2.5 items-center justify-center"
              >
                <Text className="text-sm font-semibold text-white">
                  {joining
                    ? t("call.joiningCall") || "Joining..."
                    : t("call.joinAction") || "Join"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="relative">
              {showCallTypeMenu && (
                <View className="absolute bottom-12 right-0 w-44 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-md overflow-hidden z-20">
                  <TouchableOpacity
                    onPress={() => handleStartCall(false)}
                    disabled={calling}
                    activeOpacity={0.85}
                    className="px-4 py-3"
                  >
                    <Text className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {t("call.audio") || "Audio"}
                    </Text>
                  </TouchableOpacity>
                  <View className="h-px bg-slate-200 dark:bg-slate-700" />
                  <TouchableOpacity
                    onPress={() => handleStartCall(true)}
                    disabled={calling}
                    activeOpacity={0.85}
                    className="px-4 py-3"
                  >
                    <Text className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {t("call.video") || "Video"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                disabled={calling}
                activeOpacity={0.9}
                onPress={() => setShowCallTypeMenu((prev) => !prev)}
                className="min-w-[120px] rounded-3xl bg-primary px-5 py-2.5 items-center justify-center"
              >
                <Text className="text-sm font-semibold text-white">
                  {calling
                    ? t("call.calling") || "Calling..."
                    : t("call.callAction") || "Call"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Popup>
  );
};

export default CallRejoinPanel;
