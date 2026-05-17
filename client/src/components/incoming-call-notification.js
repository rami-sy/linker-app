/**
 * Incoming Call Notification
 * إشعار المكالمة الواردة
 */

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { MediasoupContext } from "../contexts/mediasoup.context";
import { useSelector, useDispatch } from "react-redux";
import FeIcon from "react-native-vector-icons/Feather";
import Icon from "react-native-vector-icons/Ionicons";
import { ChatMemberCard, UserImage, UserName } from "./user";
import ImagePlaceholder from "./image-placeholder";
import getFullName from "../utils/getFullName";
import ContextMenu from "./context-menu";
import { SocketContext } from "../contexts/socket.context";
import { router } from "expo-router";
import { clearRoom, setRoom } from "../redux/chatSlice";
import { addAlert } from "../redux/alertSlice";
import logger from "../utils/logger";
// Note: expo-av is still used for recording as expo-audio doesn't support recording yet
import { Audio } from "expo-av";
import { postFile } from "../api/files";
import Modal from "./modal";
import Popup from "./popup";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import { useColorScheme } from "~/lib/useColorScheme";
import CallTypeBadge, { getCallTypeMeta } from "./call/call-type-badge";
const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;

/** Role props for ChatMemberCard (same rules as mediasoup-call member list). */
function getMemberCardRole(member, room) {
  if (!member || !room) return { isOwner: false, role: undefined };
  const memberId = member._id?.toString() || String(member._id);
  const ownerId =
    room?.user?._id?.toString() ||
    room?.user?.toString() ||
    String(room?.user);
  const isOwner = ownerId === memberId;
  const role = room?.roles?.find((r) => {
    const roleUserId = r.user?._id?.toString() || r.user?.toString() || String(r.user);
    return roleUserId === memberId;
  })?.role;
  return { isOwner, role };
}

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    if (value?._id !== undefined && value?._id !== null) {
      return String(value._id);
    }
    return null;
  }
  return String(value);
}

function getPeerUserId(peer) {
  return (
    normalizeId(peer?.metadata?.userId) ||
    normalizeId(peer?.metadata?.user?._id) ||
    normalizeId(peer?.metadata?.user) ||
    normalizeId(peer?.userId) ||
    normalizeId(peer?.userData?._id) ||
    normalizeId(peer?.user?._id) ||
    normalizeId(peer?.user)
  );
}

