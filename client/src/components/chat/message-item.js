import React, {
  useContext,
  useRef,
  useState,
  memo,
  useMemo,
  useCallback,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Easing,
  I18nManager,
  Platform,
  useWindowDimensions,
} from "react-native";

import UserImage from "../user-image";
import { UserDisplay, UserName } from "../user";
import { SocketContext } from "../../contexts/socket.context";
import { MediasoupContext } from "../../contexts/mediasoup.context";
import { useDispatch, useSelector } from "react-redux";
import { addAlert } from "../../redux/alertSlice";
import Icon from "react-native-vector-icons/Ionicons";
import OIcon from "react-native-vector-icons/Octicons";
import FeIcon from "react-native-vector-icons/Feather";
import Swipeable from "react-native-gesture-handler/Swipeable";
import RenderContent from "./render-content";
import MessageReadReceiptsPopup from "./message-read-receipts-popup";
import MentionRichText from "./mention-rich-text";
import LinkPreviewCard from "./link-preview-card";
import { useTranslation } from "react-i18next";
import useSelectedRoom from "../../hooks/use-selected-room";
import { getLocales } from "expo-localization";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "../../../lib/useColorScheme";
import { chatFlags } from "../../constants/chatFlags";
import CallTypeBadge from "../call/call-type-badge";
import { formatFriendlyScheduledAt } from "../../utils/friendlyScheduledAt";
import normalizeMongoId from "../../utils/normalizeMongoId";

