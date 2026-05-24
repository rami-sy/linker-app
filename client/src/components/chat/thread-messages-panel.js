import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import FeIcon from "@expo/vector-icons/Feather";
import { useTranslation } from "react-i18next";
import MessageItem from "./message-item";
import useSelectedRoom from "../../hooks/use-selected-room";
import { useColorScheme } from "../../../lib/useColorScheme";
import { useDispatch } from "react-redux";
import { addAlert } from "../../redux/alertSlice";
import {
  clearThreadFetchError,
  clearThreadPagination,
} from "../../redux/chatSlice";
import { SocketContext } from "../../contexts/socket.context";

const keyExtractor = (item, index) =>
  item?.uuId || item?._id || `thread-msg-${index}`;

/**
 * Full-height thread view (replaces main MessageList). Footer stays below in parent.
 */
export default function ThreadMessagesPanel({
  rootMessage,
  onClose,
  setSelectedMessage,
  selectedMessage,
  selectedMessages,
  setSelectedMessages,
  msgToReply,
  setMsgToReply,
  setShowImages,
  onJumpToMessageKey,
  onJumpToMessageReady,
}) {
  const { t } = useTranslation();
  const room = useSelectedRoom();
  const { socket } = useContext(SocketContext);
  const { isDarkColorScheme } = useColorScheme();
  const dispatch = useDispatch();
  const listRef = useRef(null);
  const [loadingThread, setLoadingThread] = useState(true);
  const [loadingMoreThread, setLoadingMoreThread] = useState(false);

  const rootId = rootMessage
    ? String(rootMessage.threadRoot || rootMessage._id)
    : null;

  const tp = room?.threadPagination;
  const threadPage =
    tp?.root === rootId ? tp.page : 1;
  const threadHasMore =
    tp?.root === rootId ? tp.hasMore : false;

  useEffect(() => {
    if (!room?._id || !rootId) return;
    dispatch(clearThreadPagination({ room: room._id }));
  }, [dispatch, room?._id, rootId]);

  useEffect(() => {
    if (!socket || !room?._id || !rootId) return;
    setLoadingThread(true);
    socket.emit("getThreadMessages", {
      room: room._id,
      threadRoot: rootId,
      page: 1,
      limit: 30,
    });
  }, [socket, room?._id, rootId]);

  useEffect(() => {
    if (room?.threadPagination?.root === rootId) {
      setLoadingThread(false);
      setLoadingMoreThread(false);
    }
  }, [room?.threadPagination, rootId]);

  useEffect(() => {
    const err = room?.threadFetchError;
    if (!err) return;
    if (err.root != null && err.root !== rootId) return;
    setLoadingThread(false);
    setLoadingMoreThread(false);
    dispatch(
      addAlert({
        type: "error",
        message:
          err.message ||
          t("chat.threadLoadFailed") ||
          "Could not load this thread.",
      })
    );
    if (room?._id) {
      dispatch(clearThreadFetchError({ room: room._id }));
    }
  }, [room?.threadFetchError, room?._id, rootId, dispatch, t]);

  const handleLoadMoreThread = useCallback(() => {
    if (
      !socket ||
      !room?._id ||
      !rootId ||
      !threadHasMore ||
      loadingMoreThread ||
      loadingThread
    ) {
      return;
    }
    setLoadingMoreThread(true);
    socket.emit("getThreadMessages", {
      room: room._id,
      threadRoot: rootId,
      page: threadPage + 1,
      limit: 30,
    });
  }, [
    socket,
    room?._id,
    rootId,
    threadHasMore,
    loadingMoreThread,
    loadingThread,
    threadPage,
  ]);

  const handleClose = useCallback(() => {
    if (room?._id) {
      dispatch(clearThreadPagination({ room: room._id }));
    }
    onClose?.();
  }, [dispatch, onClose, room?._id]);

  const threadMessages = useMemo(() => {
    if (!rootId || !room?.messages) return [];
    return Object.values(room.messages)
      .filter((m) => !m.call)
      .filter((m) => {
        const id = String(m._id);
        const tr = m.threadRoot ? String(m.threadRoot) : null;
        return id === rootId || tr === rootId;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [room?.messages, rootId]);

  const jumpToMessage = useCallback(
    (key) => {
      if (onJumpToMessageKey) {
        onJumpToMessageKey(key);
        return;
      }
      if (key == null || key === "") return;
      const id = String(key);
      const idx = threadMessages.findIndex(
        (m) =>
          (m?.uuId != null && String(m.uuId) === id) ||
          (m?._id != null && String(m._id) === id)
      );
      if (idx === -1) {
        dispatch(
          addAlert({
            type: "warning",
            message:
              t("chat.quotedNotLoaded") ||
              "Original message is not loaded.",
          })
        );
        return;
      }
      requestAnimationFrame(() => {
        listRef?.current?.scrollToIndex({
          index: idx,
          animated: true,
          viewPosition: 0.5,
        });
      });
    },
    [dispatch, onJumpToMessageKey, t, threadMessages]
  );

  useEffect(() => {
    onJumpToMessageReady?.(jumpToMessage);
  }, [jumpToMessage, onJumpToMessageReady]);

  const renderItem = useCallback(
    ({ item, index }) => {
      const arr = threadMessages;
      const isLastMessageFromUser =
        !arr[index + 1] || arr[index + 1].user !== item.user;
      const isFirstMessageFromUser =
        index === 0 || arr[index - 1].user !== item.user;
      return (
        <View className="px-2">
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
            onJumpToMessage={jumpToMessage}
            hideThreadControls
          />
        </View>
      );
    },
    [
      threadMessages,
      selectedMessage,
      setSelectedMessage,
      selectedMessages,
      setSelectedMessages,
      msgToReply,
      setMsgToReply,
      setShowImages,
      jumpToMessage,
    ]
  );

  if (!rootMessage) return null;

  return (
    <View className="flex-1 w-full">
      <View
        className={`flex-row items-center justify-between px-3 py-2 border-b ${
          isDarkColorScheme
            ? "border-slate-700 bg-[#12141b]"
            : "border-slate-200 bg-[#dee4e6]"
        }`}
      >
        <TouchableOpacity
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={t("general.cancel")}
          className="p-2"
        >
          <FeIcon
            name="arrow-left"
            size={22}
            color={isDarkColorScheme ? "#e2e8f0" : "#0f172a"}
          />
        </TouchableOpacity>
        <Text
          className={`text-base font-semibold flex-1 text-center ${
            isDarkColorScheme ? "text-slate-100" : "text-slate-900"
          }`}
          numberOfLines={1}
        >
          {t("chat.threadTitle")}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={threadMessages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        inverted
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 8, flexGrow: 1 }}
        ListEmptyComponent={
          loadingThread ? (
            <View className="flex-1 items-center justify-center py-16">
              <ActivityIndicator
                size="small"
                color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
              />
            </View>
          ) : null
        }
        onEndReached={handleLoadMoreThread}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMoreThread && threadMessages.length > 0 ? (
            <View className="py-3 items-center">
              <ActivityIndicator
                size="small"
                color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
              />
            </View>
          ) : null
        }
        onScrollToIndexFailed={(info) => {
          const target = Math.min(
            info.index,
            Math.max(0, threadMessages.length - 1)
          );
          setTimeout(() => {
            listRef?.current?.scrollToIndex({
              index: target,
              animated: true,
              viewPosition: 0.5,
            });
          }, 350);
        }}
      />
    </View>
  );
}
