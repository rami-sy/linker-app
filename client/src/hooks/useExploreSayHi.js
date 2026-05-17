import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { router } from "expo-router";
import { SocketContext } from "../contexts/socket.context";
import { addRoom, clearRoom, setRoom } from "../redux/chatSlice";
import { setExploreUsersSwiper } from "../redux/exploreSlice";

/** Contexts that share the same Say Hi / Continue chat flow (explore map, list, users tab, swiper). */
export const EXPLORE_SAY_HI_CONTEXTS = [
  "swiper",
  "explore-map",
  "explore",
  "users",
];

/** Where ProfileUserCard popup should show View profile + Say Hi bar (not swiper — that uses the bar on the card). */
export const EXPLORE_PROFILE_POPUP_CONTEXTS = [
  "explore-map",
  "explore",
  "users",
];

/**
 * Say Hi → create DM + send "Hi" without navigating; then Continue opens chat.
 * Swiper stores room id on exploreUsersSwiper item; popups use local state.
 */
export function useExploreSayHi(targetUser, context) {
  const dispatch = useDispatch();
  const { socket, sendMessage } = useContext(SocketContext);
  const { rooms } = useSelector((s) => s.chats);
  const exploreUsersSwiper = useSelector((s) => s.explore.exploreUsersSwiper);
  const [popupSayHiRoomId, setPopupSayHiRoomId] = useState(null);

  useEffect(() => {
    setPopupSayHiRoomId(null);
  }, [targetUser?._id]);

  const roomWithUser = useMemo(() => {
    if (!targetUser?._id) return null;
    return rooms.find((room) => {
      if (room?.isGroup || !Array.isArray(room?.members)) return false;
      return room.members.some(
        (m) => String(m?._id ?? m) === String(targetUser._id)
      );
    });
  }, [rooms, targetUser?._id]);

  const swiperSayHiRoomId = useMemo(() => {
    if (context !== "swiper" || !targetUser?._id) return null;
    const row = exploreUsersSwiper.find(
      (u) => String(u?._id) === String(targetUser._id)
    );
    return row?.sayHiRoomId ?? null;
  }, [context, exploreUsersSwiper, targetUser?._id]);

  const continueRoomId =
    context === "swiper"
      ? swiperSayHiRoomId || roomWithUser?._id || null
      : popupSayHiRoomId || roomWithUser?._id || null;

  const hasSayHiSession = !!continueRoomId;
  const canSayHi = targetUser?.canMsg !== false;

  const handleSayHi = useCallback(async () => {
    if (!socket || !targetUser?._id || !canSayHi) return;
    if (continueRoomId) {
      const continueRoom = rooms.find(
        (r) => String(r?._id) === String(continueRoomId)
      );
      dispatch(clearRoom());
      if (continueRoom) {
        dispatch(setRoom(continueRoom));
        if (!rooms.find((r) => String(r?._id) === String(continueRoom?._id))) {
          dispatch(addRoom(continueRoom));
        }
      }
      await socket.emit("getMessages", {
        room: continueRoomId,
        override: true,
      });
      const fromParam = context === "swiper" ? "swiper" : context;
      router.push({
        pathname: `/chats/${continueRoomId}`,
        params: { from: fromParam },
      });
      return;
    }
    dispatch(clearRoom());
    socket.emit(
      "createRoom",
      { receiverId: targetUser._id },
      async (res) => {
        if (res?.type === "success" && res?.data?._id) {
          dispatch(setRoom(res.data));
          if (!rooms.find((r) => String(r?._id) === String(res.data._id))) {
            dispatch(addRoom(res.data));
          }
          if (context === "swiper") {
            dispatch(
              setExploreUsersSwiper(
                exploreUsersSwiper.map((u) =>
                  String(u?._id) === String(targetUser._id)
                    ? { ...u, sayHiRoomId: res.data._id }
                    : u
                )
              )
            );
          } else {
            setPopupSayHiRoomId(res.data._id);
          }
          await sendMessage?.({
            room: res.data._id,
            members: res.data?.members ?? null,
            text: "Hi",
            type: "text",
            isPendingMsg: false,
          });
        }
      }
    );
  }, [
    socket,
    targetUser,
    canSayHi,
    continueRoomId,
    rooms,
    dispatch,
    context,
    exploreUsersSwiper,
    sendMessage,
  ]);

  return { hasSayHiSession, canSayHi, handleSayHi };
}
