import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Text, TouchableOpacity, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { MediasoupContext } from "../contexts/mediasoup.context";
import { addAlert } from "../redux/alertSlice";
import { updateRoom } from "../redux/chatSlice";
import CallRejoinPanel from "./call-rejoin-panel";
import {
  isRoomCallActiveForIndicator,
  normalizeRoomEntityId,
} from "../utils/roomActiveCall";

const normalizeId = normalizeRoomEntityId;

const CallActiveIndicator = () => {
  const dispatch = useDispatch();
  const { rooms } = useSelector((state) => state.chats);
  const { isJoined, roomId: joinedRoomId } = useContext(MediasoupContext);
  const [panelOpen, setPanelOpen] = useState(false);
  const previousTargetRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const list = Array.isArray(rooms) ? rooms : [];
    list.forEach((room) => {
      if (room?.hasActiveCall !== true) return;
      if (isRoomCallActiveForIndicator(room)) return;
      dispatch(
        updateRoom({
          _id: room?._id,
          hasActiveCall: false,
          activeCallId: null,
          activeCallType: null,
          activeCallStartedAt: null,
          activeCallParticipants: [],
          activeCallParticipantsSyncedAt: Date.now(),
          skipAddIfNotExists: true,
        })
      );
    });
  }, [rooms, dispatch]);

  const activeCallRoom = useMemo(() => {
    const list = Array.isArray(rooms) ? rooms : [];
    const nowJoinedRoomId = normalizeId(joinedRoomId);
    const candidates = list.filter((room) => {
      if (!isRoomCallActiveForIndicator(room)) return false;
      if (isJoined && normalizeId(room?._id) === nowJoinedRoomId) return false;
      return true;
    });

    candidates.sort((a, b) => {
      const aTime = Number(a?.activeCallParticipantsSyncedAt || a?.activeCallStartedAt || 0);
      const bTime = Number(b?.activeCallParticipantsSyncedAt || b?.activeCallStartedAt || 0);
      return bTime - aTime;
    });

    return candidates[0] || null;
  }, [rooms, isJoined, joinedRoomId]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 720,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 720,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  useEffect(() => {
    const previousRoomId = previousTargetRef.current;
    const currentRoomId = normalizeId(activeCallRoom?._id);
    if (previousRoomId && !currentRoomId) {
      setPanelOpen(false);
      dispatch(
        addAlert({
          type: "info",
          title: "Call ended",
          message: "The active group call has ended.",
        })
      );
    }
    previousTargetRef.current = currentRoomId || null;
  }, [activeCallRoom, dispatch]);

  if (!activeCallRoom) return null;

  return (
    <>
      <View className="absolute top-16 right-4 z-50">
        <TouchableOpacity
          onPress={() => setPanelOpen(true)}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Open active call panel"
          className="rounded-full bg-slate-900/85 dark:bg-slate-200/90 px-3 py-2 flex-row items-center"
        >
          <Animated.View
            style={{ opacity: pulseAnim }}
            className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2"
          />
          <Text className="text-xs font-semibold text-white dark:text-slate-900">
            Active call
          </Text>
        </TouchableOpacity>
      </View>
      <CallRejoinPanel
        visible={panelOpen}
        onClose={() => setPanelOpen(false)}
        room={activeCallRoom}
      />
    </>
  );
};

export default CallActiveIndicator;
