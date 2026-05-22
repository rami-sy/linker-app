import { useCallback, useEffect, useState } from "react";
import { debounce, uniqBy } from "lodash";
import { useDispatch } from "react-redux";
import { router } from "expo-router";
import { addRoom, clearRoom, setRoom } from "../redux/chatSlice";
import { addAlert } from "../redux/alertSlice";
import logger from "../utils/logger";

/**
 * Friend/recent-chat list for forward and add-member popups.
 */
export default function useHeaderForwardList({
  socket,
  PAGE_SIZE,
  selectedMessages,
  setSelectedMessages,
  sendMessage,
  rooms,
  user,
  setForward,
  t,
}) {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [list, setList] = useState([]);

  const getFriendsNRecentChats = useCallback(
    (pageNum, searchText) => {
      if (!socket) return;
      setLoading(true);
      socket.emit(
        "getFriendsNRecentChats",
        { page: pageNum, size: PAGE_SIZE, search: searchText },
        (res) => {
          setLoading(false);
          if (res?.type === "error") return;
          const newFriends = [
            ...(res?.data?.recentRooms?.length > 0 ? res?.data?.recentRooms : []),
            ...(res?.data?.friends?.length > 0 ? res?.data?.friends : []),
          ];
          setList((prev) => {
            const uniqueFriends = uniqBy(
              pageNum === 1 ? newFriends : [...prev, ...newFriends],
              "_id"
            );
            return pageNum === 1 ? newFriends : uniqueFriends;
          });
          setHasMore(
            res?.data?.friends?.length > 0 || res?.data?.recentRooms?.length > 0
          );
        }
      );
    },
    [PAGE_SIZE, socket]
  );

  const debouncedSearch = useCallback(
    debounce(async (text) => {
      await getFriendsNRecentChats(1, text);
      setPage(1);
      setSearching(false);
    }, 1500),
    [getFriendsNRecentChats]
  );

  const handleSearch = useCallback(
    (text) => {
      setList([]);
      setSearching(true);
      setSearch(text);
      debouncedSearch(text);
    },
    [debouncedSearch]
  );

  const handleLoadMore = useCallback(() => {
    if (loading || !hasMore) return;
    setPage((prev) => prev + 1);
  }, [loading, hasMore]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  useEffect(() => {
    if (!socket || searching) return;
    getFriendsNRecentChats(page, search);
  }, [page, search, searching, socket, getFriendsNRecentChats]);

  const handlePress = useCallback(
    async (item) => {
      if (!socket) return;
      await dispatch(clearRoom());
      socket.emit("createRoom", { receiverId: item?._id }, async (res) => {
        logger.debug("Create room response", { res });
        if (res?.type !== "success") return;
        dispatch(setRoom(res?.data));
        if (!rooms.find((r) => r._id === res?.data._id)) {
          dispatch(addRoom(res?.data));
        }
        router.replace(`/chats/${res?.data?._id}`);
        await Promise.all(
          selectedMessages.map((message) =>
            sendMessage({
              room: res?.data._id,
              text: message?.text,
              type: message?.type ?? "text",
              content: message?.content,
              members: res?.data?.members,
              forwardedFrom: message?.user,
              forwardedAt: new Date(),
            })
          )
        );
        socket.emit("getMessages", { room: res?.data._id, override: true });
        setSelectedMessages([]);
        dispatch(
          addAlert({
            message: t("header.copySuccess", {
              count: selectedMessages.length,
              plural: selectedMessages.length > 1 ? "s" : "",
            }),
            type: "success",
          })
        );
        setForward(false);
      });
    },
    [
      dispatch,
      rooms,
      selectedMessages,
      sendMessage,
      setForward,
      setSelectedMessages,
      socket,
      t,
    ]
  );

  return {
    list,
    loading,
    hasMore,
    search,
    page,
    setPage,
    searching,
    refreshing,
    handleSearch,
    handleLoadMore,
    onRefresh,
    handlePress,
    PAGE_SIZE,
  };
}
