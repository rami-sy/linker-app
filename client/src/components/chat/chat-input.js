import {
  View,
  TouchableOpacity,
  useWindowDimensions,
  TextInput,
  Platform,
  Keyboard,
  ActivityIndicator,
  Text,
  Image,
  I18nManager,
  TouchableHighlight,
  ScrollView,
  Alert,
} from "react-native";
import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import ENIcon from "react-native-vector-icons/Entypo";
import MDCIcon from "react-native-vector-icons/MaterialCommunityIcons";
import Icon from "react-native-vector-icons/Ionicons";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useSelector } from "react-redux";
import { SocketContext } from "../../contexts/socket.context";
import RenderContent from "./render-content";
import IconButton from "../icon-button";
import useSelectedRoom from "../../hooks/use-selected-room";
import { useTranslation } from "react-i18next";
import { getLocales } from "expo-localization";
import { emojis } from "rn-emoji-picker/dist/data";
import EmojiPicker, { emojiFromUtf16 } from "rn-emoji-picker";
import { useColorScheme } from "../../../lib/useColorScheme";
import * as Haptics from "expo-haptics";
import UserImage from "../user-image";
import UserName from "../user-name";
import Popup from "../popup";
import {
  getActiveMentionQuery,
  getMentionInsertLabel,
  parseMentionUserIds,
} from "../../utils/mention-utils";
import { chatFlags } from "../../constants/chatFlags";
import logger from "../../utils/logger";
// checkChatPermission removed - canSend check is handled in footer.js

