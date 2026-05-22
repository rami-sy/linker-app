import { useContext, useEffect, useMemo, useCallback, useState } from "react";
import { Platform, Keyboard, Alert } from "react-native";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import MDCIcon from "react-native-vector-icons/MaterialCommunityIcons";

import { SocketContext } from "../contexts/socket.context";
import useSelectedRoom from "./use-selected-room";
import {
  getActiveMentionQuery,
  getMentionInsertLabel,
  parseMentionUserIds,
} from "../utils/mention-utils";
import { chatFlags } from "../constants/chatFlags";
import { CHAT_STICKER_PRESETS } from "../constants/chatStickerPresets";
import logger from "../utils/logger";
import {
  toDateInputValue,
  toTimeInputValue,
  parseLocalDateTime,
  schedulePresetTarget,
  defaultScheduleBase,
} from "../utils/chatScheduleTime";

/**
 * Composer business logic: drafts, mentions, send/schedule, polls, GIFs, stickers, more menu.
 */
export default function useChatComposer({
  message,
  setMessage,
  handleTextChange,
  setSelectedMessage,
  showAttachment,
  setShowAttachment,
  onSend = null,
  msgToReply,
  setMsgToReply,
  recording,
  scrollToEnd,
  activeThreadRootId = null,
}) {
  const room = useSelectedRoom();
  const { user } = useSelector((state) => state.users);
  const { t } = useTranslation();
  const { sendMessage } = useContext(SocketContext);

  const youBlockedUser = user?.blockedUsers?.includes(room?.members?.[0]?._id);
  const userBlockedYou = room?.members?.[0]?.blockedUsers?.includes(user?._id);
  const canSendMessages = true;
  const canSendFiles = true;
  const canSendMedia = true;

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [showNativeDatePicker, setShowNativeDatePicker] = useState(false);
  const [showNativeTimePicker, setShowNativeTimePicker] = useState(false);
  const [callScheduleModalOpen, setCallScheduleModalOpen] = useState(false);
  const [callScheduleDate, setCallScheduleDate] = useState("");
  const [callScheduleTime, setCallScheduleTime] = useState("");
  const [callScheduleVideo, setCallScheduleVideo] = useState(true);
  const [showCallNativeDatePicker, setShowCallNativeDatePicker] = useState(false);
  const [showCallNativeTimePicker, setShowCallNativeTimePicker] = useState(false);
  const [gifModalOpen, setGifModalOpen] = useState(false);
  const [gifUrl, setGifUrl] = useState("");
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptionA, setPollOptionA] = useState("");
  const [pollOptionB, setPollOptionB] = useState("");
  const [pollOptionC, setPollOptionC] = useState("");
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [stickerModalOpen, setStickerModalOpen] = useState(false);

  const draftStorageKey = useMemo(() => {
    const roomKey = room?._id ? String(room._id) : "unknown-room";
    const threadKey = activeThreadRootId ? String(activeThreadRootId) : "root";
    return `chat-draft:${roomKey}:${threadKey}`;
  }, [activeThreadRootId, room?._id]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    try {
      const savedDraft = window.localStorage.getItem(draftStorageKey);
      if (typeof savedDraft === "string" && savedDraft !== message) {
        setMessage(savedDraft);
      }
    } catch {
      // Ignore draft restore failures.
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    try {
      const value = String(message || "");
      if (value.trim().length === 0) {
        window.localStorage.removeItem(draftStorageKey);
      } else {
        window.localStorage.setItem(draftStorageKey, value);
      }
    } catch {
      // Ignore draft persistence failures.
    }
  }, [draftStorageKey, message]);

  const mentionCtx = useMemo(
    () => getActiveMentionQuery(message),
    [message]
  );

  const mentionSuggestions = useMemo(() => {
    if (!room?.isGroup || !mentionCtx) return [];
    const q = (mentionCtx.query || "").toLowerCase();
    return (room.members || [])
      .filter((m) => String(m?._id) !== String(user?._id))
      .filter((m) => {
        const label = getMentionInsertLabel(m).toLowerCase();
        const un = (m.userName && String(m.userName).toLowerCase()) || "";
        return !q || label.startsWith(q) || un.startsWith(q.replace(/^@/, ""));
      })
      .slice(0, 10);
  }, [room?.isGroup, room?.members, mentionCtx, user?._id]);

  const insertMention = useCallback(
    (member) => {
      const ctx = getActiveMentionQuery(message);
      if (!ctx) return;
      const before = message.slice(0, ctx.startIndex);
      const label = getMentionInsertLabel(member);
      handleTextChange(`${before}@${label} `);
    },
    [message, handleTextChange]
  );

  const generateAiDraft = useCallback(() => {
    const replySeed = String(msgToReply?.text || "").trim();
    const lastIncomingText = Object.values(room?.messages || {})
      .filter((m) => String(m?.user) !== String(user?._id))
      .filter((m) => m?.type === "text" && typeof m?.text === "string")
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]?.text;
    const seed = replySeed || String(lastIncomingText || "").trim();
    const draft =
      seed.length > 0
        ? `${t("chat.aiDraftPrefix", { defaultValue: "Thanks!" })} ${seed.slice(
            0,
            70
          )} ${t("chat.aiDraftSuffix", {
            defaultValue: "I will check and get back to you shortly.",
          })}`
        : t("chat.aiDraftDefault", {
            defaultValue:
              "Thanks for the update. I will review this and reply shortly.",
          });
    handleTextChange(draft);
    logger.chatEvent("aiDraftApplied", {
      roomId: String(room?._id || ""),
      hasReplySeed: Boolean(replySeed),
    });
  }, [handleTextChange, msgToReply?.text, room?._id, room?.messages, t, user?._id]);

  const openScheduleModal = useCallback(() => {
    const base = defaultScheduleBase();
    setScheduleDate(toDateInputValue(base));
    setScheduleTime(toTimeInputValue(base));
    setScheduleModalOpen(true);
  }, []);

  const openCallScheduleModal = useCallback(() => {
    const base = defaultScheduleBase();
    setCallScheduleDate(toDateInputValue(base));
    setCallScheduleTime(toTimeInputValue(base));
    setCallScheduleVideo(true);
    setCallScheduleModalOpen(true);
  }, []);

  const openGifModal = useCallback(() => {
    setGifUrl("");
    setGifModalOpen(true);
  }, []);

  const openPollModal = useCallback(() => {
    setPollQuestion("");
    setPollOptionA("");
    setPollOptionB("");
    setPollOptionC("");
    setPollAllowMultiple(false);
    setPollModalOpen(true);
  }, []);

  const afterSendSuccess = useCallback(async () => {
    setMsgToReply(null);
    await setSelectedMessage(null);
    scrollToEnd?.();
  }, [scrollToEnd, setMsgToReply, setSelectedMessage]);

  const submitGifMessage = useCallback(async () => {
    if (!canSendMessages || youBlockedUser || userBlockedYou) return;
    const raw = String(gifUrl || "").trim();
    if (!raw) return;
    if (!/^https?:\/\//i.test(raw)) {
      Alert.alert(
        t("chat.gifInvalidUrlTitle", { defaultValue: "Invalid GIF URL" }),
        t("chat.gifInvalidUrlBody", {
          defaultValue: "Please paste a valid http(s) GIF link.",
        })
      );
      return;
    }
    const sendResult = await sendMessage({
      text: "",
      type: "image",
      content: JSON.stringify({
        path: raw,
        filename: "gif.gif",
        mimeType: "image/gif",
        isRemote: true,
      }),
      replyTo: msgToReply?.uuId ?? null,
      ...(activeThreadRootId ? { threadRoot: activeThreadRootId } : {}),
    });
    if (
      sendResult?.type === "success" ||
      sendResult?.type === "queued" ||
      sendResult?.type === "scheduled"
    ) {
      setGifModalOpen(false);
      setGifUrl("");
      await afterSendSuccess();
    }
  }, [
    activeThreadRootId,
    afterSendSuccess,
    gifUrl,
    msgToReply?.uuId,
    sendMessage,
    t,
    userBlockedYou,
    youBlockedUser,
  ]);

  const submitPollMessage = useCallback(async () => {
    if (!canSendMessages || youBlockedUser || userBlockedYou) return;
    const question = String(pollQuestion || "").trim();
    const rawOptions = [pollOptionA, pollOptionB, pollOptionC]
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    const options = [...new Set(rawOptions)];
    if (!question || options.length < 2) {
      Alert.alert(
        t("chat.pollValidationTitle", { defaultValue: "Invalid poll" }),
        t("chat.pollValidationBody", {
          defaultValue: "Add a question and at least two options.",
        })
      );
      return;
    }
    const sendResult = await sendMessage({
      text: question,
      type: "poll",
      content: JSON.stringify({
        question,
        allowMultiple: pollAllowMultiple,
        options: options.map((text, index) => ({
          id: String(index + 1),
          text,
          voterIds: [],
        })),
      }),
      replyTo: msgToReply?.uuId ?? null,
      ...(activeThreadRootId ? { threadRoot: activeThreadRootId } : {}),
    });
    if (
      sendResult?.type === "success" ||
      sendResult?.type === "queued" ||
      sendResult?.type === "scheduled"
    ) {
      setPollModalOpen(false);
      await afterSendSuccess();
    }
  }, [
    activeThreadRootId,
    afterSendSuccess,
    msgToReply?.uuId,
    pollAllowMultiple,
    pollOptionA,
    pollOptionB,
    pollOptionC,
    pollQuestion,
    sendMessage,
    t,
    userBlockedYou,
    youBlockedUser,
  ]);

  const scheduleCallReminder = useCallback(async () => {
    if (!canSendMessages || youBlockedUser || userBlockedYou) return;
    try {
      if (!callScheduleDate || !callScheduleTime) {
        throw new Error("invalid_schedule_time");
      }
      const scheduledDate = parseLocalDateTime(
        callScheduleDate,
        callScheduleTime
      );
      if (!scheduledDate) throw new Error("invalid_schedule_time");
      if (scheduledDate.getTime() - Date.now() < 15 * 1000) {
        Alert.alert(
          t("chat.scheduleCallFailedTitle", { defaultValue: "Schedule failed" }),
          t("chat.scheduleSendTooSoon", {
            defaultValue: "Please choose a time at least a few seconds ahead.",
          })
        );
        return;
      }
      const scheduledAt = scheduledDate.toISOString();
      const sendResult = await sendMessage({
        text: t("chat.scheduledCallSystemText", {
          defaultValue: "Scheduled call reminder",
        }),
        type: "call_event",
        content: JSON.stringify({
          eventKind: "scheduled",
          status: "scheduled",
          isVideoCall: callScheduleVideo,
          scheduledFor: scheduledAt,
          creatorUserId: user?._id || null,
          callerUserId: user?._id || null,
          actorUserId: user?._id || null,
        }),
        scheduledAt,
        ...(activeThreadRootId ? { threadRoot: activeThreadRootId } : {}),
      });
      const accepted =
        sendResult?.type === "scheduled" ||
        sendResult?.type === "queued" ||
        sendResult?.type === "success";
      if (!accepted) return;
      setCallScheduleModalOpen(false);
    } catch {
      Alert.alert(
        t("chat.scheduleCallFailedTitle", { defaultValue: "Schedule failed" }),
        t("chat.scheduleCallFailedBody", {
          defaultValue: "We could not schedule this call reminder. Please try again.",
        })
      );
    }
  }, [
    activeThreadRootId,
    callScheduleDate,
    callScheduleTime,
    callScheduleVideo,
    sendMessage,
    t,
    user?._id,
    userBlockedYou,
    youBlockedUser,
  ]);

  const submitStickerMessage = useCallback(
    async ({ url, label }) => {
      if (!canSendMessages || youBlockedUser || userBlockedYou) return;
      const raw = String(url || "").trim();
      if (!/^https?:\/\//i.test(raw)) return;
      const sendResult = await sendMessage({
        text: "",
        type: "sticker",
        content: JSON.stringify({
          path: raw,
          filename: `${String(label || "sticker").toLowerCase()}.gif`,
          mimeType: "image/gif",
          isRemote: true,
          stickerLabel: label || "Sticker",
        }),
        replyTo: msgToReply?.uuId ?? null,
        ...(activeThreadRootId ? { threadRoot: activeThreadRootId } : {}),
      });
      if (
        sendResult?.type === "success" ||
        sendResult?.type === "queued" ||
        sendResult?.type === "scheduled"
      ) {
        setStickerModalOpen(false);
        await afterSendSuccess();
      }
    },
    [
      activeThreadRootId,
      afterSendSuccess,
      msgToReply?.uuId,
      sendMessage,
      userBlockedYou,
      youBlockedUser,
    ]
  );

  const applySchedulePreset = useCallback((preset) => {
    const target = schedulePresetTarget(preset);
    setScheduleDate(toDateInputValue(target));
    setScheduleTime(toTimeInputValue(target));
  }, []);

  const submitComposerMessage = useCallback(async () => {
    if (!canSendMessages || youBlockedUser || userBlockedYou) return;
    if (!onSend && !message?.trim()) return;
    try {
      if (onSend) {
        await onSend();
      } else {
        const mentions = room?.isGroup
          ? parseMentionUserIds(message, room.members, user?._id)
          : [];
        const sendResult = await sendMessage({
          text: message,
          type: "text",
          replyTo: msgToReply?.uuId ?? null,
          mentions,
          ...(activeThreadRootId ? { threadRoot: activeThreadRootId } : {}),
        });
        if (
          sendResult?.type !== "success" &&
          sendResult?.type !== "queued"
        ) {
          return;
        }
        scrollToEnd?.();
      }
      await setMessage("");
      setMsgToReply(null);
      await setSelectedMessage(null);
      if (showAttachment) {
        await setShowAttachment(false);
      }
    } catch (error) {
      logger.error("composer.sendFailed", error);
      Alert.alert(
        "Send failed",
        "We could not send your message. Please try again."
      );
    }
  }, [
    activeThreadRootId,
    message,
    msgToReply?.uuId,
    onSend,
    room?.isGroup,
    room?.members,
    scrollToEnd,
    sendMessage,
    setMessage,
    setMsgToReply,
    setSelectedMessage,
    showAttachment,
    setShowAttachment,
    user?._id,
    userBlockedYou,
    youBlockedUser,
  ]);

  const scheduleComposerMessage = useCallback(async () => {
    if (!canSendMessages || youBlockedUser || userBlockedYou) return;
    if (!message?.trim()) return;
    try {
      if (!scheduleDate || !scheduleTime) {
        throw new Error("invalid_schedule_time");
      }
      const scheduledDate = parseLocalDateTime(scheduleDate, scheduleTime);
      if (!scheduledDate) throw new Error("invalid_schedule_time");
      if (scheduledDate.getTime() - Date.now() < 15 * 1000) {
        Alert.alert(
          t("chat.scheduleSendFailedTitle", { defaultValue: "Schedule failed" }),
          t("chat.scheduleSendTooSoon", {
            defaultValue: "Please choose a time at least a few seconds ahead.",
          })
        );
        return;
      }
      const scheduledAt = scheduledDate.toISOString();
      const mentions = room?.isGroup
        ? parseMentionUserIds(message, room.members, user?._id)
        : [];
      const sendResult = await sendMessage({
        text: message,
        type: "text",
        replyTo: msgToReply?.uuId ?? null,
        mentions,
        scheduledAt,
        ...(activeThreadRootId ? { threadRoot: activeThreadRootId } : {}),
      });
      const accepted =
        sendResult?.type === "scheduled" ||
        sendResult?.type === "queued" ||
        sendResult?.type === "success";
      if (!accepted) return;
      await setMessage("");
      setMsgToReply(null);
      await setSelectedMessage(null);
      setScheduleModalOpen(false);
      if (showAttachment) {
        await setShowAttachment(false);
      }
    } catch {
      Alert.alert(
        t("chat.scheduleSendFailedTitle", { defaultValue: "Schedule failed" }),
        t("chat.scheduleSendFailedBody", {
          defaultValue: "We could not schedule your message. Please try again.",
        })
      );
    }
  }, [
    activeThreadRootId,
    message,
    msgToReply?.uuId,
    room?.isGroup,
    room?.members,
    scheduleDate,
    scheduleTime,
    sendMessage,
    setMessage,
    setMsgToReply,
    setSelectedMessage,
    showAttachment,
    setShowAttachment,
    t,
    user?._id,
    userBlockedYou,
    youBlockedUser,
  ]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (recording) return;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "Enter") return;
      const target = e.target;
      const tag = target && target.tagName;
      if (tag !== "TEXTAREA" && tag !== "INPUT") return;
      e.preventDefault();
      void submitComposerMessage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording, submitComposerMessage]);

  const actionsDisabled = useMemo(
    () => youBlockedUser || userBlockedYou || !canSendMessages,
    [youBlockedUser, userBlockedYou]
  );

  const scheduleSendDisabled = useMemo(
    () => actionsDisabled || (!message && !onSend),
    [actionsDisabled, message, onSend]
  );

  const moreActionOptions = useMemo(() => {
    const baseItemClass = "flex-row items-center justify-between p-2 gap-x-2";
    const disabledClass = "opacity-50";
    const options = [];

    if (chatFlags.aiAssistEnabled) {
      options.push({
        name: t("chat.aiDraftAction", { defaultValue: "Generate draft reply" }),
        icon: <MDCIcon name="creation" size={18} color="#64748b" />,
        className: `${baseItemClass} ${actionsDisabled ? disabledClass : ""}`,
        onPress: () => {
          if (actionsDisabled) return;
          generateAiDraft();
        },
      });
    }

    options.push(
      {
        name: t("chat.scheduleCallAction", { defaultValue: "Schedule call" }),
        icon: <MDCIcon name="phone-clock" size={18} color="#64748b" />,
        className: `${baseItemClass} ${actionsDisabled ? disabledClass : ""}`,
        onPress: () => {
          if (actionsDisabled) return;
          openCallScheduleModal();
        },
      },
      {
        name: t("chat.sendStickerAction", { defaultValue: "Send sticker" }),
        icon: <MDCIcon name="emoticon-happy-outline" size={18} color="#64748b" />,
        className: `${baseItemClass} ${actionsDisabled ? disabledClass : ""}`,
        onPress: () => {
          if (actionsDisabled) return;
          setStickerModalOpen(true);
        },
      },
      {
        name: t("chat.createPollAction", { defaultValue: "Create poll" }),
        icon: <MDCIcon name="poll" size={18} color="#64748b" />,
        className: `${baseItemClass} ${actionsDisabled ? disabledClass : ""}`,
        onPress: () => {
          if (actionsDisabled) return;
          openPollModal();
        },
      },
      {
        name: t("chat.sendGifAction", { defaultValue: "Send GIF" }),
        icon: <MDCIcon name="file-gif-box" size={18} color="#64748b" />,
        className: `${baseItemClass} ${actionsDisabled ? disabledClass : ""}`,
        onPress: () => {
          if (actionsDisabled) return;
          openGifModal();
        },
      },
      {
        name: t("chat.scheduleSendAction", { defaultValue: "Schedule send" }),
        icon: <MDCIcon name="clock-outline" size={18} color="#64748b" />,
        className: `${baseItemClass} ${
          scheduleSendDisabled ? disabledClass : ""
        }`,
        onPress: () => {
          if (scheduleSendDisabled) return;
          openScheduleModal();
        },
      }
    );

    return options;
  }, [
    actionsDisabled,
    generateAiDraft,
    openCallScheduleModal,
    openGifModal,
    openPollModal,
    openScheduleModal,
    scheduleSendDisabled,
    t,
  ]);

  const dismissComposerOverlays = useCallback(() => {
    Keyboard.dismiss?.();
  }, []);

  return {
    room,
    user,
    t,
    canSendMessages,
    canSendFiles,
    canSendMedia,
    youBlockedUser,
    userBlockedYou,
    mentionCtx,
    mentionSuggestions,
    insertMention,
    actionsDisabled,
    scheduleSendDisabled,
    moreActionOptions,
    submitComposerMessage,
    dismissComposerOverlays,
    stickerPresets: CHAT_STICKER_PRESETS,
    schedule: {
      open: scheduleModalOpen,
      setOpen: setScheduleModalOpen,
      date: scheduleDate,
      setDate: setScheduleDate,
      time: scheduleTime,
      setTime: setScheduleTime,
      showNativeDatePicker,
      setShowNativeDatePicker,
      showNativeTimePicker,
      setShowNativeTimePicker,
      applyPreset: applySchedulePreset,
      submit: scheduleComposerMessage,
    },
    callSchedule: {
      open: callScheduleModalOpen,
      setOpen: setCallScheduleModalOpen,
      date: callScheduleDate,
      setDate: setCallScheduleDate,
      time: callScheduleTime,
      setTime: setCallScheduleTime,
      video: callScheduleVideo,
      setVideo: setCallScheduleVideo,
      showNativeDatePicker: showCallNativeDatePicker,
      setShowNativeDatePicker: setShowCallNativeDatePicker,
      showNativeTimePicker: showCallNativeTimePicker,
      setShowNativeTimePicker: setShowCallNativeTimePicker,
      submit: scheduleCallReminder,
    },
    gif: {
      open: gifModalOpen,
      setOpen: setGifModalOpen,
      url: gifUrl,
      setUrl: setGifUrl,
      submit: submitGifMessage,
    },
    poll: {
      open: pollModalOpen,
      setOpen: setPollModalOpen,
      question: pollQuestion,
      setQuestion: setPollQuestion,
      optionA: pollOptionA,
      setOptionA: setPollOptionA,
      optionB: pollOptionB,
      setOptionB: setPollOptionB,
      optionC: pollOptionC,
      setOptionC: setPollOptionC,
      allowMultiple: pollAllowMultiple,
      setAllowMultiple: setPollAllowMultiple,
      submit: submitPollMessage,
    },
    sticker: {
      open: stickerModalOpen,
      setOpen: setStickerModalOpen,
      submit: submitStickerMessage,
    },
  };
}
