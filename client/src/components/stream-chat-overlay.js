/**
 * Stream Chat Overlay Component
 * عرض الرسائل المتحركة فوق البث المباشر
 * مشابه لـ Twitch, YouTube Live, Facebook Live
 */

import React, { useEffect, useRef, useState, useMemo, useContext } from "react";
import { View, Text, Animated, Platform } from "react-native";
import { useSelector, useDispatch } from "react-redux";
import UserImage from "./user-image";
import getFullName from "../utils/getFullName";
import useSelectedRoom from "../hooks/use-selected-room";
import { SocketContext } from "../contexts/socket.context";
import { MediasoupContext } from "../contexts/mediasoup.context"; // ✅ Import MediasoupContext
import { addMessage } from "../redux/chatSlice";
import useMediasoup from "../hooks/useMediasoup"; // ✅ Import useMediasoup
import { useColorScheme } from "~/lib/useColorScheme";

const MAX_VISIBLE_MESSAGES = 6;
const MESSAGE_DISPLAY_DURATION = 15000; // ✅ Increased to 15 seconds
const ANIMATION_DURATION = 300;

const StreamChatMessage = ({ message, index, isDarkColorScheme }) => {
  const slideAnim = useRef(new Animated.Value(50)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start();

    const hideTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsVisible(false);
      });
    }, MESSAGE_DISPLAY_DURATION);

    return () => clearTimeout(hideTimer);
  }, [slideAnim, opacityAnim]);

  if (!isVisible) return null;
  if (!message) return null;

  // ✅ Try to get sender from multiple sources - prioritize senderSnapshot (same logic as message-item.js)
  // senderSnapshot contains complete user data and is independent of room membership
  const sender = message.senderSnapshot || message.sender || {};
  
  // ✅ Also check content.user for live stream comments (fallback)
  let parsedContent = null;
  if (message.content) {
    try {
      parsedContent = typeof message.content === "string" 
        ? JSON.parse(message.content) 
        : message.content;
    } catch (e) {
      // Ignore parse errors
    }
  }
  const contentUser = parsedContent?.user || parsedContent?.kind === "liveStreamComment" ? parsedContent?.user : null;
  
  // ✅ Prioritize senderSnapshot (which should have colors), then contentUser, then sender
  const finalSender = message.senderSnapshot || contentUser || sender;

  // ✅ Extract name from all possible fields (prioritize firstName, then userName)
  const senderName =
    finalSender.firstName ||
    finalSender.userName ||
    sender.firstName ||
    sender.userName ||
    sender.name ||
    sender.username ||
    "User";

  const messageText = message.text || message.content || "";
  const displayText =
    messageText.length > 100
      ? messageText.substring(0, 100) + "..."
      : messageText;

  return (
    <Animated.View
      style={{
        transform: [{ translateY: slideAnim }],
        opacity: opacityAnim,
      }}
      className="mb-2"
    >
      <View
        className={`flex-row items-start px-3 py-2 rounded-xl ${
          isDarkColorScheme
            ? "bg-gray-900/80 backdrop-blur-md"
            : "bg-gray-50/90 backdrop-blur-md"
        }`}
        style={{
          maxWidth: Platform.OS === "web" ? "400px" : "90%",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDarkColorScheme ? 0.3 : 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <UserImage
          user={finalSender} // ✅ Use finalSender which prioritizes senderSnapshot
          size="h-6 w-6"
          border="border-0"
          rounded="rounded-full"
          showStatus={false}
          text="text-xs"
        />

        <View className="flex-1 ml-2">
          <View className="flex-row items-center flex-wrap">
            <Text
              className={`font-semibold text-sm mr-1 ${
                isDarkColorScheme ? "text-white" : "text-gray-900"
              }`}
              numberOfLines={1}
            >
              {senderName}
            </Text>
            <Text 
              className={`text-sm ${
                isDarkColorScheme ? "text-white" : "text-gray-800"
              }`} 
              style={{ flexShrink: 1 }}
            >
              {displayText}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const StreamChatOverlay = ({ roomId, isViewer = false }) => {
  const { isDarkColorScheme } = useColorScheme();
  const room = useSelectedRoom(roomId);
  const { roomId: selectedRoomId } = useSelector((state) => state.chats);
  const { user: currentUser } = useSelector((state) => state.users);
  const [visibleMessages, setVisibleMessages] = useState([]);
  const [localMessages, setLocalMessages] = useState([]); // ✅ Local state for stream messages (viewers)
  const { socket } = useContext(SocketContext);
  const { callId: contextCallId } = useContext(MediasoupContext); // ✅ Get callId from MediasoupContext as fallback
  const dispatch = useDispatch();
  const { activeCallId } = useMediasoup(); // ✅ Get activeCallId
  
  // ✅ Use activeCallId or contextCallId as fallback
  const currentCallId = activeCallId || contextCallId;

  // ✅ Check if user is a room member
  const isRoomMember = useMemo(() => {
    if (!room || !currentUser) return false;
    return room.members?.some(
      (member) => member?._id?.toString() === currentUser._id?.toString() ||
                  member?.toString() === currentUser._id?.toString()
    ) || false;
  }, [room, currentUser]);

  // ✅ Join chat and listen for messages when component mounts
  useEffect(() => {
    if (!socket || !roomId) return;

    socket.emit("joinChat", { room: roomId });

    const handleReceiveMessage = ({ message, room: msgRoom, user: sender }) => {
      if (msgRoom !== roomId) return;

      // ✅ Check if this is a stream message
      const isStreamMessage = !!message.call || !!message.callId || !!message.isLiveComment;
      // Normal chat messages are handled globally in SocketContext (list unread + open chat)
      if (!isStreamMessage) return;

      // ✅ Use senderSnapshot if available (contains full user object)
      const fullSender = message.senderSnapshot || sender || message.sender;

      // ✅ If viewer is not a room member and this is a stream message, store locally only
      // This prevents creating a new room in Redux for viewers
      if (isViewer && !isRoomMember && isStreamMessage) {
        // ✅ Store in local state only (won't create room in Redux)
        setLocalMessages((prev) => {
          const messageKey = message.uuId || message._id;
          if (!messageKey) return prev;
          
          // Check if message already exists
          const exists = prev.some((m) => (m.uuId || m._id) === messageKey);
          if (exists) return prev;
          
          return [
            ...prev,
            {
              ...message,
              sender: fullSender,
              status: "sent",
            },
          ];
        });
        return; // ✅ Don't add to Redux
      }

      // ✅ For members or non-stream messages, add to Redux as usual
      dispatch(
        addMessage({
          ...message,
          sender: fullSender, // ✅ Use senderSnapshot which has full user data
          status: "sent",
          room: msgRoom,
        })
      );
    };

    socket.on("receiveMessage", handleReceiveMessage);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
    };
  }, [socket, roomId, dispatch, isViewer, isRoomMember]);


  const messages = useMemo(() => {
    // ✅ If viewer is not a room member, use local messages only
    if (isViewer && !isRoomMember) {
      return localMessages
        .filter((msg) => {
          if (!msg) return false;
          if (msg.deletedForAll) return false;
          if (msg.type === "system") return false;

          // ✅ Filter by callId: Only show messages for THIS stream
          if (currentCallId && msg.call !== currentCallId && msg.callId !== currentCallId) return false;

          return true;
        })
        .sort((a, b) => {
          const timeA = new Date(a?.createdAt || 0).getTime();
          const timeB = new Date(b?.createdAt || 0).getTime();
          return timeA - timeB; // ✅ Changed: oldest first, newest at bottom
        });
    }

    // ✅ For members or if room exists, use Redux messages
    if (!room?.messages) return [];
    // ✅ If no active call ID, don't show any messages to prevent leakage (unless we're in a live stream)
    if (!currentCallId && !room?.liveStreamSettings?.isLive) return [];

    const messagesArray = Object.values(room.messages)
      .filter((msg) => {
        if (!msg) return false;
        if (msg.deletedForAll) return false;
        if (msg.type === "system") return false;

        // ✅ Filter by callId: Only show messages for THIS stream
        // Check both msg.call and msg.callId for compatibility
        if (currentCallId) {
          const msgCallId = msg.call?.toString() || msg.callId?.toString();
          const currentCallIdStr = currentCallId.toString();
          if (msgCallId !== currentCallIdStr) return false;
        } else if (room?.liveStreamSettings?.isLive) {
          // ✅ If we're in a live stream but no callId, show all stream messages
          const isStreamMsg = !!msg.call || !!msg.callId || !!msg.isLiveComment;
          if (!isStreamMsg) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a?.createdAt || 0).getTime();
        const timeB = new Date(b?.createdAt || 0).getTime();
        return timeA - timeB; // ✅ Changed: oldest first, newest at bottom
      });

    return messagesArray;
  }, [room?.messages, currentCallId, activeCallId, contextCallId, isViewer, isRoomMember, localMessages]);


  return (
    <View className="absolute bottom-20 left-4 right-4 z-50 pointer-events-none">
      <View className="flex-col justify-end">
        {visibleMessages.map((msg, index) => (
          <StreamChatMessage
            key={msg._id || msg.uuId || index}
            message={msg}
            index={index}
            isDarkColorScheme={isDarkColorScheme}
          />
        ))}
      </View>
    </View>
  );
};

export default StreamChatOverlay;