const MessageItem = memo(
  ({
    message,
    isFirstMessageFromUser,
    isLastMessageFromUser,
    selectedMessage,
    setSelectedMessage,
    selectedMessages,
    setSelectedMessages,
    msgToReply,
    setMsgToReply,
    setShowImages,
    onJumpToMessage,
    hideThreadControls = false,
    onOpenThread,
  }) => {
    const {
      socket,
      retryFailedMessage,
      votePoll,
      cancelScheduledMessage,
      rescheduleScheduledMessage,
    } = useContext(SocketContext);
    const { startCall, runPreCallReadiness } = useContext(MediasoupContext);
    const room = useSelectedRoom(); // Use the custom hook to get the selected room
    const { user } = useSelector((state) => state.users);
    const [emojiPanelVisible, setEmojiPanelVisible] = useState(false);
    const [readReceiptsForMessage, setReadReceiptsForMessage] = useState(null);
    const swipeableRef = useRef(null);
    const dispatch = useDispatch();
    const emojis = [
      { name: "smile", emoji: "😊" },
      { name: "thumbs-up", emoji: "👍" },
      { name: "cry", emoji: "😢" },
      { name: "angry", emoji: "😡" },
      { name: "surprised", emoji: "😮" },
      { name: "laugh", emoji: "😂" },
      { name: "heart", emoji: "❤️" },
    ];

    const handleReaction = (messageId, reaction) => {
      if (socket) {
        socket.emit("reactToMessage", {
          message: messageId,
          reaction,
          room: room?._id,
          type: message?.reactions.find(
            (r) => r.reaction === reaction && r.user === user?._id
          )
            ? "remove"
            : "add",
        });
      } else {
        dispatch(
          addAlert({
            message: t("general.connectionError"),
            type: "error",
          })
        );
      }
      setSelectedMessages([]);
      setSelectedMessage(null);
    };

    const { t, i18n } = useTranslation();
    const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

    const { isDarkColorScheme } = useColorScheme();
    const { width: viewportWidth } = useWindowDimensions();
    const bubbleMaxWidth = useMemo(() => {
      if (!viewportWidth) return 360;
      if (Platform.OS === "web") {
        return Math.min(Math.floor(viewportWidth * 0.58), 620);
      }
      return Math.min(Math.floor(viewportWidth * 0.8), 380);
    }, [viewportWidth]);

    const roomMembers = room?.members || [];

    const parseContentMeta = useCallback((targetMessage) => {
      if (!targetMessage?.content) return null;
      try {
        return typeof targetMessage.content === "string"
          ? JSON.parse(targetMessage.content)
          : targetMessage.content;
      } catch (error) {
        return null;
      }
    }, []);

    const parseSnapshotFromMessage = useCallback(
      (targetMessage) => {
        if (!targetMessage) return null;
        if (targetMessage.senderSnapshot) {
          return targetMessage.senderSnapshot;
        }
        const meta = parseContentMeta(targetMessage);
        if (meta?.kind === "liveStreamComment" && meta?.user) {
          return meta.user;
        }
        return null;
      },
      [parseContentMeta]
    );

    const resolveMessageUser = useCallback(
      (targetMessage) => {
      if (!targetMessage) return null;
        if (targetMessage.user === user?._id) {
          return user;
        }
        const roomMember =
          roomMembers.find((member) => member._id === targetMessage.user) ||
          null;
        return roomMember || parseSnapshotFromMessage(targetMessage);
      },
      [parseSnapshotFromMessage, roomMembers, user]
    );

    const messageAuthor = useMemo(
      () => resolveMessageUser(message),
      [message, resolveMessageUser]
    );
    const currentMessageMeta = useMemo(
      () => parseContentMeta(message),
      [message, parseContentMeta]
    );
    const isLiveComment = useMemo(
      () =>
        Boolean(
          message?.isLiveComment ||
            currentMessageMeta?.kind === "liveStreamComment"
        ),
      [currentMessageMeta?.kind, message?.isLiveComment]
    );
    const callEventMeta = useMemo(() => {
      if (message?.type !== "call_event") return null;
      if (message?.callEvent && currentMessageMeta?.eventKind) {
        return { ...currentMessageMeta, ...message.callEvent };
      }
      if (message?.callEvent) return message.callEvent;
      if (currentMessageMeta?.eventKind) return currentMessageMeta;
      return null;
    }, [currentMessageMeta, message?.callEvent, message?.type]);
    const displayMessageText = useMemo(() => {
      if (message?.e2eeDecryptFailed) {
        return t("chat.e2eeDecryptFailed", {
          defaultValue: "Could not decrypt this message",
        });
      }
      if (message?.e2ee?.ciphertext && !message?.text) {
        return t("chat.e2eeDecrypting", { defaultValue: "Decrypting…" });
      }
      if (!message?.text) {
        return message?.text;
      }
      if (message?.type !== "text") {
        return message?.text;
      }
      return message.text.replace(/^💬\s*/, "");
    }, [
      message?.text,
      message?.type,
      message?.e2ee?.ciphertext,
      message?.e2eeDecryptFailed,
      t,
    ]);

    const messageAccessibilityLabel = useMemo(() => {
      const mine = message?.user === user?._id;
      const peerName = messageAuthor
        ? [messageAuthor.firstName, messageAuthor.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          messageAuthor.userName ||
          ""
        : "";
      const base = mine
        ? t("chat.a11y.yourMessage")
        : t("chat.a11y.messageFrom", {
            name: peerName || t("general.user"),
          });
      if (message?.type === "text" && displayMessageText) {
        return `${base}. ${displayMessageText}`.slice(0, 500);
      }
      if (message?.type && message.type !== "text") {
        return `${base}. ${message.type}`;
      }
      return base;
    }, [
      message?.user,
      message?.type,
      user?._id,
      messageAuthor,
      displayMessageText,
      t,
    ]);

    const friendlyScheduledLabel = useMemo(
      () =>
        formatFriendlyScheduledAt(message?.scheduledAt, {
          t,
          locale: i18n?.language,
        }),
      [i18n?.language, message?.scheduledAt, t]
    );

    const threadReplyCount = useMemo(() => {
      if (hideThreadControls || message?.threadRoot) return 0;
      return Object.values(room?.messages || {}).filter(
        (m) =>
          m?.threadRoot &&
          String(m.threadRoot) === String(message._id) &&
          !m.deletedForAll
      ).length;
    }, [room?.messages, message?._id, message?.threadRoot, hideThreadControls]);
    const reactionSummary = useMemo(() => {
      const grouped = new Map();
      (message?.reactions || []).forEach((entry) => {
        const key = String(entry?.reaction || "");
        if (!key) return;
        grouped.set(key, (grouped.get(key) || 0) + 1);
      });
      return Array.from(grouped.entries()).map(([reaction, count]) => ({
        reaction,
        count,
      }));
    }, [message?.reactions]);

    const handleVotePoll = useCallback(
      async ({ message: messageId, room: roomId, optionId }) => {
        if (!votePoll || !messageId || !roomId || !optionId) return;
        const result = await votePoll({
          message: messageId,
          room: roomId,
          optionId,
        });
        if (result?.type === "error") {
          dispatch(
            addAlert({
              type: "error",
              message:
                result?.message ||
                t("chat.pollVoteFailed", {
                  defaultValue: "Unable to submit poll vote.",
                }),
            })
          );
        }
      },
      [dispatch, t, votePoll]
    );

    const showInlineThreadChip = useMemo(() => {
      if (
        hideThreadControls ||
        !chatFlags.threadsEnabled ||
        typeof onOpenThread !== "function" ||
        message?.threadRoot ||
        message?.type !== "text"
      ) {
        return false;
      }
      if (chatFlags.threadChipRequireReplies && threadReplyCount === 0) {
        return false;
      }
      if (
        chatFlags.threadChipGroupsOnly &&
        !room?.isGroup &&
        threadReplyCount === 0
      ) {
        return false;
      }
      return true;
    }, [
      hideThreadControls,
      message?.threadRoot,
      message?.type,
      onOpenThread,
      threadReplyCount,
      room?.isGroup,
    ]);

    const showThreadFallbackInSelection = useMemo(() => {
      if (
        hideThreadControls ||
        !chatFlags.threadsEnabled ||
        typeof onOpenThread !== "function" ||
        message?.threadRoot ||
        message?.type !== "text"
      ) {
        return false;
      }
      return !showInlineThreadChip && threadReplyCount === 0;
    }, [
      hideThreadControls,
      message?.threadRoot,
      message?.type,
      onOpenThread,
      threadReplyCount,
      showInlineThreadChip,
    ]);

    const renderRightActions = () => {
      return (
        <View className={`justify-center pl-2`}>
          <OIcon name="reply" size={20} color="#ddd" />
        </View>
      );
    };

    const formatCallDuration = useCallback((seconds) => {
      const total = Number(seconds) || 0;
      if (total <= 0) return "00:00";
      const mins = Math.floor(total / 60);
      const secs = total % 60;
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    }, []);

    const resolveCallEventId = useCallback((value) => {
      if (value == null) return "";
      if (typeof value === "object") {
        if (value?._id != null) return String(value._id);
        if (value?.userId != null) return String(value.userId);
      }
      return String(value);
    }, []);

    const getNameFromSnapshot = useCallback((snapshot) => {
      if (!snapshot) return "";
      const fullName = [snapshot?.firstName, snapshot?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      return fullName || snapshot?.userName || "";
    }, []);

    const resolveCallEventName = useCallback(
      (idLike, snapshot) => {
        const sid = resolveCallEventId(idLike || snapshot);
        if (sid && sid === String(user?._id || "")) {
          return t("general.you");
        }
        const snapshotName = getNameFromSnapshot(snapshot);
        if (snapshotName) return snapshotName;
        if (sid) {
          const member = roomMembers.find(
            (member) => String(member?._id || "") === sid
          );
          if (member) {
            const memberName = [member?.firstName, member?.lastName]
              .filter(Boolean)
              .join(" ")
              .trim();
            if (memberName) return memberName;
            if (member?.userName) return member.userName;
          }
        }
        return t("general.user");
      },
      [getNameFromSnapshot, resolveCallEventId, roomMembers, t, user?._id]
    );

    const resolveCallEventUser = useCallback(
      (idLike, snapshot) => {
        const sid = resolveCallEventId(idLike || snapshot);
        if (sid && sid === String(user?._id || "")) {
          return user;
        }
        if (snapshot && typeof snapshot === "object") {
          return snapshot;
        }
        if (sid) {
          const member = roomMembers.find(
            (member) => String(member?._id || "") === sid
          );
          if (member) return member;
        }
        return { userName: t("general.user") };
      },
      [resolveCallEventId, roomMembers, t, user]
    );

    if (message?.type === "call_event") {
      const status = callEventMeta?.eventKind || callEventMeta?.status || "answered";
      const isVideoCall = Boolean(callEventMeta?.isVideoCall);
      const duration = Number(callEventMeta?.duration || 0);
      const actorSnapshot = callEventMeta?.actorSnapshot || null;
      const callerSnapshot = callEventMeta?.callerSnapshot || null;
      const actorId = callEventMeta?.actorUserId || actorSnapshot?._id || message?.user;
      const callerId =
        callEventMeta?.callerUserId ||
        callerSnapshot?._id ||
        callEventMeta?.callerId ||
        null;
      const starterId =
        callEventMeta?.starterUserId || callerId || actorId || message?.user;
      const starterSnapshot = callEventMeta?.starterSnapshot || callerSnapshot || actorSnapshot;
      const endedById = callEventMeta?.endedByUserId || actorId || null;
      const endedBySnapshot = callEventMeta?.endedBySnapshot || actorSnapshot || null;
      const isGroupSessionSummary = Boolean(callEventMeta?.isGroupCall);
      const actorName = resolveCallEventName(actorId, actorSnapshot);
      const callerName = resolveCallEventName(callerId, callerSnapshot);
      const actorIsCaller =
        resolveCallEventId(actorId) &&
        resolveCallEventId(actorId) === resolveCallEventId(callerId);
      const isGroupRoom = Boolean(room?.isGroup);
      const iconByStatus = {
        answered: "phone-call",
        missed: "phone-missed",
        rejected: "phone-off",
        cancelled: "slash",
        scheduled: "clock",
      };
      const colorByStatus = {
        answered: "text-emerald-600 dark:text-emerald-400",
        missed: "text-orange-600 dark:text-orange-400",
        rejected: "text-rose-600 dark:text-rose-400",
        cancelled: "text-slate-600 dark:text-slate-300",
        scheduled: "text-sky-600 dark:text-sky-400",
      };
      const iconColorByStatus = {
        answered: "#10b981",
        missed: "#f97316",
        rejected: "#ef4444",
        cancelled: "#64748b",
        scheduled: "#0ea5e9",
      };
      const durationText = t("call.events.durationSummary", {
        duration: formatCallDuration(duration),
      });
      const scheduledForRaw =
        callEventMeta?.scheduledFor || message?.scheduledAt || null;
      const scheduledForDate = scheduledForRaw ? new Date(scheduledForRaw) : null;
      const canParseScheduledFor =
        scheduledForDate instanceof Date && !Number.isNaN(scheduledForDate.getTime());
      const scheduledForLabel = canParseScheduledFor
        ? new Intl.DateTimeFormat(i18n?.language || "en", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(scheduledForDate)
        : friendlyScheduledLabel;
      const handleStartScheduledCall = async () => {
        try {
          const readiness = await runPreCallReadiness?.({
            expectVideo: isVideoCall,
          });
          if (!readiness?.ok) {
            dispatch(
              addAlert({
                type: "error",
                message: t("call.noMicrophoneAvailable", {
                  defaultValue:
                    "No microphone detected. Please connect a microphone first.",
                }),
              })
            );
            return;
          }
          const allowVideo = isVideoCall ? Boolean(readiness?.joinWithVideo) : false;
          await startCall?.({
            roomId: room?._id,
            userId: user?._id,
            userData: {
              images: user?.images,
              firstName: user?.firstName,
              lastName: user?.lastName,
              colors: user?.colors,
              _id: user?._id,
              email: user?.email,
              phoneNumber: user?.phoneNumber,
            },
            isVideoCall: isVideoCall ? allowVideo : false,
          });
        } catch (error) {
          dispatch(
            addAlert({
              type: "error",
              message: t("call.rejoinStartCallError", {
                defaultValue: "Unable to start a call right now.",
              }),
            })
          );
        }
      };
      const handleDelayScheduledCall = async () => {
        if (!message?._id || !room?._id) return;
        const baseMs = canParseScheduledFor
          ? scheduledForDate.getTime()
          : Date.now();
        const next = new Date(baseMs + 10 * 60 * 1000).toISOString();
        const result = await rescheduleScheduledMessage?.({
          room: room._id,
          messageId: message._id,
          scheduledAt: next,
        });
        if (result?.type === "success") {
          dispatch(
            addAlert({
              type: "success",
              message: t("chat.scheduledCallDelayedSuccess", {
                defaultValue: "Scheduled call delayed by 10 minutes.",
              }),
            })
          );
          return;
        }
        dispatch(
          addAlert({
            type: "error",
            message:
              result?.message ||
              t("chat.scheduledCallDelayedFailed", {
                defaultValue: "Unable to delay this scheduled call.",
              }),
          })
        );
      };
      const handleCancelScheduledCall = async () => {
        if (!message?._id || !room?._id) return;
        const result = await cancelScheduledMessage?.({
          room: room._id,
          messageId: message._id,
        });
        if (result?.type === "success") {
          dispatch(
            addAlert({
              type: "success",
              message: t("chat.scheduledCallCancelledSuccess", {
                defaultValue: "Scheduled call cancelled.",
              }),
            })
          );
          return;
        }
        dispatch(
          addAlert({
            type: "error",
            message:
              result?.message ||
              t("chat.scheduledCallCancelledFailed", {
                defaultValue: "Unable to cancel this scheduled call.",
              }),
          })
        );
      };
      const actorUser = resolveCallEventUser(actorId, actorSnapshot);
      const callerUser = resolveCallEventUser(callerId, callerSnapshot);
      const starterUser = resolveCallEventUser(starterId, starterSnapshot);
      const endedByUser = resolveCallEventUser(endedById, endedBySnapshot);
      const nameClassName =
        "text-xs font-semibold text-slate-400 dark:text-slate-200";
      const detailsLabelClassName = "text-xs text-slate-500 dark:text-slate-300";
      let detailsNode = null;
      if (isGroupSessionSummary) {
        detailsNode = (
          <Text className={detailsLabelClassName}>
            {t("call.events.details.labels.startedBy")}{" "}
            <UserName user={starterUser} maxLength={18} className={nameClassName} />
            {endedById ? (
              <>
                {", "}
                {t("call.events.details.labels.endedBy")}{" "}
                <UserName user={endedByUser} maxLength={18} className={nameClassName} />
              </>
            ) : null}
          </Text>
        );
      } else if (status === "answered") {
        if (callerName && actorName && !actorIsCaller) {
          detailsNode = (
            <Text className={detailsLabelClassName}>
              {t("call.events.details.labels.startedBy")}{" "}
              <UserName user={callerUser} maxLength={18} className={nameClassName} />
              {", "}
              {t("call.events.details.labels.endedBy")}{" "}
              <UserName user={actorUser} maxLength={18} className={nameClassName} />
            </Text>
          );
        } else if (callerName && actorIsCaller) {
          detailsNode = (
            <Text className={detailsLabelClassName}>
              {t("call.events.details.labels.startedAndEndedBy")}{" "}
              <UserName user={callerUser} maxLength={18} className={nameClassName} />
            </Text>
          );
        } else if (callerName) {
          detailsNode = (
            <Text className={detailsLabelClassName}>
              {t("call.events.details.labels.startedBy")}{" "}
              <UserName user={callerUser} maxLength={18} className={nameClassName} />
            </Text>
          );
        }
      } else if (status === "rejected") {
        detailsNode =
          isGroupRoom && callerName && actorName && !actorIsCaller ? (
            <Text className={detailsLabelClassName}>
              {t("call.events.details.labels.rejectedBy")}{" "}
              <UserName user={actorUser} maxLength={18} className={nameClassName} />
              {" ("}
              {t("call.events.details.labels.caller")}
              {": "}
              <UserName user={callerUser} maxLength={18} className={nameClassName} />
              {")"}
            </Text>
          ) : (
            <Text className={detailsLabelClassName}>
              {t("call.events.details.labels.rejectedBy")}{" "}
              <UserName user={actorUser} maxLength={18} className={nameClassName} />
            </Text>
          );
      } else if (status === "missed") {
        detailsNode =
          isGroupRoom && callerName ? (
            <Text className={detailsLabelClassName}>
              <UserName user={actorUser} maxLength={18} className={nameClassName} />{" "}
              {t("call.events.details.labels.missedCallOf")}{" "}
              <UserName user={callerUser} maxLength={18} className={nameClassName} />
            </Text>
          ) : (
            <Text className={detailsLabelClassName}>
              <UserName user={actorUser} maxLength={18} className={nameClassName} />{" "}
              {t("call.events.details.labels.missedTheCall")}
            </Text>
          );
      } else if (status === "cancelled") {
        detailsNode = (
          <Text className={detailsLabelClassName}>
            {t("call.events.details.labels.cancelledBy")}{" "}
            <UserName user={actorUser} maxLength={18} className={nameClassName} />
          </Text>
        );
      } else if (status === "scheduled") {
        detailsNode = (
          <Text className={detailsLabelClassName}>
            {t("call.events.details.labels.scheduledFor")}{" "}
            <Text className={nameClassName}>
              {scheduledForLabel ||
                t("chat.scheduledMessageLabel", { defaultValue: "Scheduled" })}
            </Text>
          </Text>
        );
      }

      return (
        <View key={message?._id} className="my-1.5 items-center justify-center px-2">
          <View className="max-w-[92%] rounded-2xl bg-chatSurfaceLight/95 dark:bg-chatSurfaceDark/95 px-4 py-2.5">
            <View className="flex-row items-center justify-center">
              <View className="h-6 w-6 rounded-full items-center justify-center bg-slate-200/70 dark:bg-slate-700/50">
                <FeIcon
                  name={iconByStatus[status] || "phone"}
                  size={14}
                  color={iconColorByStatus[status] || "#64748b"}
                />
              </View>
              <Text className={`ml-2 text-sm font-semibold ${colorByStatus[status] || "text-slate-700 dark:text-slate-200"}`}>
                {t(`call.events.${status}.title`)}
              </Text>
            </View>
            <View className="mt-1.5 items-center">
              <View className="rounded-full bg-white/90 dark:bg-slate-800/90 px-3 py-1.5">
                <View className="flex-row items-center justify-center flex-wrap">
                  {detailsNode || null}
                  {detailsNode ? (
                    <Text className="mx-1 text-xs text-center text-slate-500 dark:text-slate-300">
                      •
                    </Text>
                  ) : null}
                  <CallTypeBadge
                    isVideoCall={isVideoCall}
                    variant="inline"
                    shortLabel={false}
                    iconSize={11}
                    textClassName="text-[11px]"
                  />
                  {status === "answered" && duration > 0 ? (
                    <Text className="ml-1 text-xs text-center text-slate-500 dark:text-slate-300">
                      • {durationText}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
            {status === "scheduled" && (
              <View className="mt-2 items-center">
                <TouchableOpacity
                  onPress={handleStartScheduledCall}
                  className="px-3 py-1.5 rounded-full bg-sky-500/15 border border-sky-500/35"
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-semibold text-sky-600 dark:text-sky-300">
                    {t("call.events.startNowAction", {
                      defaultValue: "Start now",
                    })}
                  </Text>
                </TouchableOpacity>
                {String(message?.user || "") === String(user?._id || "") && (
                  <View className="mt-2 flex-row items-center gap-2">
                    <TouchableOpacity
                      onPress={handleDelayScheduledCall}
                      className="px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/35"
                      accessibilityRole="button"
                    >
                      <Text className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                        {t("chat.delayScheduledCallAction", {
                          defaultValue: "Delay 10m",
                        })}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleCancelScheduledCall}
                      className="px-3 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/35"
                      accessibilityRole="button"
                    >
                      <Text className="text-[11px] font-semibold text-rose-600 dark:text-rose-300">
                        {t("chat.cancelScheduledCallAction", {
                          defaultValue: "Cancel",
                        })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      );
    }

    if (message?.type === "linker") {
      return (
        <View
          className={`flex-row items-center justify-center my-3`}
          key={message?._id}
        >
          <View
            className="flex-row items-center justify-center p-2 px-3 bg-white dark:bg-slate-800/80 rounded-2xl border border-gray-200 dark:border-slate-700"
            dir={isRTL}
          >
            {message?.content && JSON.parse(message?.content) && (() => {
              const content = JSON.parse(message?.content);
              const isRoomUpdate = content?.message === "updatedRoomName" || content?.message === "updatedRoomImage";
              
              return (
                <>
                  {content?.performedBy && (
                    <>
                      <Text
                        className="text-base text-slate-800 dark:text-slate-200 font-medium"
                      >
                        {content.performedBy}
                      </Text>
                      <Text
                        className="text-base text-slate-600 dark:text-slate-400"
                      >
                        {" "}
                      </Text>
                    </>
                  )}
                  <Text
                    className="text-base text-slate-600 dark:text-slate-400"
                  >
                    {t(`general.${content?.message}`)}
                  </Text>
                  {!isRoomUpdate && content?.userName && (
                    <>
                      <Text
                        className="text-base text-slate-600 dark:text-slate-400"
                      >
                        {" "}
                      </Text>
                      <Text
                        className="text-base text-slate-800 dark:text-slate-200 font-medium"
                      >
                        {content.userName}
                      </Text>
                    </>
                  )}
                  {content?.targetUserName && (
                    <>
                      <Text
                        className="text-base text-slate-600 dark:text-slate-400"
                      >
                        {" "}
                      </Text>
                      <Text
                        className="text-base text-slate-800 dark:text-slate-200 font-medium"
                      >
                        {content.targetUserName}
                      </Text>
                    </>
                  )}
                </>
              );
            })()}
          </View>
        </View>
      );
    } else {
      return (
        <View key={message?._id}>
          {selectedMessages.length < 2 &&
            selectedMessages.includes(message) && (
              <View
                className={`w-full p-3 mt-3 mb-1 rounded-full ${
                  "bg-[#f6f8f9] dark:bg-sec"
                }`}
              >
                <View
                  className={`flex-row items-center justify-evenly gap-x-2`}
                >
                  {emojis.map((item) => (
                    <TouchableOpacity
                      key={item.name}
                      onPress={() => handleReaction(message?._id, item.emoji)}
                      className={`p-1`}
                    >
                      <Text className={`text-xl`}>{item.emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {showThreadFallbackInSelection && (
                  <TouchableOpacity
                    onPress={() => {
                      onOpenThread(message);
                      setSelectedMessages([]);
                    }}
                    className="mt-2 items-center py-1"
                    accessibilityRole="button"
                    accessibilityLabel={t("chat.startThread")}
                  >
                    <Text className="text-sm font-semibold text-sky-500 dark:text-sky-400">
                      {t("chat.startThread")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={messageAccessibilityLabel}
            accessibilityHint={t("chat.a11y.messageHint")}
            onPress={() => {
              if (selectedMessages.length > 0) {
                if (
                  selectedMessages.filter((item) => item?._id === message?._id)
                    .length
                ) {
                  setSelectedMessages(
                    selectedMessages.filter((msg) => msg?._id !== message?._id)
                  );
                } else {
                  setSelectedMessages([...selectedMessages, message]);
                }
              } else {
                setSelectedMessage((prev) =>
                  prev?._id === message?._id ? null : message
                );
              }
            }}
            onLongPress={() => {
              if (!selectedMessages.length) {
                setSelectedMessages([...selectedMessages, message]);
              }
            }}
            className={`flex-row ${
              message?.user === user?._id ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {message?.user !== user?._id && (
              <View
                className={`h-fit ${
                  message?.user === user?._id ? "ml-1" : "mr-1"
                }`}
              >
                <UserImage
                  size="w-10 h-10"
                  border="border-0"
                  text="text-sm"
                  showStatus={false}
                  show={isFirstMessageFromUser}
                  user={messageAuthor || roomMembers?.[0] || null}
                />
              </View>
            )}

            <View
              className={`flex flex-col w-full ${
                message?.user !== user?._id ? "items-start" : "items-end"
              }`}
            >
              <View className={`relative w-full`} style={{ maxWidth: bubbleMaxWidth }}>
                <View
                  className={`absolute top-[-1px] left-[-34px] right-[-34px] bottom-[-1px] ${
                    selectedMessages.includes(message) ? "bg-drakGray" : ""
                  } `}
                />
                <Swipeable
                  ref={swipeableRef}
                  renderLeftActions={renderRightActions}
                  onSwipeableOpen={() => {
                    setMsgToReply(null);
                    setMsgToReply(message);
                    setTimeout(() => {
                      swipeableRef.current?.close();
                    }, 0);
                  }}
                >
                  <LinearGradient
                    colors={
                      message?.user === user?._id
                        ? ["#0ea5e9", "#6366f1"]
                        : isDarkColorScheme
                        ? ["#1e212b", "#1e212b"]
                        : ["#f6f8f9", "#f6f8f9"]
                    }
                    start={{ x: 1, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      position: "relative",
                      flexDirection: "column",
                      display: "flex",
                      direction: isRTL ? "rtl" : "ltr",
                      alignContent: isRTL ? "flex-end" : "flex-start",
                      justifyContent: "flex-start",
                      // width:
                      //   message?.type === "location" ||
                      //   message?.type === "image" ||
                      //   message?.type === "audio" ||
                      //   message?.type === "file" ||
                      //   message?.type === "document" ||
                      //   message?.type === "video" ||
                      //   (message?.type === "text" &&
                      //     room?.messages?.[message?.replyTo]?.type !== "text")
                      //     ? "100%"
                      //     : "auto",
                      // width:
                      // ? "auto" : "100%",
                      borderRadius: 16,
                      marginLeft: message?.user === user?._id ? "auto" : 0,
                      marginRight: message?.user === user?._id ? 0 : "auto",
                    }}
                  >
                    {message?.forwardedFrom && (
                      <View
                        className={`relative overflow-hidden rounded-b-none ${
                          Platform.OS === "web" ? "w-full" : "w-fit"
                        }`}
                      >
                        <View
                          className={`flex-col ${
                            isRTL ? "items-end" : "items-start"
                          } justify-start w-full bg-slate-900/10 rounded-2xl rounded-b-none`}
                        >
                          <View
                            className={`flex-row w-full items-center justify-start px-2 pt-1 pb-1 gap-x-2  border-b ${
                              isDarkColorScheme || message?.user === user?._id
                                ? "border-white/20"
                                : "border-black/20"
                            }`}
                          >
                            <Icon
                              name="return-up-forward"
                              size={20}
                              color={
                                isDarkColorScheme || message?.user === user?._id
                                  ? "#EDF6F9"
                                  : "#023047"
                              }
                            />
                            <Text
                              className={`text-base
                            ${
                              isDarkColorScheme || message?.user === user?._id
                                ? "text-slate-200"
                                : "text-slate-800"
                            } text-start `}
                              style={{
                                whiteSpace: "nowrap",
                              }}
                            >
                              {t("general.forwarded")}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}
                    {message?.replyTo && (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={!onJumpToMessage}
                        onPress={() => {
                          if (message?.replyTo && onJumpToMessage) {
                            onJumpToMessage(message.replyTo);
                          }
                        }}
                        className={`relative overflow-hidden rounded-b-none ${
                          Platform.OS === "web" ? "w-full" : "w-fit"
                        }`}
                      >
                        <View
                          className={`flex-col ${
                            isRTL ? "items-end" : "items-start"
                          } justify-start w-full bg-slate-900/10 rounded-2xl rounded-b-none`}
                        >
                          <View
                            className={`flex-row w-full items-center justify-start px-2 pt-1.5 pb-1.5 gap-x-2 ${
                              isDarkColorScheme || message?.user === user?._id
                                ? "bg-white/10"
                                : "bg-black/5"
                            }`}
                          >
                            <FeIcon
                              name="corner-up-left"
                              size={20}
                              color={
                                isDarkColorScheme || message?.user === user?._id
                                  ? "#EDF6F9"
                                  : "#023047"
                              }
                            />
                            <UserDisplay
                              user={
                                resolveMessageUser(
                                  room?.messages?.[message?.replyTo]
                                ) || roomMembers?.[0] || null
                              }
                              showAvatar={false}
                              showStatusDot={false}
                              variant="compact"
                              className="p-0 bg-transparent"
                              primaryClassName={`text-base ${
                                isDarkColorScheme || message?.user === user?._id
                                  ? "!text-slate-200"
                                  : "!text-slate-800"
                              }`}
                            />
                          </View>
                          {room?.messages?.[message?.replyTo] && (
                            <RenderContent
                              message={room?.messages?.[message?.replyTo]}
                              bg="bg-slate-900/15"
                              rounded="rounded-none"
                              onVotePoll={handleVotePoll}
                            />
                          )}

                          {room?.messages?.[message?.replyTo]?.text && (
                            <Text
                              className={`px-2 pt-1.5 pb-1.5 text-base break-words ${
                                isDarkColorScheme || message?.user === user?._id
                                  ? "text-slate-300"
                                  : "text-slate-600"
                              } ${isDarkColorScheme || message?.user === user?._id ? "bg-white/5" : "bg-black/5"} w-full`}
                              style={{
                                wordBreak: "break-word",
                                maxWidth: Math.max(220, bubbleMaxWidth - 48),
                              }}
                            >
                              {room?.messages?.[message?.replyTo]?.text}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    )}
                    <RenderContent
                      message={message}
                      setShowImages={setShowImages}
                      onVotePoll={handleVotePoll}
                      rounded={
                        message?.replyTo || message?.forwardedFrom
                          ? "rounded-t-none"
                          : "rounded-2xl"
                      }
                    />
                    {!!displayMessageText && (
                      <>
                        {message?.type === "text" &&
                        (message?.mentions?.length > 0 ||
                          displayMessageText.includes("@")) ? (
                          <View className="px-2 pt-1" style={{ maxWidth: Math.max(220, bubbleMaxWidth - 48) }}>
                            <MentionRichText
                              text={displayMessageText}
                              mentionIds={(message?.mentions || []).map((x) =>
                                typeof x === "object" && x?._id ? x._id : x
                              )}
                              className={`text-base ${
                                isDarkColorScheme || message?.user === user?._id
                                  ? "text-slate-100"
                                  : "text-slate-900"
                              } text-start leading-6`}
                              mentionClassName={
                                isDarkColorScheme || message?.user === user?._id
                                  ? "text-sky-300 font-semibold"
                                  : "text-sky-600 font-semibold"
                              }
                            />
                          </View>
                        ) : (
                          <Text
                            className={`px-2 pt-1 text-base break-words ${
                              isDarkColorScheme || message?.user === user?._id
                                ? "text-slate-100"
                                : "text-slate-900"
                            } text-start leading-6`}
                            style={{
                              wordBreak: "break-word",
                              maxWidth: Math.max(220, bubbleMaxWidth - 48),
                            }}
                          >
                            {displayMessageText}
                          </Text>
                        )}
                      </>
                    )}

                    {chatFlags.linkPreviewsEnabled &&
                      message?.type === "text" &&
                      message?.linkPreview?.url && (
                      <View className="px-2 pb-1 w-full">
                        <LinkPreviewCard preview={message.linkPreview} />
                      </View>
                    )}

                    {showInlineThreadChip && (
                        <TouchableOpacity
                          onPress={() => onOpenThread(message)}
                          accessibilityRole="button"
                          accessibilityLabel={
                            threadReplyCount > 0
                              ? t("chat.openThread")
                              : t("chat.startThread")
                          }
                          className={`px-2 pb-1 w-full flex-row items-center gap-1 ${
                            message?.user === user?._id
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          {chatFlags.threadChipIconOnlyWhenEmpty &&
                          threadReplyCount === 0 ? (
                            <FeIcon
                              name="message-circle"
                              size={16}
                              color="#0ea5e9"
                            />
                          ) : (
                            <Text className="text-xs font-semibold text-sky-500 dark:text-sky-400">
                              {threadReplyCount > 0
                                ? t("chat.threadReplyCount", {
                                    count: threadReplyCount,
                                  })
                                : t("chat.startThread")}
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}

                    <View
                      className={`flex-row items-center gap-x-1 ${
                        message?.user === user?._id
                          ? "justify-end"
                          : "justify-start"
                      } px-2 mb-1`}
                    >
                      <Text
                        className={`text-xs ${
                          isDarkColorScheme || message?.user === user?._id
                            ? "text-slate-300"
                            : "text-slate-600"
                        }`}
                      >
                        {message?.createdAt
                          ? new Date(message?.createdAt).toLocaleTimeString(
                              "en-US",
                              {
                                hour: "numeric",
                                minute: "numeric",
                                hour12: true,
                              }
                            )
                          : ""}
                      </Text>
                      {message?.editedAt && (
                        <Text
                          className={`text-xs italic ${
                            isDarkColorScheme || message?.user === user?._id
                              ? "text-slate-400"
                              : "text-slate-500"
                          }`}
                        >
                          {t("chat.edited")}
                        </Text>
                      )}
                      {isLiveComment && (
                        <FeIcon
                          name="message-circle"
                          size={14}
                          color={
                            isDarkColorScheme || message?.user === user?._id
                              ? "#94a3b8"
                              : "#475569"
                          }
                        />
                      )}
                    </View>
                  </LinearGradient>
                </Swipeable>
              </View>

              <View
                className={`w-full flex-row items-center ${
                  message?.user === user?._id ? "justify-end" : "justify-start"
                } mb-1 ${message?.user === user?._id ? `text-right` : ""}`}
              >
                {reactionSummary.map((reaction, index) => (
                  <Text
                    key={index}
                    className={`text-xl ${
                      isDarkColorScheme || message?.user === user?._id
                        ? "text-slate-300"
                        : "text-slate-600"
                    }  `}
                  >
                    {reaction.reaction}
                    {reaction.count > 1 ? ` ${reaction.count}` : ""}
                  </Text>
                ))}
              </View>

              {(isFirstMessageFromUser ||
                isLastMessageFromUser ||
                room?.isGroup ||
                (message === selectedMessage &&
                  !selectedMessages.includes(message))) &&
                message?.user === user?._id && (
                  <View
                    className={`flex-row items-center justify-end w-full mb-1`}
                  >
                    {(() => {
                      const myId = normalizeMongoId(user?._id);
                      const filteredRecipients = (message?.sentTo || []).filter(
                        (item) => normalizeMongoId(item) !== myId
                      );
                      const rowClass =
                        "flex flex-row items-center justify-end w-full text-right gap-x-1";
                      const avatars = filteredRecipients.map((item, index) => {
                        const itemId = normalizeMongoId(item);
                        const member = room?.members?.find(
                          (m) => normalizeMongoId(m?._id) === itemId
                        );
                        const userForAvatar = member || { _id: itemId };
                        const idIn = (list) =>
                          Array.isArray(list) &&
                          list.some((x) => normalizeMongoId(x) === itemId);
                        const isDelivered = idIn(message?.deliveredTo);
                        const isSeen = idIn(message?.seenBy);
                        const status = message?.status;
                        return (
                          <UserImage
                            key={`${itemId}-${index}`}
                            size="w-6 h-6"
                            borderWidth={
                              status === "pending" ||
                              status === "scheduled" ||
                              status === "queued"
                                ? 0
                                : isSeen
                                ? 2
                                : isDelivered
                                ? 1
                                : 0
                            }
                            text="text-sm"
                            showStatus={false}
                            user={userForAvatar}
                          >
                            {status === "pending" ||
                            status === "scheduled" ||
                            status === "queued" ? (
                              <FeIcon
                                name="clock"
                                size={18}
                                color={
                                  isDarkColorScheme ? "#EDF6F9" : "#023047"
                                }
                              />
                            ) : isSeen ? (
                              <Icon
                                name="checkmark-done"
                                size={18}
                                color="#059669"
                              />
                            ) : isDelivered ? (
                              <Icon
                                name="checkmark-done"
                                size={18}
                                color={
                                  isDarkColorScheme ? "#EDF6F9" : "#023047"
                                }
                              />
                            ) : (
                              <Icon
                                name="checkmark"
                                size={18}
                                color={
                                  isDarkColorScheme ? "#EDF6F9" : "#023047"
                                }
                              />
                            )}
                          </UserImage>
                        );
                      });
                      if (room?.isGroup && filteredRecipients.length > 0) {
                        return (
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => setReadReceiptsForMessage(message)}
                            className={rowClass}
                          >
                            {avatars}
                          </TouchableOpacity>
                        );
                      }
                      return <View className={rowClass}>{avatars}</View>;
                    })()}
                    {message?.status === "failed" && (
                      <TouchableOpacity
                        className="ml-2 px-2 py-1 rounded-md bg-red-500/20"
                        onPress={async () => {
                          try {
                            await retryFailedMessage?.(message);
                          } catch (error) {
                            dispatch(
                              addAlert({
                                type: "error",
                                message:
                                  error?.message ||
                                  t("chat.retrySendFailed", {
                                    defaultValue:
                                      "Failed to retry sending message.",
                                  }),
                              })
                            );
                          }
                        }}
                      >
                        <Text className="text-xs font-semibold text-red-400">
                          {t("chat.retrySend", { defaultValue: "Retry" })}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              {message?.status === "scheduled" && (
                <View
                  className={`w-full flex-row ${
                    message?.user === user?._id ? "justify-end" : "justify-start"
                  } mb-1`}
                >
                  <Text className="text-[11px] text-amber-500">
                    {friendlyScheduledLabel
                      ? friendlyScheduledLabel
                      : t("chat.scheduledMessageLabel", {
                          defaultValue: "Scheduled",
                        })}
                  </Text>
                </View>
              )}
              {message?.status === "queued" && (
                <View
                  className={`w-full flex-row ${
                    message?.user === user?._id ? "justify-end" : "justify-start"
                  } mb-1`}
                >
                  <Text className="text-[11px] text-sky-500">
                    {t("chat.queuedMessageLabel", { defaultValue: "Queued" })}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <MessageReadReceiptsPopup
            showModal={!!readReceiptsForMessage}
            setShowModal={(open) => {
              if (!open) setReadReceiptsForMessage(null);
            }}
            message={readReceiptsForMessage}
            room={room}
          />
        </View>
      );
    }
  }
);

export default MessageItem;
