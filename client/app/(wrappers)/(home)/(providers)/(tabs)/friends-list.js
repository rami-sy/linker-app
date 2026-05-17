import React, { useCallback, useContext, useEffect, useState } from "react";
import Layout from "../../../../../src/components/layout";
import { SocketContext } from "../../../../../src/contexts/socket.context";
import { useDispatch, useSelector } from "react-redux";
import {
  addRoom,
  clearRoom,
  setRoom,
} from "../../../../../src/redux/chatSlice";
import { debounce, uniqBy } from "lodash";

import SearchBar from "../../../../../src/components/search-bar";
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Box from "../../../../../src/components/box";
import { UserDisplay } from "../../../../../src/components/user";
import FeIcon from "react-native-vector-icons/Feather";
import { PAGE_SIZE } from "../../../../../src/constants";
import { useTranslation } from "react-i18next";
import { setFriends } from "../../../../../src/redux/userSlice";
import { Link, router } from "expo-router";
import { getLocales } from "expo-localization";
import Head from "expo-router/head";
import ChatLockPasswordModal from "~/src/components/chat/chat-lock-password-modal";
import { addAlert } from "~/src/redux/alertSlice";
import MsgIcon from "~/assets/icons/msg-icon";
import { useColorScheme } from "~/lib/useColorScheme";

