import { View, Text, TouchableOpacity, Platform, Linking } from "react-native";
import React, { useMemo, useState } from "react";
import moment from "moment";
import { useSelector } from "react-redux";
import FeIcon from "@expo/vector-icons/Feather";
import UserImage from "../user-image";
import ImagePlaceholder from "../image-placeholder";
import UserName from "../user-name";
import getFullName from "../../utils/getFullName";
import accessibility from "../../utils/accessibility";
import { useTranslation } from "react-i18next";
import CallTypeBadge from "./call-type-badge";

const formatDuration = (seconds = 0) => {
  if (!seconds || seconds <= 0) return null;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const STATUS_STYLES = {
  answered: {
    icon: "phone-call",
    iconColor: "#10b981",
    chipClass: "bg-emerald-500/15",
    textClass: "text-emerald-600 dark:text-emerald-400",
  },
  missed: {
    icon: "phone-missed",
    iconColor: "#f97316",
    chipClass: "bg-orange-500/15",
    textClass: "text-orange-600 dark:text-orange-400",
  },
  rejected: {
    icon: "phone-off",
    iconColor: "#ef4444",
    chipClass: "bg-rose-500/15",
    textClass: "text-rose-600 dark:text-rose-400",
  },
  cancelled: {
    icon: "slash",
    iconColor: "#64748b",
    chipClass: "bg-slate-500/15",
    textClass: "text-slate-600 dark:text-slate-300",
  },
};

const DIRECTION_STYLES = {
  incoming: {
    icon: "arrow-down-left",
    iconColor: "#10b981",
    chipClass: "bg-emerald-500/12",
    textClass: "text-emerald-600 dark:text-emerald-400",
    rowAccentClass: "border-l-emerald-500/55",
  },
  outgoing: {
    icon: "arrow-up-right",
    iconColor: "#38bdf8",
    chipClass: "bg-sky-500/12",
    textClass: "text-sky-600 dark:text-sky-400",
    rowAccentClass: "border-l-sky-500/55",
  },
};

const CallHistoryItem = ({
  call,
  onPress,
  onLongPress,
  onAvatarPress,
  selectedCalls = [],
}) => {
  const { user: currentUser } = useSelector((state) => state.users);
  const chatRooms = useSelector((state) => state.chats.rooms);
  const { t } = useTranslation();
  const isSelected = selectedCalls.includes(call?._id);
  const [showGroupDetails, setShowGroupDetails] = useState(false);

  const isCaller = call?.caller?._id === currentUser?._id;
  const hasVisualProfile = (targetUser) => {
    if (!targetUser || typeof targetUser !== "object") return false;
    const hasImagePath = (targetUser?.images || []).some((image) => image?.path);
    const hasColorCode = (targetUser?.colors || []).some((color) => color?.code);
    return hasImagePath || hasColorCode;
  };
  const callRoomId = call?.room?._id || null;
  const fullRoom = useMemo(() => {
    if (!callRoomId) return null;
    return (Array.isArray(chatRooms) ? chatRooms : []).find(
      (room) => String(room?._id || "") === String(callRoomId)
    );
  }, [callRoomId, chatRooms]);
  const otherParticipants =
    call?.participants?.filter((participant) => participant.user?._id !== currentUser?._id) || [];
  const primaryDisplayUser = isCaller
    ? otherParticipants[0]?.user || call?.room?.members?.[0]
    : call?.caller;
  const fallbackMemberFromRoom = useMemo(() => {
    if (!fullRoom || fullRoom?.isGroup) return null;
    const members = Array.isArray(fullRoom?.members) ? fullRoom.members : [];
    if (isCaller) {
      return (
        members.find(
          (member) => String(member?._id || "") !== String(currentUser?._id || "")
        ) || null
      );
    }
    const callerId = String(call?.caller?._id || "");
    return (
      members.find((member) => String(member?._id || "") === callerId) ||
      (fullRoom?.user &&
      String(fullRoom?.user?._id || fullRoom?.user || "") === callerId
        ? fullRoom.user
        : null)
    );
  }, [fullRoom, isCaller, currentUser?._id, call?.caller?._id]);
  const displayUser =
    hasVisualProfile(primaryDisplayUser) || !fallbackMemberFromRoom
      ? primaryDisplayUser
      : fallbackMemberFromRoom;
  const displayName = call?.room?.isGroup
    ? call?.room?.name || t("general.groupChat")
    : getFullName(displayUser) || t("general.user");

  const normalizedStatus = ["answered", "missed", "rejected", "cancelled"].includes(
    call?.status
  )
    ? call.status
    : "answered";
  const statusStyle = STATUS_STYLES[normalizedStatus];
  const durationText = formatDuration(call?.duration);
  const showCallDuration =
    normalizedStatus === "answered" && Boolean(durationText);
  const startedAtText = moment(call?.startedAt).format("MMM DD, HH:mm");
  const directionLabel = isCaller
    ? t("callHistory.filters.outgoing")
    : t("callHistory.filters.incoming");
  const directionKey = isCaller ? "outgoing" : "incoming";
  const directionStyle = DIRECTION_STYLES[directionKey];
  const typeLabel = call?.isVideoCall ? t("callHistory.filters.video") : t("callHistory.filters.audio");
  const isGroupCall = Boolean(call?.room?.isGroup);
  const participantRows = useMemo(() => {
    if (!isGroupCall) return [];
    const participants = Array.isArray(call?.participants) ? call.participants : [];
    const callerId = String(call?.caller?._id || "");
    return participants
      .filter((participant) => String(participant?.user?._id || "") !== callerId)
      .map((participant) => {
        const participantDuration = Number(participant?.duration || 0);
        const hasLeft = Boolean(participant?.leftAt);
        const participantStatus =
          participantDuration > 0
            ? "answered"
            : hasLeft
              ? "missed"
              : "calling";
        return {
          user: participant?.user || null,
          status: participantStatus,
          duration: participantDuration,
        };
      });
  }, [isGroupCall, call?.participants, call?.caller?._id]);

  const statusText = useMemo(() => {
    if (normalizedStatus === "missed") return t("callHistory.filters.missed");
    if (normalizedStatus === "rejected") return t("callHistory.filters.rejected");
    if (normalizedStatus === "cancelled") return t("callHistory.filters.cancelled");
    return t("callHistory.filters.answered");
  }, [normalizedStatus, t]);
  const participantStatusLabel = useMemo(
    () => ({
      answered: t("callHistory.filters.answered"),
      missed: t("callHistory.filters.missed"),
      calling: t("call.calling"),
    }),
    [t]
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.82}
      className={`w-full mb-2 px-3 py-2 rounded-2xl ${
        isSelected
          ? "bg-sky-500/15"
          : "bg-chatSurfaceLight dark:bg-chatSurfaceDark"
      }`}
      {...accessibility.getButtonProps(
        `${displayName}, ${statusText}, ${typeLabel}, ${startedAtText}${
          showCallDuration ? `, ${durationText}` : ""
        }`,
        t("callHistory.rowHint")
      )}
    >
      <View className="flex-row items-center">
        <TouchableOpacity
          className="relative"
          onPress={(e) => {
            if (e && typeof e.stopPropagation === "function") {
              e.stopPropagation();
            }
            onAvatarPress?.();
          }}
          activeOpacity={0.8}
        >
          {call?.room?.isGroup ? (
            call?.room?.image ? (
              <UserImage
                user={{ images: [{ path: call?.room?.image }] }}
                size="h-12 w-12"
                border="border-0"
                rounded="rounded-full"
                showStatus={false}
              />
            ) : (
              <ImagePlaceholder
                size="h-12 w-12"
                border="border-0"
                isGroup
                roomName={call?.room?.name ?? t("general.groupChat")}
              />
            )
          ) : (
            <UserImage
              user={displayUser}
              size="h-12 w-12"
              border="border-0"
            />
          )}
        </TouchableOpacity>

        <View className="flex-1 ml-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-2">
              {call?.room?.isGroup ? (
                <Text className="text-sm font-semibold text-slate-800 dark:text-slate-100" numberOfLines={1}>
                  {displayName}
                </Text>
              ) : (
                <UserName
                  user={displayUser}
                  onlyFirst
                  className="text-sm font-semibold text-slate-800 dark:text-slate-100"
                />
              )}
            </View>
            <View className={`px-2 py-1 rounded-full flex-row items-center ${statusStyle.chipClass}`}>
              <FeIcon name={statusStyle.icon} size={12} color={statusStyle.iconColor} />
              <Text className={`ml-1 text-[11px] font-semibold ${statusStyle.textClass}`}>{statusText}</Text>
            </View>
          </View>

          <View className="mt-1.5 flex-row items-center justify-between">
            <View className="flex-row items-center pr-2">
              <View className={`flex-row items-center rounded-full px-2 py-0.5 ${directionStyle?.chipClass || "bg-slate-500/10"}`}>
                <FeIcon
                  name={directionStyle?.icon || "arrow-right"}
                  size={12}
                  color={directionStyle?.iconColor || "#94a3b8"}
                />
                <Text className={`ml-1 text-xs font-medium ${directionStyle?.textClass || "text-slate-600 dark:text-slate-400"}`}>
                  {directionLabel}
                </Text>
              </View>
              <Text className="mx-1 text-xs text-slate-400 dark:text-slate-500">•</Text>
              <CallTypeBadge isVideoCall={Boolean(call?.isVideoCall)} shortLabel />
              <Text className="mx-1 text-xs text-slate-400 dark:text-slate-500">•</Text>
              <Text className="text-xs text-slate-600 dark:text-slate-400">{startedAtText}</Text>
            </View>

            <View className="flex-row items-center">
              {isGroupCall ? (
                <TouchableOpacity
                  onPress={(e) => {
                    if (e && typeof e.stopPropagation === "function") {
                      e.stopPropagation();
                    }
                    setShowGroupDetails((prev) => !prev);
                  }}
                  className="mr-2 flex-row items-center"
                  accessibilityLabel={showGroupDetails ? "Hide call participants" : "Show call participants"}
                >
                  <Text className="mr-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    {showGroupDetails
                      ? t("general.hide", { defaultValue: "Hide" })
                      : t("general.details", { defaultValue: "Details" })}
                  </Text>
                  <FeIcon
                    name={showGroupDetails ? "chevron-up" : "chevron-down"}
                    size={14}
                    color="#94a3b8"
                  />
                </TouchableOpacity>
              ) : null}
              {showCallDuration ? (
                <Text className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {durationText}
                </Text>
              ) : null}
              {call?.recording?.fileUrl && (
                <TouchableOpacity
                  onPress={(e) => {
                    if (e && typeof e.stopPropagation === "function") {
                      e.stopPropagation();
                    }
                    if (Platform.OS === "web") {
                      window.open(call.recording.fileUrl, "_blank");
                      return;
                    }
                    Linking.openURL(call.recording.fileUrl);
                  }}
                  className="ml-2"
                  accessibilityLabel={t("call.recording.viewRecording")}
                >
                  <FeIcon name="disc" size={13} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
      {isGroupCall && showGroupDetails ? (
        <View className="mt-2 rounded-xl border border-slate-200/80 px-2.5 py-2 dark:border-slate-700/80">
          {participantRows.length > 0 ? (
            participantRows.map((row, index) => (
              <View
                key={`${row?.user?._id || "unknown"}-${index}`}
                className="mb-1.5 flex-row items-center justify-between last:mb-0"
              >
                <View className="flex-1 pr-2">
                  <UserName
                    user={row.user || { userName: t("general.user") }}
                    onlyFirst
                    className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                  />
                </View>
                <View className="flex-row items-center">
                  <Text className="text-[11px] text-slate-600 dark:text-slate-400">
                    {participantStatusLabel[row.status] || t("general.unknown")}
                  </Text>
                  {row.duration > 0 ? (
                    <Text className="ml-2 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      {formatDuration(row.duration)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))
          ) : (
            <Text className="text-xs text-slate-600 dark:text-slate-400">
              {t("general.noData", { defaultValue: "No participant details" })}
            </Text>
          )}
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

export default CallHistoryItem;

