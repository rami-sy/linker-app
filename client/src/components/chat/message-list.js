import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { useSelector, useDispatch } from "react-redux";
import MessageItem from "./message-item";
import { SocketContext } from "../../contexts/socket.context";
import useSelectedRoom from "../../hooks/use-selected-room";
import { useColorScheme } from "../../../lib/useColorScheme";
import { useTranslation } from "react-i18next";
import { addAlert } from "../../redux/alertSlice";
import { findMessageIndexByKey } from "../../utils/chat-flow-helpers";
import { getEffectiveMessageTimestampMs } from "../../utils/effectiveMessageTimestamp";

/** Normalize id from ObjectId, populated object {_id}, or string for comparisons. */
const resolveId = (v) => {
  if (v == null) return "";
  if (typeof v === "object" && v !== null && v._id != null) return String(v._id);
  return String(v);
};

/** Get sender id from message (user, senderSnapshot.userId, senderSnapshot._id). */
const resolveMessageSenderId = (msg) => {
  if (!msg) return "";
  const candidates = [
    msg?.user,
    msg?.senderSnapshot?.userId,
    msg?.senderSnapshot?._id,
    msg?.sender?._id,
  ];
  for (const c of candidates) {
    const id = resolveId(c);
    if (id) return id;
  }
  return "";
};

