import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateRoom } from "../redux/chatSlice";
import { isRoomCallActiveForIndicator } from "../utils/roomActiveCall";

/**
 * Clears phantom hasActiveCall on rooms without real snapshot/participants.
 * Replaces the old floating “Active call” pill’s side effect after it was removed from the layout.
 */
const RoomCallStateScrubber = () => {
  const dispatch = useDispatch();
  const rooms = useSelector((state) => state.chats.rooms);

  useEffect(() => {
    const list = Array.isArray(rooms) ? rooms : [];

    list.forEach((room) => {
      if (room?.hasActiveCall !== true) return;
      const stillActive = isRoomCallActiveForIndicator(room);
      if (stillActive) {
        return;
      }
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

  return null;
};

export default RoomCallStateScrubber;