const FriendsListScreen = () => {
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { friends, user } = useSelector((state) => state.users);
  const { isDarkColorScheme } = useColorScheme();
  const { socket } = useContext(SocketContext);
  const dispatch = useDispatch();


  const getFriendsNRecentChats = (page, search) => {
    setLoading(true);
    if (socket) {
      socket.emit(
        "getFriendsNRecentChats",
        {
          page,
          size: PAGE_SIZE,
          search,
        },
        handleGetFriendsNRecentChats
      );
    }
  };

  const handleGetFriendsNRecentChats = (res) => {
    if (res?.type === "error") {
      return;
    }
    const newFriends = [
      ...(res?.data?.recentRooms?.length > 0 ? res?.data?.recentRooms : []),
      ...(res?.data?.friends?.length > 0 ? res?.data?.friends : []),
    ];
    const uniqueFriends = uniqBy([...friends, ...newFriends], "_id");

    dispatch(setFriends(page === 1 ? newFriends : uniqueFriends));
    setHasMore(
      res?.data?.friends?.length > 0 || res?.data?.recentRooms?.length > 0
    );
    setLoading(false);
  };

  const handleLoadMore = () => {
    if (loading || !hasMore) return;
    setPage((prev) => prev + 1);
  };

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000); // Refresh indicator will be visible for at least 1 second
  };

  useEffect(() => {
    if (!socket) return;

    if (!searching) {
      getFriendsNRecentChats(page, search);
    }
  }, [page, search, searching, socket]);

  const debouncedSearch = useCallback(
    debounce(async (text) => {
      getFriendsNRecentChats(1, text);
      setPage(1);
      setSearching(false);
    }, 1500),
    []
  );
  const { rooms , roomId} = useSelector((state) => state.chats);
  const [lockModal, setLockModal] = useState(null);
  const [password, setPassword] = useState("");

  const handleCreateRoom = async (item) => {
    await dispatch(clearRoom());
    socket.emit(
      "createRoom",
      {
        receiverId: item?._id,
      },
      async (res) => {
        if (res?.type === "success") {
          dispatch(setRoom(res?.data));
          if (!rooms.find((r) => r._id === res?.data._id)) {
            dispatch(addRoom(res?.data));
          }
          if (
            res?.data?.passwords?.find((password) => password?.user === user?._id)
          ) { 
            setLockModal("enter");
          } else {
          await socket.emit("getMessages", {
            room: res?.data._id,
            override: true,
          });
          router.push(`/chats/${res?.data?._id}`);
          }
        }
      }
    );
  };
  const { t } = useTranslation();
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";
  return (
    <>
      <Head>
        <title>Friends List | Linker</title>
        <meta
          name="description"
          content="Friends list. Linker is the best way to connect with your friends. It's a social media platform that allows you to connect with your friends and family."
        />
      </Head>
      {lockModal && (
        <ChatLockPasswordModal
          mode={lockModal}
          password={password}
          onPasswordChange={setPassword}
          onClose={() => {
            setLockModal(null);
            setPassword("");
          }}
          onConfirm={async () => {
            if (lockModal === "add" || lockModal === "remove") {
              if (
                lockModal === "remove" &&
                password !==
                  rooms
                    .find((room) => room._id === roomId)
                    ?.passwords?.find(
                      (password) => password?.user === user?._id
                    )?.password
              ) {
                setPassword("");
                dispatch(
                  addAlert({
                    message: t("general.passwordIsNotCorrect"),
                    type: "error",
                  })
                );
                return;
              }

              socket.emit(
                "setPassword",
                {
                  room: roomId,
                  password,
                  type: lockModal,
                },
                (res) => {
                  if (res.type === "success") {
                    setLockModal(null);
                    dispatch(
                      updateRoom({
                        _id: res.data._id,
                        passwords: res.data.passwords,
                      })
                    );
                    setPassword("");
                    if (lockModal === "add") {
                      dispatch(
                        addAlert({
                          message: t("general.passwordAddedSuccessfully"),
                          type: "success",
                        })
                      );
                    }
                    if (lockModal === "remove") {
                      dispatch(
                        addAlert({
                          message: t("general.passwordRemovedSuccessfully"),
                          type: "success",
                        })
                      );
                    }
                  }
                }
              );
            } else if (lockModal === "enter") {
              if (
                password !==
                rooms
                  .find((room) => room._id === roomId)
                  ?.passwords?.find((password) => password?.user === user?._id)
                  ?.password
              ) {
                setPassword("");
                dispatch(
                  addAlert({
                    message: t("general.passwordIsNotCorrect"),
                    type: "error",
                  })
                );
                return;
              }
              if (socket) {
                await socket.emit("getMessages", {
                  room: roomId,
                  override: true,
                });
              }
              router.push({
                pathname: `/chats/${roomId}`,
                params: { from: "explore" },
              });
              setLockModal(null);
              setPassword("");
            }
          }}
        />
      )}
      <Layout
        // title={"Users"}
        // back
        // onBack={() => {
        // }}
        className={`flex-1 w-full md:w-1/2 lg:w-1/2 ${isDarkColorScheme ? "bg-[#12141b]" : "bg-[#dee4e6]"}`}
        navBar={
          // <View className={`flex-row items-center justify-between w-full`}>
          <>
            <TouchableOpacity
              className={`items-center justify-center mr-3`}
              onPress={() => {
                router.push("/chats");
              }}
            >
              {isRTL ? (
                <FeIcon
                  name="chevron-right"
                  size={35}
                  color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                />
              ) : (
                <FeIcon
                  name="chevron-left"
                  size={35}
                  color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                />
              )}
            </TouchableOpacity>
            <SearchBar
              label={t("general.friends")}
              handleSearch={debouncedSearch}
              search={search}
              setSearch={setSearch}
              searching={searching}
              setSearching={setSearching}
            />
          </>
          // </View>
        }
      >
        {!searching && friends.length === 0 && (
          <View className={`items-center justify-center flex-1`}>
            <Text
              className={`w-9/12 text-base text-center text-slate-800 dark:text-slate-200`}
            >
              {t("general.noFriends")}
            </Text>
            <Text>{"\n"}</Text>
            <Link href="/explore">
              <Text
                className={`font-semibold text-placehoder dark:text-papaya`}
              >
                {t("general.clickToAddFriends")}
              </Text>
            </Link>
          </View>
        )}
        <FlatList
          data={friends || []}
          className={`w-full p-0`}
          keyExtractor={(item) => item?._id.toString()}
          renderItem={({ item }) => (
            <Box
              onPress={() => {
                handleCreateRoom(item);
              }}
              disabled={!item?.canMsg}
            >
              <UserDisplay
                user={item}
                imageSize="h-12 w-12"
                imageBorder="border-0"
                onAvatarPress={() => {
                  router.push({
                    pathname: `/profile/${item?._id}`,
                    params: { from: "friends-list" },
                  });
                }}
                className="flex-1"
                actions={
                  <View className={`flex-row items-center gap-x-3`}>
                    {item?.canMsg && (
                      <TouchableOpacity
                        className={`flex-row items-center justify-center text-stone-600`}
                        onPress={() => handleCreateRoom(item)}
                        disabled={!item?.canMsg}
                      >
                        <MsgIcon width={25} height={25} />
                      </TouchableOpacity>
                    )}
                    {item.isRecent && (
                      <FeIcon
                        name="clock"
                        size={20}
                        color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                      />
                    )}
                  </View>
                }
              />
            </Box>
          )}
          onEndReachedThreshold={0.1}
          initialNumToRender={PAGE_SIZE}
          onEndReached={handleLoadMore}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListFooterComponent={
            loading && (
              <ActivityIndicator
                size="large"
                color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
              />
            )
          }
        />
      </Layout>
    </>
  );
};

export default FriendsListScreen;