const formatDate = (date, t, locale) => {
  const today = new Date();
  const messageDate = new Date(date);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };

  if (messageDate.toDateString() === today.toDateString()) {
    return t("general.today", { defaultValue: "Today" });
  } else if (messageDate.toDateString() === yesterday.toDateString()) {
    return t("general.yesterday", { defaultValue: "Yesterday" });
  } else if (today - messageDate < 7 * 24 * 60 * 60 * 1000) {
    return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(
      messageDate
    );
  } else {
    return new Intl.DateTimeFormat(locale, options).format(messageDate);
  }
};
const isNewDay = (currentMessage, nextMessage) => {
  if (!nextMessage) return true;
  const currentDate = getEffectiveMessageTimestampMs(currentMessage);
  const nextDate = getEffectiveMessageTimestampMs(nextMessage);
  return (
    new Date(currentDate).setHours(0, 0, 0, 0) !==
    new Date(nextDate).setHours(0, 0, 0, 0)
  );
};
const renderItem = ({
  messages, // ✅ Use passed messages array
  item,
  index,
  selectedMessage,
  setSelectedMessage,
  selectedMessages,
  setSelectedMessages,
  msgToReply,
  setMsgToReply,
  setShowImages,
  isDarkColorScheme,
  onJumpToMessage,
  unreadDividerIndex,
  showUnreadDivider,
  unreadLabel,
  onOpenThread,
  t,
  locale,
}) => {
  const arr = messages; // ✅ Use filtered messages array
  const nextMessage = arr[index + 1];

  const isLastMessageFromUser =
    !arr[index + 1] || arr[index + 1].user !== item.user;
  const isFirstMessageFromUser =
    index === 0 || arr[index - 1].user !== item.user;
  const showDate = isNewDay(item, nextMessage);
  const shouldRenderUnreadDivider =
    showUnreadDivider &&
    unreadDividerIndex > 0 &&
    index === unreadDividerIndex &&
    index < arr.length;

  return (
    <View className="px-2">
      {showDate && (
        <View className={`flex-row items-center justify-center my-3`}>
          <View
            className="flex-row items-center justify-center px-3 py-1.5 bg-chatSurfaceLight dark:bg-chatSurfaceDark rounded-full border border-slate-200 dark:border-slate-700"
          >
            <Text
              className="text-xs font-medium text-slate-500 dark:text-slate-300"
            >
              {formatDate(
                getEffectiveMessageTimestampMs(item) || item?.createdAt,
                t,
                locale
              )}
            </Text>
          </View>
        </View>
      )}
      <MessageItem
        message={item}
        isFirstMessageFromUser={isFirstMessageFromUser}
        isLastMessageFromUser={isLastMessageFromUser}
        selectedMessage={selectedMessage}
        setSelectedMessage={setSelectedMessage}
        selectedMessages={selectedMessages}
        setSelectedMessages={setSelectedMessages}
        msgToReply={msgToReply}
        setMsgToReply={setMsgToReply}
        setShowImages={setShowImages}
        onJumpToMessage={onJumpToMessage}
        onOpenThread={onOpenThread}
      />
      {shouldRenderUnreadDivider && (
        <View className="flex-row items-center my-3 px-1">
          <View className="flex-1 h-px bg-slate-300 dark:bg-slate-600" />
          <Text className="mx-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {unreadLabel}
          </Text>
          <View className="flex-1 h-px bg-slate-300 dark:bg-slate-600" />
        </View>
      )}
    </View>
  );
};
const MessageList = ({
  scrollViewRef,
  setSelectedMessage,
  selectedMessage,
  selectedMessages,
  setSelectedMessages,
  msgToReply,
  setMsgToReply,
  setShowImages,
  onLatestPositionChange,
  onJumpToMessageReady,
  showUnreadDivider,
  onOpenThread,
}) => {
  const { roomId } = useSelector((state) => state.chats);
  const { user } = useSelector((state) => state.users);
  const room = useSelectedRoom();
  const { socket, retryAllFailedMessages } = useContext(SocketContext);
  const { isDarkColorScheme } = useColorScheme();
  const dispatch = useDispatch();
  const { t, i18n } = useTranslation();
  const [showFailedOnly, setShowFailedOnly] = useState(false);
  const [isRetryingAllFailed, setIsRetryingAllFailed] = useState(false);
  const [retryProgress, setRetryProgress] = useState({ current: 0, total: 0 });
  const [retrySummary, setRetrySummary] = useState(null);

  const currentPage = room?.currentPage;
  const hasMore = room?.hasMore;
  const isLoadingMore = room?.isLoadingMore;

  const keyExtractor = useCallback(
    (item, index) => item?.uuId || item?._id || `message-${index}`,
    []
  );

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoadingMore && socket) {
      socket.emit("getMessages", {
        room: roomId,
        page: currentPage + 1,
        override: false,
      });
    }
  }, [hasMore, isLoadingMore, roomId, currentPage, socket]);

  const allMessages = useMemo(() => {
    return Object.values(room?.messages || {})
      .filter((msg) => !msg.call || msg.type === "call_event") // keep server call-event rows
      .sort(
        (a, b) =>
          getEffectiveMessageTimestampMs(b) - getEffectiveMessageTimestampMs(a)
      ); // Newest first by effective dispatch time
  }, [room?.messages]);

  const failedMessagesCount = useMemo(() => {
    const myId = resolveId(user?._id);
    return allMessages.filter(
      (msg) =>
        resolveMessageSenderId(msg) === myId &&
        String(msg?.status || "") === "failed"
    ).length;
  }, [allMessages, user?._id]);

  // ✅ Filter and sort messages
  const filteredMessages = useMemo(() => {
    if (!showFailedOnly) return allMessages;
    const myId = resolveId(user?._id);
    return allMessages.filter(
      (msg) =>
        resolveMessageSenderId(msg) === myId &&
        String(msg?.status || "") === "failed"
    );
  }, [allMessages, showFailedOnly, user?._id]);

  const unreadDividerIndex = useMemo(() => {
    if (!showUnreadDivider || showFailedOnly || !filteredMessages.length) return -1;
    const uid = resolveId(user?._id);
    let unreadPrefixCount = 0;
    for (let i = 0; i < filteredMessages.length; i++) {
      const msg = filteredMessages[i];
      const msgUserId = resolveMessageSenderId(msg);
      const seenByCurrentUser = (msg?.seenBy || []).some(
        (s) => resolveId(s) === uid
      );
      const isOwnMessage = msgUserId === uid;
      const isUnread = !isOwnMessage && !seenByCurrentUser;
      if (!isUnread) break;
      unreadPrefixCount += 1;
    }
    return unreadPrefixCount > 0 ? unreadPrefixCount : -1;
  }, [filteredMessages, showUnreadDivider, showFailedOnly, user?._id]);

  const jumpToMessageKey = useCallback(
    (key) => {
      const idx = findMessageIndexByKey(filteredMessages, key);
      if (idx === -1) {
        dispatch(
          addAlert({
            type: "warning",
            message:
              t("chat.quotedNotLoaded") ||
              "Original message is not loaded. Scroll up to load older messages.",
          })
        );
        return;
      }
      requestAnimationFrame(() => {
        scrollViewRef?.current?.scrollToIndex({
          index: idx,
          animated: true,
          viewPosition: 0.5,
        });
      });
    },
    [dispatch, filteredMessages, scrollViewRef, t]
  );

  useEffect(() => {
    onJumpToMessageReady?.(jumpToMessageKey);
  }, [jumpToMessageKey, onJumpToMessageReady]);

  const unreadLabel =
    t("chat.newMessagesDivider") || "New messages";

  // هنا توضع دالة memoizedRenderItem بعد المتغيرات الأخرى
  const memoizedRenderItem = useMemo(
    () =>
      ({ item, index }) =>
        renderItem({
          messages: filteredMessages, // ✅ Pass filtered messages
          item,
          index,
          selectedMessage,
          setSelectedMessage,
          selectedMessages,
          setSelectedMessages,
          msgToReply,
          setMsgToReply,
          setShowImages,
          isDarkColorScheme,
          onJumpToMessage: jumpToMessageKey,
          unreadDividerIndex,
          showUnreadDivider,
          unreadLabel,
          onOpenThread,
          t,
          locale: i18n?.language,
        }),
    [
      filteredMessages,
      setSelectedMessage,
      selectedMessage,
      selectedMessages,
      setSelectedMessages,
      msgToReply,
      setMsgToReply,
      setShowImages,
      isDarkColorScheme,
      jumpToMessageKey,
      unreadDividerIndex,
      showUnreadDivider,
      unreadLabel,
      onOpenThread,
      t,
      i18n?.language,
    ]
  );

  const handleScroll = useCallback(
    (event) => {
      const offsetY = event?.nativeEvent?.contentOffset?.y ?? 0;
      const isNearLatest = offsetY <= 80;
      onLatestPositionChange?.(isNearLatest);
    },
    [onLatestPositionChange]
  );

  const handleRetryAllFailedInline = useCallback(async () => {
    if (!room?._id || !retryAllFailedMessages || isRetryingAllFailed) return;
    setIsRetryingAllFailed(true);
    setRetryProgress({ current: 0, total: 0 });
    try {
      const result = await retryAllFailedMessages({
        roomId: room._id,
        onProgress: ({ current, total }) => {
          setRetryProgress({
            current: Number(current || 0),
            total: Number(total || 0),
          });
        },
      });
      if (result?.type !== "success") {
        dispatch(
          addAlert({
            type: "error",
            message: result?.message || t("chat.retryAllFailedError", {
              defaultValue: "Failed to retry messages.",
            }),
          })
        );
        return;
      }
      if (result.retried === 0) {
        dispatch(
          addAlert({
            type: "info",
            message: t("chat.retryAllFailedNone", {
              defaultValue: "No failed messages to retry.",
            }),
          })
        );
        return;
      }
      setRetrySummary({
        retried: Number(result.retried || 0),
        succeeded: Number(result.succeeded || 0),
        failed: Number(result.failed || 0),
      });
      dispatch(
        addAlert({
          type: "success",
          message: t("chat.retryAllFailedSuccess", {
            defaultValue: "Retried {{count}} failed message(s).",
            count: result.retried,
          }),
        })
      );
    } finally {
      setIsRetryingAllFailed(false);
      setRetryProgress({ current: 0, total: 0 });
    }
  }, [dispatch, isRetryingAllFailed, retryAllFailedMessages, room?._id, t]);

  useEffect(() => {
    if (!retrySummary) return;
    const timer = setTimeout(() => {
      setRetrySummary(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [retrySummary]);

  return (
    <View className="flex-1">
      {failedMessagesCount > 0 && (
        <View className="px-3 pt-2 flex-row justify-end items-center gap-2">
          {retrySummary && !isRetryingAllFailed && (
            <View className="px-3 py-1 rounded-full bg-emerald-500/15 flex-row items-center gap-2">
              <Text className="text-xs text-emerald-600 dark:text-emerald-300">
                {t("chat.retryAllSummaryInline", {
                  defaultValue: "Done: {{succeeded}} ok, {{failed}} failed",
                  succeeded: retrySummary.succeeded,
                  failed: retrySummary.failed,
                })}
              </Text>
              {retrySummary.failed > 0 && (
                <TouchableOpacity
                  className="px-2 py-0.5 rounded-full bg-red-500/20"
                  onPress={() => setShowFailedOnly(true)}
                >
                  <Text className="text-[11px] text-red-500">
                    {t("chat.showFailedNow", {
                      defaultValue: "Show failed now",
                    })}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <TouchableOpacity
            className={`px-3 py-1 rounded-full bg-red-500/20 ${
              isRetryingAllFailed ? "opacity-60" : ""
            }`}
            onPress={handleRetryAllFailedInline}
            disabled={isRetryingAllFailed}
          >
            {isRetryingAllFailed ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#ef4444" />
                <Text className="text-xs text-red-500">
                  {retryProgress.total > 0
                    ? t("chat.retryingAllFailedProgress", {
                        defaultValue: "Retrying {{current}}/{{total}}...",
                        current: retryProgress.current,
                        total: retryProgress.total,
                      })
                    : t("chat.retryingAllFailed", {
                        defaultValue: "Retrying...",
                      })}
                </Text>
              </View>
            ) : (
              <Text className="text-xs text-red-500">
                {t("chat.retryAllFailed", { defaultValue: "Retry all failed" })}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            className="px-3 py-1 rounded-full bg-slate-500/20"
            onPress={() => setShowFailedOnly((prev) => !prev)}
          >
            <Text className="text-xs text-slate-700 dark:text-slate-200">
              {showFailedOnly
                ? t("chat.failedOnlyToggleOn", { defaultValue: "Show all messages" })
                : t("chat.failedOnlyToggleOff", {
                    defaultValue: "Failed only ({{count}})",
                    count: failedMessagesCount,
                  })}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        ref={scrollViewRef}
        data={filteredMessages} // ✅ Use filtered messages
        renderItem={memoizedRenderItem}
        keyExtractor={keyExtractor}
        accessibilityRole="list"
        accessibilityLabel={t("chat.a11y.conversationMessages")}
        contentContainerStyle={{
          paddingTop: 16,
          // paddingLeft: 8,
          // paddingRight: 8,
          paddingBottom: 50,
        }}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={1} // Add this line
        inverted
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={50}
        windowSize={10}
        initialNumToRender={25}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onScrollToIndexFailed={(info) => {
          const target = Math.min(info.index, Math.max(0, filteredMessages.length - 1));
          setTimeout(() => {
            scrollViewRef?.current?.scrollToIndex({
              index: target,
              animated: true,
              viewPosition: 0.5,
            });
          }, 350);
        }}
      />
    </View>
  );
};

export default React.memo(MessageList);