const ChatInput = ({
  message,
  setMessage,
  handleTextChange,
  setSelectedMessage,
  showAttachment,
  setShowAttachment,
  fullInput = true,
  onSend = null,
  msgToReply,
  setMsgToReply,
  recording,
  setRecording,
  startRecording,
  stopRecording,
  duration,
  scrollToEnd,
  onJumpToQuotedMessage,
  activeThreadRootId = null,
}) => {
  const room = useSelectedRoom(); // Use the custom hook to get the selected room
  const { user } = useSelector((state) => state.users);
  const { t } = useTranslation();
  const [showEmoji, setShowEmoji] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inputHeight, setInputHeight] = useState(48);
  const textInputRef = useRef(null);
  const youBlockedUser = user?.blockedUsers?.includes(room?.members?.[0]?._id);
  const userBlockedYou = room?.members?.[0]?.blockedUsers?.includes(user?._id);
  const { sendMessage } = useContext(SocketContext);
  const [recent, setRecent] = useState([]);
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

  // Get other user's data for permission checking (for non-group chats)
  const otherUser = useMemo(() => {
    if (!room || room?.isGroup) return null;
    const member = room?.members?.[0];
    return member ? { 
      ...member,
      privacySettings: member.privacySettings ? {
        ...member.privacySettings,
        defaultChatSettings: member.privacySettings.defaultChatSettings ? {
          ...member.privacySettings.defaultChatSettings,
        } : undefined,
      } : undefined,
    } : null;
  }, [
    room?.isGroup, 
    room?.members, 
    room?._id,
    room?.members?.[0]?._id,
    room?.members?.[0]?.privacySettings?.defaultChatSettings,
  ]);

  // Permission checks for sending are now handled by canSend in footer.js
  // If the user reaches this component, they already have permission to send
  // These variables are kept for backward compatibility but always return true
  const canSendFiles = true;
  const canSendMedia = true;
  const canSendMessages = true;

  useEffect(() => {
    let keyboardDidShowListener;
    if (keyboardHeight === 0) {
      keyboardDidShowListener = Keyboard.addListener("keyboardDidShow", (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      });
      return () => {
        keyboardDidShowListener.remove();
      };
    }
  }, []);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${minutes < 10 ? "0" : ""}${minutes}:${sec < 10 ? "0" : ""}${sec}`;
  };

  useEffect(() => {
    if (!message) {
      setInputHeight(48);
    }
  }, [message]);

  const handleStartRecording = async () => {
    await startRecording();
  };

  const handleStopRecording = async () => {
    await stopRecording();
  };

  const handlePauseRecording = async () => {
    console.log("Paused recording");
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

  const { isDarkColorScheme } = useColorScheme();
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";
  const handlePress = async () => {
    if (Platform.OS !== "web") {
      await Haptics.selectionAsync(Haptics.ImpactFeedbackStyle.Light); // تشغيل الاهتزاز عند الضغط
    }
  };

  const mentionCtx = useMemo(
    () => getActiveMentionQuery(message),
    [message]
  );

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
    } catch (error) {
      // Ignore draft restore failures to keep composer responsive.
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
    } catch (error) {
      // Ignore draft persistence failures to avoid breaking send flow.
    }
  }, [draftStorageKey, message]);

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

  const insertMention = (member) => {
    const ctx = getActiveMentionQuery(message);
    if (!ctx) return;
    const before = message.slice(0, ctx.startIndex);
    const label = getMentionInsertLabel(member);
    const next = `${before}@${label} `;
    handleTextChange(next);
  };

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

  const toDateInputValue = useCallback((date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const toTimeInputValue = useCallback((date) => {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }, []);

  const openScheduleModal = useCallback(() => {
    const base = new Date(Date.now() + 10 * 60 * 1000);
    setScheduleDate(toDateInputValue(base));
    setScheduleTime(toTimeInputValue(base));
    setScheduleModalOpen(true);
  }, [toDateInputValue, toTimeInputValue]);

  const openCallScheduleModal = useCallback(() => {
    const base = new Date(Date.now() + 10 * 60 * 1000);
    setCallScheduleDate(toDateInputValue(base));
    setCallScheduleTime(toTimeInputValue(base));
    setCallScheduleVideo(true);
    setCallScheduleModalOpen(true);
  }, [toDateInputValue, toTimeInputValue]);

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

  const stickerPresets = useMemo(
    () => [
      {
        id: "s1",
        label: "Smile",
        url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzRveDNuYjB0aXBoM3RiM2E2OXNkZXl2bGx1Zmxmb3R6YTY0N3QxYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/26ufdipQqU2lhNA4g/giphy.gif",
      },
      {
        id: "s2",
        label: "Love",
        url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2RxYjljMHJybXI5d2lrY2RwcmM4ZjJ2OTR3bnI2N3I4ODR1a3U2ZiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/l0HlBO7eyXzSZkJri/giphy.gif",
      },
      {
        id: "s3",
        label: "Thanks",
        url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2x5czYxYmFrN2F1ZG1uY2JwOWk2dmM5b3RncjR2OGI1N2tqOHh4NCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3oEdva9BUHPIs2SkGk/giphy.gif",
      },
      {
        id: "s4",
        label: "Congrats",
        url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExa3k1MzlqM2RjMGU5eHByN2h1bW5uN2N6eXQ2Y2I4anZqYzl2d3c4aCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/5GoVLqeAOo6PK/giphy.gif",
      },
    ],
    []
  );

  const submitGifMessage = useCallback(async () => {
    if (!canSendMessages || youBlockedUser || userBlockedYou) return;
    const raw = String(gifUrl || "").trim();
    if (!raw) return;
    const looksLikeHttp = /^https?:\/\//i.test(raw);
    if (!looksLikeHttp) {
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
      setMsgToReply(null);
      await setSelectedMessage(null);
      scrollToEnd?.();
    }
  }, [
    activeThreadRootId,
    canSendMessages,
    gifUrl,
    msgToReply?.uuId,
    scrollToEnd,
    sendMessage,
    setMsgToReply,
    setSelectedMessage,
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
      setMsgToReply(null);
      await setSelectedMessage(null);
      scrollToEnd?.();
    }
  }, [
    activeThreadRootId,
    canSendMessages,
    msgToReply?.uuId,
    pollAllowMultiple,
    pollOptionA,
    pollOptionB,
    pollOptionC,
    pollQuestion,
    scrollToEnd,
    sendMessage,
    setMsgToReply,
    setSelectedMessage,
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
      const scheduledDate = new Date(`${callScheduleDate}T${callScheduleTime}:00`);
      if (Number.isNaN(scheduledDate.getTime())) {
        throw new Error("invalid_schedule_time");
      }
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
      const acceptedScheduleResult =
        sendResult?.type === "scheduled" ||
        sendResult?.type === "queued" ||
        sendResult?.type === "success";
      if (!acceptedScheduleResult) return;
      setCallScheduleModalOpen(false);
    } catch (error) {
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
    canSendMessages,
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
        setMsgToReply(null);
        await setSelectedMessage(null);
        scrollToEnd?.();
      }
    },
    [
      activeThreadRootId,
      canSendMessages,
      msgToReply?.uuId,
      scrollToEnd,
      sendMessage,
      setMsgToReply,
      setSelectedMessage,
      userBlockedYou,
      youBlockedUser,
    ]
  );

  const applySchedulePreset = useCallback(
    (preset) => {
      const now = new Date();
      let target = new Date(now);
      if (preset === "in1h") {
        target = new Date(now.getTime() + 60 * 60 * 1000);
      } else if (preset === "tonight") {
        target = new Date(now);
        target.setHours(20, 0, 0, 0);
        if (target.getTime() <= now.getTime()) {
          target.setDate(target.getDate() + 1);
        }
      } else if (preset === "tomorrowMorning") {
        target = new Date(now);
        target.setDate(target.getDate() + 1);
        target.setHours(9, 0, 0, 0);
      }
      setScheduleDate(toDateInputValue(target));
      setScheduleTime(toTimeInputValue(target));
    },
    [toDateInputValue, toTimeInputValue]
  );

  const submitComposerMessage = useCallback(async () => {
    if (!canSendMessages) {
      return;
    }
    if (youBlockedUser || userBlockedYou) {
      return;
    }
    if (!onSend && !message?.trim()) {
      return;
    }
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
          ...(activeThreadRootId
            ? { threadRoot: activeThreadRootId }
            : {}),
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
      console.error("Message send failed", error);
      Alert.alert(
        "Send failed",
        "We could not send your message. Please try again."
      );
    }
  }, [
    canSendMessages,
    youBlockedUser,
    userBlockedYou,
    onSend,
    message,
    room?.isGroup,
    room?.members,
    user?._id,
    sendMessage,
    msgToReply?.uuId,
    scrollToEnd,
    setMessage,
    setMsgToReply,
    setSelectedMessage,
    showAttachment,
    setShowAttachment,
    activeThreadRootId,
  ]);

  const scheduleComposerMessage = useCallback(async () => {
    if (!canSendMessages || youBlockedUser || userBlockedYou) return;
    if (!message?.trim()) return;
    try {
      if (!scheduleDate || !scheduleTime) {
        throw new Error("invalid_schedule_time");
      }
      const scheduledDate = new Date(`${scheduleDate}T${scheduleTime}:00`);
      if (Number.isNaN(scheduledDate.getTime())) {
        throw new Error("invalid_schedule_time");
      }
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
      const acceptedScheduleResult =
        sendResult?.type === "scheduled" ||
        sendResult?.type === "queued" ||
        sendResult?.type === "success";
      if (!acceptedScheduleResult) return;
      await setMessage("");
      setMsgToReply(null);
      await setSelectedMessage(null);
      setScheduleModalOpen(false);
      if (showAttachment) {
        await setShowAttachment(false);
      }
    } catch (error) {
      Alert.alert(
        t("chat.scheduleSendFailedTitle", { defaultValue: "Schedule failed" }),
        t("chat.scheduleSendFailedBody", {
          defaultValue: "We could not schedule your message. Please try again.",
        })
      );
    }
  }, [
    activeThreadRootId,
    canSendMessages,
    message,
    msgToReply?.uuId,
    room?.isGroup,
    room?.members,
    sendMessage,
    setMessage,
    setMsgToReply,
    setSelectedMessage,
    showAttachment,
    setShowAttachment,
    scheduleDate,
    scheduleTime,
    t,
    user?._id,
    youBlockedUser,
    userBlockedYou,
  ]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (recording) return;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "Enter") return;
      const t = e.target;
      const tag = t && t.tagName;
      if (tag !== "TEXTAREA" && tag !== "INPUT") return;
      e.preventDefault();
      void submitComposerMessage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording, submitComposerMessage]);

  // const [selection, setSelection] = useState({ start: 0, end: 0 });

  return (
    <>
      <View className={`flex-row items-end justify-between w-full p-2.5 pt-1`}>
        <>
          <View className={`relative flex-1 mr-3`}>
            {msgToReply && (
              <View
                className="relative flex-row items-center justify-between w-full bg-chatSurfaceLight dark:bg-chatSurfaceDark rounded-t-3xl"
              >
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
                  <View
                    className={`flex-col items-stretch min-h-[40px] w-full justify-start pb-0 rounded-b-none rounded-3xl z-10`}
                  >
                    {msgToReply.type !== "text" && (
                      <View
                        className={`relative w-full overflow-hidden rounded-b-none`}
                      >
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
                      style={{
                        wordBreak: "break-word",
                      }}
                    >
                      {msgToReply?.text}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity className={`flex-row items-center justify-between`}>
              {!recording && (
                <TouchableOpacity
                  className={`absolute left-2 top-1/2 `}
                  style={{ transform: [{ translateY: -12 }], zIndex: 1 }}
                  onPress={() => {
                    Keyboard.dismiss(); // This will dismiss the keyboard
                    setShowEmoji(!showEmoji);
                    setShowAttachment(false);
                  }}
                  // disabled={youBlockedUser || userBlockedYou}
                >
                  <ENIcon
                    name="emoji-happy"
                    size={25}
                    color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                  />
                </TouchableOpacity>
              )}

            <TouchableOpacity
              className={`w-full`}
              activeOpacity={1}
              onPress={() => {
                setShowEmoji(false);
                // check if the text input is focused

                if (Platform.OS === "android") {
                  // Direct focus for Android
                  textInputRef.current?.focus();
                } else {
                  // Delayed focus for other platforms
                  setTimeout(() => {
                    textInputRef.current?.focus();
                  }, 100);
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
                      className={`p-3 justify-between flex-row w-full items-center h-12 bg-chatSurfaceLight dark:bg-chatSurfaceDark text-papaya ${
                        msgToReply ? "rounded-b-3xl" : "rounded-3xl"
                      }`}
                    >
                      <Text
                        className="text-base text-slate-800 dark:text-slate-200"
                      >
                        {formatTime(Math.floor(duration / 1000))}
                      </Text>
                      {/* <AudioVisualizer
                        isRecording={recording}
                        style={{ height: 50, backgroundColor: "black" }}
                        barColor="white"
                        barWidth={2}
                        barMargin={1}
                      /> */}
                      <View className={`flex-row items-center gap-x-2`}>
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
                      placeholder={!canSendMessages ? "You don't have permission to send messages" : "Type a message"}
                      value={message}
                      // ADD MULTILINE
                      numberOfLines={1}
                      onChangeText={handleTextChange}
                      placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                      multiline={true}
                      showsVerticalScrollIndicator={false} // Hide scrollbar
                      onContentSizeChange={(event) => {
                        const nextHeight =
                          event?.nativeEvent?.contentSize?.height || 48;
                        const boundedHeight = Math.max(
                          48,
                          Math.min(140, nextHeight)
                        );
                        setInputHeight(boundedHeight);
                      }}
                      // onPress={handlePress}
                      editable={canSendMessages && !youBlockedUser && !userBlockedYou}
                      keyboardType="default"
                      returnKeyType="send"
                    />
                  )}
                </View>
              </TouchableOpacity>
              {fullInput && !recording && (
                <View
                  className={`absolute flex-row items-center justify-center right-4 top-1/2 gap-x-2`}
                  style={{ transform: [{ translateY: -12 }], zIndex: 1 }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setShowAttachment(!showAttachment);
                      setShowEmoji(false);
                    }}
                    disabled={youBlockedUser || userBlockedYou || (!canSendFiles && !canSendMedia)}
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
          <View
            className={`flex-col justify-between h-auto items-center gap-x-2`}
          >
            {chatFlags.aiAssistEnabled && (
              <TouchableOpacity
                className="w-12 rounded-full h-12 items-center justify-center bg-slate-500/30 mb-2"
                onPress={generateAiDraft}
                accessibilityLabel={t("chat.aiDraftAction", {
                  defaultValue: "Generate draft reply",
                })}
              >
                <MDCIcon name="creation" size={24} color="#dee4e6" />
              </TouchableOpacity>
            )}
            {msgToReply && (
              <TouchableOpacity
                className={`w-12 rounded-full h-12 items-center justify-center bg-danger mb-2`}
              >
                <IconButton
                  iconName="close"
                  size={30}
                  className={`bg-danger`}
                  iconComponent={MDCIcon}
                  onPress={() => {
                    setMsgToReply(null);
                  }}
                />
              </TouchableOpacity>
            )}
            {message || onSend ? (
              <>
                <TouchableOpacity
                  className="w-12 rounded-full h-12 bg-slate-500/30 items-center justify-center mb-2"
                  onPress={openCallScheduleModal}
                  accessibilityLabel={t("chat.scheduleCallAction", {
                    defaultValue: "Schedule call",
                  })}
                  disabled={youBlockedUser || userBlockedYou || !canSendMessages}
                >
                  <MDCIcon name="phone-clock-outline" size={22} color="#dee4e6" />
                </TouchableOpacity>
                <TouchableOpacity
                  className="w-12 rounded-full h-12 bg-slate-500/30 items-center justify-center mb-2"
                  onPress={() => setStickerModalOpen(true)}
                  accessibilityLabel={t("chat.sendStickerAction", {
                    defaultValue: "Send sticker",
                  })}
                  disabled={youBlockedUser || userBlockedYou || !canSendMessages}
                >
                  <MDCIcon name="emoticon-happy-outline" size={22} color="#dee4e6" />
                </TouchableOpacity>
                <TouchableOpacity
                  className="w-12 rounded-full h-12 bg-slate-500/30 items-center justify-center mb-2"
                  onPress={openPollModal}
                  accessibilityLabel={t("chat.createPollAction", {
                    defaultValue: "Create poll",
                  })}
                  disabled={youBlockedUser || userBlockedYou || !canSendMessages}
                >
                  <MDCIcon name="poll" size={22} color="#dee4e6" />
                </TouchableOpacity>
                <TouchableOpacity
                  className="w-12 rounded-full h-12 bg-slate-500/30 items-center justify-center mb-2"
                  onPress={openGifModal}
                  accessibilityLabel={t("chat.sendGifAction", {
                    defaultValue: "Send GIF",
                  })}
                  disabled={youBlockedUser || userBlockedYou || !canSendMessages}
                >
                  <MDCIcon name="file-gif-box" size={22} color="#dee4e6" />
                </TouchableOpacity>
                <TouchableOpacity
                  className="w-12 rounded-full h-12 bg-slate-500/30 items-center justify-center mb-2"
                  onPress={openScheduleModal}
                  accessibilityLabel={t("chat.scheduleSendAction", {
                    defaultValue: "Schedule send",
                  })}
                  disabled={
                    youBlockedUser || userBlockedYou || (!message && !onSend) || !canSendMessages
                  }
                >
                  <MDCIcon name="clock-outline" size={22} color="#dee4e6" />
                </TouchableOpacity>
                <TouchableHighlight
                  className={`w-12 rounded-full h-12 ${
                    message || onSend ? "bg-chatAccent" : "bg-drakGray"
                  } items-center justify-center`}
                  accessibilityLabel={t("chat.a11y.send")}
                  accessibilityRole="button"
                  disabled={
                    youBlockedUser || userBlockedYou || (!message && !onSend) || !canSendMessages
                  }
                  onPress={submitComposerMessage}
                >
                  <Icon
                    name="send"
                    size={25}
                    color="#dee4e6"
                    style={{ transform: isRTL ? [{ rotateY: "180deg" }] : [] }}
                  />
                </TouchableHighlight>
              </>
            ) : (
              <>
                <TouchableOpacity
                  className="w-12 rounded-full h-12 bg-slate-500/30 items-center justify-center mb-2"
                  onPress={openCallScheduleModal}
                  accessibilityLabel={t("chat.scheduleCallAction", {
                    defaultValue: "Schedule call",
                  })}
                  disabled={youBlockedUser || userBlockedYou || !canSendMessages}
                >
                  <MDCIcon name="phone-clock-outline" size={22} color="#dee4e6" />
                </TouchableOpacity>
                <TouchableOpacity
                  className="w-12 rounded-full h-12 bg-slate-500/30 items-center justify-center mb-2"
                  onPress={() => setStickerModalOpen(true)}
                  accessibilityLabel={t("chat.sendStickerAction", {
                    defaultValue: "Send sticker",
                  })}
                  disabled={youBlockedUser || userBlockedYou || !canSendMessages}
                >
                  <MDCIcon name="emoticon-happy-outline" size={22} color="#dee4e6" />
                </TouchableOpacity>
                <TouchableOpacity
                  className="w-12 rounded-full h-12 bg-slate-500/30 items-center justify-center mb-2"
                  onPress={openPollModal}
                  accessibilityLabel={t("chat.createPollAction", {
                    defaultValue: "Create poll",
                  })}
                  disabled={youBlockedUser || userBlockedYou || !canSendMessages}
                >
                  <MDCIcon name="poll" size={22} color="#dee4e6" />
                </TouchableOpacity>
                <TouchableOpacity
                  className="w-12 rounded-full h-12 bg-slate-500/30 items-center justify-center mb-2"
                  onPress={openGifModal}
                  accessibilityLabel={t("chat.sendGifAction", {
                    defaultValue: "Send GIF",
                  })}
                  disabled={youBlockedUser || userBlockedYou || !canSendMessages}
                >
                  <MDCIcon name="file-gif-box" size={22} color="#dee4e6" />
                </TouchableOpacity>
                <TouchableOpacity
                  className={`w-12 rounded-full h-12 bg-chatAccent items-center justify-center`}
                  // disabled={youBlockedUser || userBlockedYou}
                  onPress={async () => {
                    setPaused(false);
                    if (recording) {
                      await handleStopRecording();
                    } else {
                      await handleStartRecording();
                    }
                  }}
                >
                  {recording ? (
                    <Icon
                      name="send"
                      size={25}
                      color="#dee4e6"
                      style={{ transform: isRTL ? [{ rotateY: "180deg" }] : [] }}
                    />
                  ) : (
                    <Icon
                      name="mic"
                      size={25}
                      color="#dee4e6"
                    />
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </>
      </View>
      {showEmoji && (
        <View
          className={`h-48 overflow-scroll`}
          style={{
            height: keyboardHeight || 200,
            overflow: "scroll",
          }}
        >
          <EmojiPicker
            emojis={emojis} // emojis data source see data/emojis
            recent={recent} // store of recently used emojis
            autoFocus={true} // autofocus search input
            loading={false} // spinner for if your emoji data or recent store is async
            darkMode={isDarkColorScheme} // keep emoji sheet aligned with current theme
            perLine={7} // # of emoji's per line
            onSelect={(emoji) => {
              console.log({ emoji });
              setMessage((prev) => prev + emoji.emoji);
            }} // callback when user selects emoji - returns emoji obj
            onChangeRecent={setRecent} // callback to update recent storage - arr of emoji objs
            // backgroundColor={'#000'} // optional custom bg color
            // enabledCategories={[
            //   // optional list of enabled category keys
            //   "recent",
            //   "emotion",
            //   "emojis",
            //   "activities",
            //   "flags",
            //   "food",
            //   "places",
            //   "nature",
            // ]}
            // defaultCategory={'food'} // optional default category key
          />
        </View>
      )}
      {scheduleModalOpen && (
        <Popup
          showModal={scheduleModalOpen}
          setShowModal={setScheduleModalOpen}
          withActions={false}
          title={t("chat.scheduleSendAction", {
            defaultValue: "Schedule send",
          })}
          w="w-[90%] max-w-[420px]"
        >
          <View className="w-full py-2">
            <Text className="text-sm text-slate-600 dark:text-slate-300 mb-2">
              {t("chat.scheduleSendPickerHint", {
                defaultValue: "Choose date and time for sending this message.",
              })}
            </Text>
            <View className="flex-row items-center gap-2 mb-3">
              <TouchableOpacity
                className="px-3 py-1 rounded-full bg-slate-500/20"
                onPress={() => applySchedulePreset("in1h")}
              >
                <Text className="text-xs text-slate-700 dark:text-slate-200">
                  {t("chat.quickScheduleIn1Hour", { defaultValue: "In 1 hour" })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-3 py-1 rounded-full bg-slate-500/20"
                onPress={() => applySchedulePreset("tonight")}
              >
                <Text className="text-xs text-slate-700 dark:text-slate-200">
                  {t("chat.quickScheduleTonight", { defaultValue: "Tonight 20:00" })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-3 py-1 rounded-full bg-slate-500/20"
                onPress={() => applySchedulePreset("tomorrowMorning")}
              >
                <Text className="text-xs text-slate-700 dark:text-slate-200">
                  {t("chat.quickScheduleTomorrowMorning", {
                    defaultValue: "Tomorrow 09:00",
                  })}
                </Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center gap-2 mb-3">
              {Platform.OS === "web" ? (
                <>
                  <TextInput
                    value={scheduleDate}
                    onChangeText={setScheduleDate}
                    placeholder="YYYY-MM-DD"
                    className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
                    placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                  />
                  <TextInput
                    value={scheduleTime}
                    onChangeText={setScheduleTime}
                    placeholder="HH:mm"
                    className="w-[110px] rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
                    placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                  />
                </>
              ) : (
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-2">
                    <TouchableOpacity
                      className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2"
                      onPress={() => setShowCallNativeDatePicker(true)}
                    >
                      <Text className="text-slate-900 dark:text-slate-100">
                        {scheduleDate || "YYYY-MM-DD"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="w-[110px] rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2"
                      onPress={() => setShowCallNativeTimePicker(true)}
                    >
                      <Text className="text-slate-900 dark:text-slate-100">
                        {scheduleTime || "HH:mm"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {showNativeDatePicker && (
                    <DateTimePicker
                      mode="date"
                      minimumDate={new Date()}
                      value={
                        new Date(
                          `${scheduleDate || toDateInputValue(new Date())}T${
                            scheduleTime || "12:00"
                          }:00`
                        )
                      }
                      onChange={(_, selectedDate) => {
                        setShowNativeDatePicker(false);
                        if (!selectedDate) return;
                        setScheduleDate(toDateInputValue(selectedDate));
                      }}
                    />
                  )}
                  {showNativeTimePicker && (
                    <DateTimePicker
                      mode="time"
                      value={
                        new Date(
                          `${scheduleDate || toDateInputValue(new Date())}T${
                            scheduleTime || "12:00"
                          }:00`
                        )
                      }
                      onChange={(_, selectedDate) => {
                        setShowNativeTimePicker(false);
                        if (!selectedDate) return;
                        setScheduleTime(toTimeInputValue(selectedDate));
                      }}
                    />
                  )}
                </View>
              )}
            </View>
            <View className="flex-row justify-end items-center gap-3">
              <TouchableOpacity onPress={() => setScheduleModalOpen(false)}>
                <Text className="text-base text-slate-600 dark:text-slate-300">
                  {t("general.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-4 py-2 rounded-xl bg-chatAccent"
                onPress={scheduleComposerMessage}
              >
                <Text className="text-sm font-semibold text-slate-100">
                  {t("chat.scheduleSendAction", {
                    defaultValue: "Schedule send",
                  })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Popup>
      )}
      {callScheduleModalOpen && (
        <Popup
          showModal={callScheduleModalOpen}
          setShowModal={setCallScheduleModalOpen}
          withActions={false}
          title={t("chat.scheduleCallAction", {
            defaultValue: "Schedule call",
          })}
          w="w-[90%] max-w-[420px]"
        >
          <View className="w-full py-2">
            <Text className="text-sm text-slate-600 dark:text-slate-300 mb-2">
              {t("chat.scheduleCallPickerHint", {
                defaultValue: "Choose date, time and call type.",
              })}
            </Text>
            <View className="flex-row items-center gap-2 mb-3">
              <TouchableOpacity
                className={`px-3 py-1 rounded-full ${
                  callScheduleVideo ? "bg-chatAccent/20" : "bg-slate-500/20"
                }`}
                onPress={() => setCallScheduleVideo(true)}
              >
                <Text className="text-xs text-slate-700 dark:text-slate-200">
                  {t("call.videoCall", { defaultValue: "Video call" })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`px-3 py-1 rounded-full ${
                  !callScheduleVideo ? "bg-chatAccent/20" : "bg-slate-500/20"
                }`}
                onPress={() => setCallScheduleVideo(false)}
              >
                <Text className="text-xs text-slate-700 dark:text-slate-200">
                  {t("call.audioCall", { defaultValue: "Audio call" })}
                </Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center gap-2 mb-3">
              {Platform.OS === "web" ? (
                <>
                  <TextInput
                    value={callScheduleDate}
                    onChangeText={setCallScheduleDate}
                    placeholder="YYYY-MM-DD"
                    className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
                    placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                  />
                  <TextInput
                    value={callScheduleTime}
                    onChangeText={setCallScheduleTime}
                    placeholder="HH:mm"
                    className="w-[110px] rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
                    placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                  />
                </>
              ) : (
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-2">
                    <TouchableOpacity
                      className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2"
                      onPress={() => setShowNativeDatePicker(true)}
                    >
                      <Text className="text-slate-900 dark:text-slate-100">
                        {callScheduleDate || "YYYY-MM-DD"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="w-[110px] rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2"
                      onPress={() => setShowNativeTimePicker(true)}
                    >
                      <Text className="text-slate-900 dark:text-slate-100">
                        {callScheduleTime || "HH:mm"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {showCallNativeDatePicker && (
                    <DateTimePicker
                      mode="date"
                      minimumDate={new Date()}
                      value={
                        new Date(
                          `${callScheduleDate || toDateInputValue(new Date())}T${
                            callScheduleTime || "12:00"
                          }:00`
                        )
                      }
                      onChange={(_, selectedDate) => {
                        setShowCallNativeDatePicker(false);
                        if (!selectedDate) return;
                        setCallScheduleDate(toDateInputValue(selectedDate));
                      }}
                    />
                  )}
                  {showCallNativeTimePicker && (
                    <DateTimePicker
                      mode="time"
                      value={
                        new Date(
                          `${callScheduleDate || toDateInputValue(new Date())}T${
                            callScheduleTime || "12:00"
                          }:00`
                        )
                      }
                      onChange={(_, selectedDate) => {
                        setShowCallNativeTimePicker(false);
                        if (!selectedDate) return;
                        setCallScheduleTime(toTimeInputValue(selectedDate));
                      }}
                    />
                  )}
                </View>
              )}
            </View>
            <View className="flex-row justify-end items-center gap-3">
              <TouchableOpacity onPress={() => setCallScheduleModalOpen(false)}>
                <Text className="text-base text-slate-600 dark:text-slate-300">
                  {t("general.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-4 py-2 rounded-xl bg-chatAccent"
                onPress={scheduleCallReminder}
              >
                <Text className="text-sm font-semibold text-slate-100">
                  {t("chat.scheduleCallAction", {
                    defaultValue: "Schedule call",
                  })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Popup>
      )}
      {gifModalOpen && (
        <Popup
          showModal={gifModalOpen}
          setShowModal={setGifModalOpen}
          withActions={false}
          title={t("chat.sendGifAction", {
            defaultValue: "Send GIF",
          })}
          w="w-[90%] max-w-[420px]"
        >
          <View className="w-full py-2">
            <Text className="text-sm text-slate-600 dark:text-slate-300 mb-2">
              {t("chat.gifModalHint", {
                defaultValue: "Paste a GIF link (http/https).",
              })}
            </Text>
            <TextInput
              value={gifUrl}
              onChangeText={setGifUrl}
              placeholder={t("chat.gifUrlPlaceholder", {
                defaultValue: "https://...",
              })}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
              placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View className="flex-row justify-end items-center gap-3 mt-3">
              <TouchableOpacity onPress={() => setGifModalOpen(false)}>
                <Text className="text-base text-slate-600 dark:text-slate-300">
                  {t("general.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-4 py-2 rounded-xl bg-chatAccent"
                onPress={submitGifMessage}
                disabled={!String(gifUrl || "").trim()}
              >
                <Text className="text-sm font-semibold text-slate-100">
                  {t("general.send", { defaultValue: "Send" })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Popup>
      )}
      {pollModalOpen && (
        <Popup
          showModal={pollModalOpen}
          setShowModal={setPollModalOpen}
          withActions={false}
          title={t("chat.createPollAction", {
            defaultValue: "Create poll",
          })}
          w="w-[90%] max-w-[460px]"
        >
          <View className="w-full py-2">
            <Text className="text-sm text-slate-600 dark:text-slate-300 mb-2">
              {t("chat.pollModalHint", {
                defaultValue: "Ask a question and add options.",
              })}
            </Text>
            <TextInput
              value={pollQuestion}
              onChangeText={setPollQuestion}
              placeholder={t("chat.pollQuestionPlaceholder", {
                defaultValue: "Question",
              })}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 mb-2"
              placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
            />
            <TextInput
              value={pollOptionA}
              onChangeText={setPollOptionA}
              placeholder={t("chat.pollOptionPlaceholder", {
                defaultValue: "Option {{index}}",
                index: 1,
              })}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 mb-2"
              placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
            />
            <TextInput
              value={pollOptionB}
              onChangeText={setPollOptionB}
              placeholder={t("chat.pollOptionPlaceholder", {
                defaultValue: "Option {{index}}",
                index: 2,
              })}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 mb-2"
              placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
            />
            <TextInput
              value={pollOptionC}
              onChangeText={setPollOptionC}
              placeholder={t("chat.pollOptionPlaceholder", {
                defaultValue: "Option {{index}}",
                index: 3,
              })}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 mb-2"
              placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
            />
            <TouchableOpacity
              className="flex-row items-center mb-3"
              onPress={() => setPollAllowMultiple((prev) => !prev)}
            >
              <View
                className={`w-5 h-5 rounded border mr-2 items-center justify-center ${
                  pollAllowMultiple
                    ? "bg-chatAccent border-chatAccent"
                    : "border-slate-400"
                }`}
              >
                {pollAllowMultiple ? (
                  <Icon name="checkmark" size={14} color="#fff" />
                ) : null}
              </View>
              <Text className="text-sm text-slate-600 dark:text-slate-300">
                {t("chat.pollAllowMultiple", {
                  defaultValue: "Allow multiple selections",
                })}
              </Text>
            </TouchableOpacity>
            <View className="flex-row justify-end items-center gap-3 mt-1">
              <TouchableOpacity onPress={() => setPollModalOpen(false)}>
                <Text className="text-base text-slate-600 dark:text-slate-300">
                  {t("general.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-4 py-2 rounded-xl bg-chatAccent"
                onPress={submitPollMessage}
              >
                <Text className="text-sm font-semibold text-slate-100">
                  {t("chat.createPollAction", {
                    defaultValue: "Create poll",
                  })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Popup>
      )}
      {stickerModalOpen && (
        <Popup
          showModal={stickerModalOpen}
          setShowModal={setStickerModalOpen}
          withActions={false}
          title={t("chat.sendStickerAction", {
            defaultValue: "Send sticker",
          })}
          w="w-[90%] max-w-[460px]"
        >
          <View className="w-full py-2">
            <Text className="text-sm text-slate-600 dark:text-slate-300 mb-2">
              {t("chat.stickerModalHint", {
                defaultValue: "Pick a sticker to send.",
              })}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row items-center gap-2 pr-2">
                {stickerPresets.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    className="rounded-xl border border-slate-400/30 bg-slate-500/10 p-2"
                    onPress={() => submitStickerMessage(item)}
                  >
                    <Image
                      source={{ uri: item.url }}
                      style={{ width: 92, height: 92, resizeMode: "contain" }}
                    />
                    <Text className="text-center text-xs text-slate-500 dark:text-slate-300 mt-1">
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View className="flex-row justify-end items-center gap-3 mt-3">
              <TouchableOpacity onPress={() => setStickerModalOpen(false)}>
                <Text className="text-base text-slate-600 dark:text-slate-300">
                  {t("general.cancel")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Popup>
      )}
    </>
  );
};

export default ChatInput;