const IncomingCallNotification = () => {
  const CALL_MODAL_WIDTH = "w-[500px]";
  const {
    incomingCall,
    isIncomingCallMinimized,
    acceptCall,
    rejectCall,
    minimizeIncomingCall,
    restoreIncomingCallModal,
    peers = [],
    roomId: activeCallRoomId = null,
    isJoined = false,
    rejectedParticipantsByRoom = {},
    hasAudio = true,
    hasVideo = true,
  } = useContext(MediasoupContext);
  const socketContext = useContext(SocketContext);
  const { socket } = socketContext || {};
  const sendMessage = socketContext?.sendMessage;
  const dispatch = useDispatch();
  const { theme } = useSelector((state) => state.app);
  const { user: currentUser } = useSelector((state) => state.users);
  const rooms = useSelector((state) => state.chats.rooms);
  const room = rooms?.find?.((r) => r?._id === incomingCall?.roomId);
  const isGroup = !!(room?.isGroup || room?.members?.length > 2);
  const ringAnim = useRef(new Animated.Value(0)).current;
  const ringAnim2 = useRef(new Animated.Value(0)).current;
  const [dots, setDots] = useState("");
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  const { height: screenHeight } = useWindowDimensions();
  const currentUserId = normalizeId(currentUser?._id);
  const incomingCallSeenAtRef = useRef(0);

  useEffect(() => {
    if (!incomingCall?.roomId) return;
    incomingCallSeenAtRef.current = Date.now();
  }, [incomingCall?.roomId, incomingCall?.callerId]);

  const joinedPeerUserIds = useMemo(() => {
    const ids = new Set();
    (Array.isArray(peers) ? peers : []).forEach((peer) => {
      const userId = getPeerUserId(peer);
      if (userId) ids.add(String(userId));
    });
    return ids;
  }, [peers]);

  const activeCallParticipantIds = useMemo(() => {
    const ids = new Set();
    const syncedAt = Number(room?.activeCallParticipantsSyncedAt || 0);
    const hasFreshSnapshot =
      Number.isFinite(syncedAt) &&
      syncedAt > 0 &&
      syncedAt >= incomingCallSeenAtRef.current;
    if (!hasFreshSnapshot) return ids;

    (Array.isArray(room?.activeCallParticipants)
      ? room.activeCallParticipants
      : []
    ).forEach((participant) => {
      const userId =
        normalizeId(participant?.userId) ||
        normalizeId(participant?.user?._id) ||
        normalizeId(participant?.user) ||
        normalizeId(participant?.userData?._id) ||
        normalizeId(participant?._id) ||
        normalizeId(participant);
      if (userId) ids.add(String(userId));
    });
    return ids;
  }, [room?.activeCallParticipants, room?.activeCallParticipantsSyncedAt]);

  const isIncomingRoomActive = useMemo(() => {
    const incomingRoomId = normalizeId(incomingCall?.roomId);
    const activeRoomId = normalizeId(activeCallRoomId);
    return !!incomingRoomId && !!activeRoomId && incomingRoomId === activeRoomId;
  }, [activeCallRoomId, incomingCall?.roomId]);

  const roomHasActiveCall = useMemo(() => {
    return room?.hasActiveCall === true;
  }, [room?.hasActiveCall]);

  const rejectedParticipantIds = useMemo(() => {
    const incomingRoomId = normalizeId(incomingCall?.roomId);
    if (!incomingRoomId) return new Set();
    const raw = Array.isArray(rejectedParticipantsByRoom?.[incomingRoomId])
      ? rejectedParticipantsByRoom[incomingRoomId]
      : [];
    return new Set(raw.map((value) => String(value)));
  }, [incomingCall?.roomId, rejectedParticipantsByRoom]);

  const isUserInCallNow = useCallback(
    (userId) => {
      const normalized = normalizeId(userId);
      if (!normalized) return false;
      if (joinedPeerUserIds.has(normalized)) return true;
      if (roomHasActiveCall && activeCallParticipantIds.has(normalized)) return true;
      if (
        currentUserId &&
        normalized === currentUserId &&
        isJoined &&
        isIncomingRoomActive
      ) {
        return true;
      }
      return false;
    },
    [
      activeCallParticipantIds,
      currentUserId,
      isIncomingRoomActive,
      isJoined,
      joinedPeerUserIds,
      roomHasActiveCall,
    ]
  );

  const getMemberCallStatus = useCallback(
    (member) => {
      const memberId = normalizeId(member?._id || member?.userId || member);
      const callerId = normalizeId(incomingCall?.callerId);
      if (memberId && callerId && memberId === callerId) {
        return {
          text: t("call.caller") || "Caller",
          tone: "caller",
        };
      }
      if (memberId && rejectedParticipantIds.has(String(memberId))) {
        return {
          text: t("call.rejected") || "Rejected",
          tone: "rejected",
        };
      }
      if (isUserInCallNow(memberId)) {
        return {
          text: t("call.inCall") || "In call",
          tone: "inCall",
        };
      }
      return {
        text: t("call.ringingUser") || "Ringing...",
        tone: "ringing",
      };
    },
    [incomingCall?.callerId, isUserInCallNow, rejectedParticipantIds, t]
  );

  const getStatusSubtitleClassName = useCallback(
    (tone) => {
      if (tone === "caller") {
        return isDarkColorScheme
          ? "text-sm font-medium text-sky-300"
          : "text-sm font-medium text-sky-600";
      }
      if (tone === "rejected") {
        return isDarkColorScheme
          ? "text-sm font-medium text-rose-400"
          : "text-sm font-medium text-rose-600";
      }
      if (tone === "inCall") {
        return isDarkColorScheme
          ? "text-sm font-medium text-emerald-400"
          : "text-sm font-medium text-emerald-600";
      }
      return isDarkColorScheme
        ? "text-sm font-medium text-emerald-300"
        : "text-sm font-medium text-emerald-600";
    },
    [isDarkColorScheme]
  );

  const ownerUserId = normalizeId(room?.user?._id || room?.user);
  const roomMembersById = useMemo(() => {
    const map = new Map();
    (Array.isArray(room?.members) ? room.members : []).forEach((member) => {
      const rawUser =
        member?.user && typeof member.user === "object" ? member.user : member;
      const memberId = normalizeId(rawUser?._id || member?._id || member?.user || member);
      if (!memberId || !rawUser || typeof rawUser !== "object") return;
      map.set(memberId, { ...rawUser, _id: rawUser?._id || memberId });
    });
    return map;
  }, [room?.members]);

  const resolveUserForCard = useCallback(
    (raw) => {
      const rawId = normalizeId(raw?._id || raw?.user?._id || raw?.user || raw);
      const rawObject = raw && typeof raw === "object" ? raw : null;

      const looksLikeUserObject =
        !!rawObject &&
        (rawObject.firstName ||
          rawObject.lastName ||
          rawObject.userName ||
          Array.isArray(rawObject.images));
      if (looksLikeUserObject) {
        return {
          ...rawObject,
          _id: rawObject?._id || rawId,
        };
      }

      if (rawId && roomMembersById.has(rawId)) {
        return roomMembersById.get(rawId);
      }

      const callerId = normalizeId(incomingCall?.callerId);
      if (rawId && callerId && rawId === callerId && incomingCall?.callerData) {
        return {
          ...incomingCall.callerData,
          _id: rawId,
        };
      }

      if (rawId && currentUserId && rawId === currentUserId && currentUser) {
        return {
          ...currentUser,
          _id: currentUser?._id || rawId,
        };
      }

      return rawId ? { _id: rawId } : rawObject || null;
    },
    [
      currentUser,
      currentUserId,
      incomingCall?.callerData,
      incomingCall?.callerId,
      roomMembersById,
    ]
  );

  const ownerUser = useMemo(
    () => resolveUserForCard(room?.user),
    [resolveUserForCard, room?.user]
  );

  const membersWithoutOwner = useMemo(() => {
    const source = Array.isArray(room?.members) ? room.members : [];
    return source
      .map((member) => resolveUserForCard(member))
      .filter((member) => {
        const memberId = normalizeId(member?._id || member);
        if (!memberId) return false;
        return memberId !== ownerUserId;
      });
  }, [ownerUserId, resolveUserForCard, room?.members]);

  const membersWithCurrentUser = useMemo(() => {
    const unique = new Map();
    membersWithoutOwner.forEach((member) => {
      const memberId = normalizeId(member?._id || member);
      if (!memberId) return;
      unique.set(memberId, member);
    });

    const resolvedCurrentUser = resolveUserForCard(currentUser);
    const resolvedCurrentUserId = normalizeId(
      resolvedCurrentUser?._id || currentUserId
    );
    if (
      resolvedCurrentUserId &&
      resolvedCurrentUserId !== ownerUserId &&
      !unique.has(resolvedCurrentUserId)
    ) {
      unique.set(resolvedCurrentUserId, resolvedCurrentUser);
    }

    return Array.from(unique.values());
  }, [
    currentUser,
    currentUserId,
    membersWithoutOwner,
    ownerUserId,
    resolveUserForCard,
  ]);

  const allMembersForModal = useMemo(() => {
    const unique = new Map();
    const pushUnique = (member) => {
      const memberId = normalizeId(member?._id || member);
      if (!memberId || unique.has(memberId)) return;
      unique.set(memberId, member);
    };

    if (ownerUser) pushUnique(ownerUser);
    membersWithCurrentUser.forEach(pushUnique);

    const list = Array.from(unique.values());
    list.sort((a, b) => {
      const aId = normalizeId(a?._id || a);
      const bId = normalizeId(b?._id || b);
      const callerId = normalizeId(incomingCall?.callerId);
      if (callerId) {
        if (aId === callerId && bId !== callerId) return -1;
        if (bId === callerId && aId !== callerId) return 1;
      }
      if (aId === currentUserId && bId !== currentUserId) return -1;
      if (bId === currentUserId && aId !== currentUserId) return 1;
      return 0;
    });
    return list;
  }, [currentUserId, incomingCall?.callerId, membersWithCurrentUser, ownerUser]);

  // ✅ Voicemail State
  const [showVoicemailModal, setShowVoicemailModal] = useState(false);
  const [voicemailRecording, setVoicemailRecording] = useState(null);
  const [voicemailDuration, setVoicemailDuration] = useState(0);
  const [isRecordingVoicemail, setIsRecordingVoicemail] = useState(false);
  const [showAcceptTypeMenu, setShowAcceptTypeMenu] = useState(false);
  
  // ✅ Members Popup State
  const [showMembersModal, setShowMembersModal] = useState(false);

  logger.callEvent("IncomingCallNotification render", {
    incomingCall,
    roomId: incomingCall?.roomId,
  });

  useEffect(() => {
    if (!incomingCall) return;
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
  }, [incomingCall]);

  // ✅ Voicemail Recording Functions
  const onVoicemailRecordingStatusUpdate = (status) => {
    if (status.isRecording) {
      setVoicemailDuration(status.durationMillis);
    }
  };

  const handleStartVoicemail = async () => {
    try {
      setVoicemailDuration(0);
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        logger.warn("Permission to access microphone was denied for voicemail");
        dispatch(
          addAlert({
            type: "error",
            message: t("call.voicemail.permissionDenied"),
          })
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      logger.callEvent("Starting voicemail recording", {
        roomId: incomingCall?.roomId,
      });

      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        },
        onVoicemailRecordingStatusUpdate
      );

      setVoicemailRecording(recording);
      setIsRecordingVoicemail(true);
      logger.callEvent("Voicemail recording started");
    } catch (err) {
      logger.error("Failed to start voicemail recording", err);
      dispatch(
        addAlert({
          type: "error",
          message: t("call.voicemail.recordingFailed"),
        })
      );
    }
  };

  const handleStopVoicemail = async () => {
    try {
      if (!voicemailRecording) return;

      logger.callEvent("Stopping voicemail recording", {
        duration: voicemailDuration,
      });

      setIsRecordingVoicemail(false);
      await voicemailRecording.stopAndUnloadAsync();

      const uri = voicemailRecording.getURI({
        format: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
      });

      logger.callEvent("Voicemail recording stopped", { uri });

      // Upload the recorded audio file
      const res = await postFile(uri);

      if (res.type === "success" || res.data) {
        // Send voicemail to server
        const voicemailData = {
          callId: incomingCall?.callId || null,
          roomId: incomingCall?.roomId,
          callerId: incomingCall?.callerId,
          filePath: res.data?.path,
          fileUrl: res.data?.url || `${apiUrl}${res.data?.path}`,
          duration: voicemailDuration,
        };

        // Emit voicemail to server
        if (socket) {
          socket.emit(
            "leaveVoicemail",
            voicemailData,
            (response) => {
              if (response.success) {
                logger.callEvent("Voicemail sent successfully", {
                  callId: response.callId,
                });
                dispatch(
                  addAlert({
                    type: "success",
                    message: t("call.voicemail.sent"),
                  })
                );
              } else {
                logger.error("Error sending voicemail:", response.error);
                dispatch(
                  addAlert({
                    type: "error",
                    message: response.error || t("call.voicemail.sendFailed"),
                  })
                );
              }
            }
          );
        }

        // Reject the call
        rejectCall();

        // Close modal
        setShowVoicemailModal(false);
        setVoicemailRecording(null);
        setVoicemailDuration(0);
      } else {
        throw new Error("File upload failed");
      }
    } catch (err) {
      logger.error("Failed to stop voicemail recording", err);
      dispatch(
        addAlert({
          type: "error",
          message: t("call.voicemail.sendFailed"),
        })
      );
      setIsRecordingVoicemail(false);
    }
  };

  const handleAccept = useCallback(
    async (joinWithVideo) => {
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
                  defaultValue:
                    "Camera unavailable. We joined you with audio only.",
                }) || "Camera unavailable. We joined you with audio only.",
            })
          );
          await acceptCall({ joinWithVideo: false });
          return;
        }
        await acceptCall({ joinWithVideo });
      } catch (error) {
        logger.error("Failed to accept incoming call", error);
        dispatch(
          addAlert({
            type: "error",
            message:
              error?.message ||
              t("call.joiningCall") ||
              "Unable to accept call right now.",
          })
        );
      }
    },
    [acceptCall, dispatch, hasAudio, hasVideo, t]
  );

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

  if (!incomingCall) {
    return null;
  }

  if (isIncomingCallMinimized) {
    const callerName = isGroup
      ? room?.name || "Group Chat"
      : getFullName(incomingCall, false, 20) || "Incoming call";

    return (
      <View className="w-full px-2 pt-2 z-[1200]">
        <View className="w-full rounded-2xl border border-emerald-400/35 bg-slate-900/95 px-3 py-2 flex-row items-center">
          <TouchableOpacity
            className="flex-1 flex-row items-center"
            onPress={restoreIncomingCallModal}
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
                user={incomingCall}
                size="w-10 h-10"
                border="border-0"
                rounded="rounded-full"
                showStatus={false}
                text="text-base font-bold"
              />
            )}
            <View className="ml-2 flex-1">
              <Text className="text-base font-bold text-white" numberOfLines={1}>
                {callerName}
              </Text>
              <Text className="text-sm text-emerald-400" numberOfLines={1}>
                {`${t("call.callWaiting.incomingCall")} • ${
                  incomingCall?.isVideoCall ? t("call.videoCall") : t("call.audioCall")
                }`}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            className="w-10 h-10 rounded-xl bg-danger items-center justify-center ml-2"
            onPress={rejectCall}
            activeOpacity={0.8}
          >
            <Icon
              name="call"
              size={18}
              color="#f6f8f9"
              style={{ transform: [{ rotate: "135deg" }] }}
            />
          </TouchableOpacity>

          {Boolean(incomingCall?.isVideoCall) ? (
            <View className="relative">
              {showAcceptTypeMenu ? renderAcceptTypeMenu("top-12 right-0") : null}
              <TouchableOpacity
                className="w-10 h-10 rounded-xl bg-primary items-center justify-center ml-2"
                activeOpacity={0.8}
                onPress={() => setShowAcceptTypeMenu((prev) => !prev)}
              >
                <FeIcon
                  name={getCallTypeMeta(Boolean(incomingCall?.isVideoCall)).icon}
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
                name={getCallTypeMeta(Boolean(incomingCall?.isVideoCall)).icon}
                size={18}
                color="#f6f8f9"
              />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            className="w-10 h-10 rounded-xl bg-slate-700/80 items-center justify-center ml-2"
            onPress={restoreIncomingCallModal}
            activeOpacity={0.8}
          >
            <FeIcon name="maximize-2" size={16} color="#f6f8f9" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      <Popup
        showModal={true}
        setShowModal={() => {}}
        onClose={minimizeIncomingCall}
        onCancel={minimizeIncomingCall}
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
        {/* Caller Info */}
        <View className="items-center mb-8">
          <View className="relative items-center justify-center mb-2">
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                width: 112,
                height: 112,
                borderRadius: 56,
                backgroundColor:
                  isDarkColorScheme
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
                backgroundColor:
                  isDarkColorScheme
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
                user={incomingCall}
                size="w-24 h-24"
                border="border-0"
                rounded="rounded-full"
                showStatus={false}
                text="text-4xl font-bold"
              />
            )}
          </View>
          {isGroup ? (
            <Text
              className="text-2xl font-bold mb-2 text-black dark:text-white"
            >
              {room?.name || "Group Chat"}
            </Text>
          ) : (
            <UserName
              user={incomingCall}
              className="text-2xl font-bold mb-2 text-black dark:text-white"
            />
          )}
          <View className="flex-row items-center justify-center gap-x-2">
            <CallTypeBadge
              isVideoCall={Boolean(incomingCall?.isVideoCall)}
              variant="inline"
              shortLabel={false}
              iconSize={16}
            />
            <Text className="text-base text-emerald-500 font-medium">
              {`${t("call.callWaiting.incomingCall")}${dots}`}
            </Text>
          </View>
          {isGroup && (
            <Text
              className="mt-2 text-sm text-slate-500 dark:text-slate-400"
            >
              Started by <Text className="font-bold">{getFullName(incomingCall?.callerData || incomingCall, false, 28) || "Someone"}</Text>
            </Text>
          )}
          {isGroup && (
            <TouchableOpacity onPress={() => setShowMembersModal(true)}>
              <Text
                className="mt-1 text-sm text-primary underline"
              >
                {(room?.members?.length || 0) + 1} Members
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Buttons + quick reply */}
        <View className="flex-row gap-5 items-center">
          {/* Reject Button */}
          <TouchableOpacity
            className="w-16 h-16 rounded-full bg-danger justify-center items-center"
            onPress={rejectCall}
          >
            <Icon
              name="call"
              size={28}
              color="#f6f8f9"
              style={{ transform: [{ rotate: "135deg" }] }}
            />
          </TouchableOpacity>

          {/* Accept Button */}
          {Boolean(incomingCall?.isVideoCall) ? (
            <View className="relative">
              {showAcceptTypeMenu ? renderAcceptTypeMenu("bottom-20 right-0") : null}
              <TouchableOpacity
                className="w-16 h-16 rounded-full bg-primary justify-center items-center"
                onPress={() => setShowAcceptTypeMenu((prev) => !prev)}
              >
                <FeIcon
                  name={getCallTypeMeta(Boolean(incomingCall?.isVideoCall)).icon}
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
                name={getCallTypeMeta(Boolean(incomingCall?.isVideoCall)).icon}
                size={28}
                color="#f6f8f9"
              />
            </TouchableOpacity>
          )}

          {/* Quick reply (icon) */}
          <View className="ml-2">
            <ContextMenu
              placement="bottom"
              px="px-0"
              width={200}
              menuClassName="z-[10000]"
              options={[
                {
                  name: "I will call you later",
                  onPress: async () => {
                    if (sendMessage && incomingCall?.roomId) {
                      sendMessage({
                        room: incomingCall.roomId,
                        text: "I will call you later",
                      });
                    }
                    rejectCall();
                    if (incomingCall?.roomId && room) {
                      await dispatch(clearRoom());
                      await dispatch(setRoom(room));
                      if (socket) {
                        await socket.emit("getMessages", {
                          room: incomingCall.roomId,
                          override: true,
                        });
                      }
                      router.push({
                        pathname: `/chats/${incomingCall.roomId}`,
                        params: { from: "incomingCall" },
                      });
                    }
                  },
                },
                {
                  name: "Can't talk now",
                  onPress: async () => {
                    if (sendMessage && incomingCall?.roomId) {
                      sendMessage({
                        room: incomingCall.roomId,
                        text: "Can't talk now",
                      });
                    }
                    rejectCall();
                    if (incomingCall?.roomId && room) {
                      await dispatch(clearRoom());
                      await dispatch(setRoom(room));
                      if (socket) {
                        await socket.emit("getMessages", {
                          room: incomingCall.roomId,
                          override: true,
                        });
                      }
                      router.push({
                        pathname: `/chats/${incomingCall.roomId}`,
                        params: { from: "incomingCall" },
                      });
                    }
                  },
                },
                {
                  name: "In a meeting",
                  onPress: async () => {
                    if (sendMessage && incomingCall?.roomId) {
                      sendMessage({
                        room: incomingCall.roomId,
                        text: "In a meeting",
                      });
                    }
                    rejectCall();
                    if (incomingCall?.roomId && room) {
                      await dispatch(clearRoom());
                      await dispatch(setRoom(room));
                      if (socket) {
                        await socket.emit("getMessages", {
                          room: incomingCall.roomId,
                          override: true,
                        });
                      }
                      router.push({
                        pathname: `/chats/${incomingCall.roomId}`,
                        params: { from: "incomingCall" },
                      });
                    }
                  },
                },
                {
                  name: "Custom message…",
                  onPress: async () => {
                    rejectCall();
                    if (incomingCall?.roomId && room) {
                      await dispatch(clearRoom());
                      await dispatch(setRoom(room));
                      if (socket) {
                        await socket.emit("getMessages", {
                          room: incomingCall.roomId,
                          override: true,
                        });
                      }
                      router.push({
                        pathname: `/chats/${incomingCall.roomId}`,
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

      {/* ✅ Members list — same shell as GroupDetailsPopup (card + title + scroll) */}
      {showMembersModal && isGroup && (
        <Popup
          showModal={showMembersModal}
          setShowModal={setShowMembersModal}
          withActions={false}
          justify="justify-start"
          items="items-start"
          pt="pt-0"
          p="p-0"
          withCloseButton={true}
          title={t("general.members") || "Members"}
          w="w-[94%] md:w-[740px] lg:w-[780px]"
          opacity="75"
        >
          <ScrollView
            className="flex-1 w-full"
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 14 }}
            style={{ maxHeight: screenHeight * 0.55 }}
            showsVerticalScrollIndicator={false}
          >
            <View className="w-full max-w-2xl mx-auto">
              {allMembersForModal?.map((member) => {
                  const status = getMemberCallStatus(member);
                  const memberId = normalizeId(member?._id || member);
                  const isCurrentUserMember = memberId === currentUserId;
                  const isCallerMember =
                    memberId === normalizeId(incomingCall?.callerId);
                  return (
                    <ChatMemberCard
                      key={memberId}
                      item={member}
                      room={room}
                      {...getMemberCardRole(member, room)}
                      className={`${isCallerMember ? "mb-4" : "mb-2"} rounded-2xl ${
                        isCurrentUserMember
                          ? "bg-primary/5 dark:bg-primary/10"
                          : ""
                      }`}
                      onCloseModal={() => setShowMembersModal(false)}
                      subtitle={status.text}
                      subtitleClassName={getStatusSubtitleClassName(status.tone)}
                      nameBadge={
                        isCallerMember ? (
                          <View className="bg-emerald-500/20 px-2 py-0.5 rounded-full">
                            <Text className="text-[10px] text-emerald-500 dark:text-emerald-400 font-semibold">
                              {t("call.caller") || "Caller"}
                            </Text>
                          </View>
                        ) : null
                      }
                    />
                  );
                })}
            </View>
          </ScrollView>
        </Popup>
      )}

      {/* ✅ Voicemail Recording Modal */}
      {showVoicemailModal && (
        <Modal
          visible={showVoicemailModal}
          onClose={() => {
            setShowVoicemailModal(false);
            if (voicemailRecording) {
              voicemailRecording.stopAndUnloadAsync();
              setVoicemailRecording(null);
            }
            setVoicemailDuration(0);
            setIsRecordingVoicemail(false);
          }}
          title={t("call.voicemail.leaveVoicemail")}
        >
          <View className="w-full max-w-md items-center">
            <Text
              className="text-base text-center mb-6 text-slate-600 dark:text-slate-300"
            >
              {t("call.voicemail.recordMessage")}
            </Text>

            {/* Recording Status */}
            {isRecordingVoicemail && (
              <View className="items-center mb-4">
                <View className="w-20 h-20 rounded-full bg-red-500 items-center justify-center mb-4">
                  <FeIcon name="mic" size={32} color="#f6f8f9" />
                </View>
                <Text
                  className="text-2xl font-bold text-black dark:text-white"
                >
                  {formatTime(Math.floor(voicemailDuration / 1000))}
                </Text>
                <Text
                  className="text-sm mt-2 text-slate-500 dark:text-slate-400"
                >
                  {t("call.voicemail.recording")}
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View className="flex-row gap-4 items-center">
              {/* Cancel Button */}
              <TouchableOpacity
                className="px-6 py-3 rounded-xl bg-slate-200 dark:bg-slate-700"
                onPress={() => {
                  setShowVoicemailModal(false);
                  if (voicemailRecording) {
                    voicemailRecording.stopAndUnloadAsync();
                    setVoicemailRecording(null);
                  }
                  setVoicemailDuration(0);
                  setIsRecordingVoicemail(false);
                }}
              >
                <Text
                  className="font-medium text-black dark:text-white"
                >
                  {t("general.cancel")}
                </Text>
              </TouchableOpacity>

              {/* Record/Stop Button */}
              <TouchableOpacity
                className={`px-6 py-3 rounded-xl ${
                  isRecordingVoicemail ? "bg-danger" : "bg-primary"
                }`}
                onPress={async () => {
                  if (isRecordingVoicemail) {
                    // Stop recording and send voicemail
                    await handleStopVoicemail();
                  } else {
                    // Start recording
                    await handleStartVoicemail();
                  }
                }}
              >
                <Text className="font-medium text-white">
                  {isRecordingVoicemail
                    ? t("call.voicemail.stopAndSend")
                    : t("call.voicemail.startRecording")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
};

// ✅ Helper function to format time
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
};

export default IncomingCallNotification;
