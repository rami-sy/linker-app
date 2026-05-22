import React, {
  act,
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
} from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  I18nManager,
  ScrollView,
} from "react-native";

import Layout from "../../../../../src/components/layout";
import FeIcon from "react-native-vector-icons/Feather";
import MCIcon from "react-native-vector-icons/MaterialCommunityIcons";
import { useDispatch, useSelector } from "react-redux";
import { useFriendAction } from "../../../../../src/sockets/friend";
import { debounce, uniqBy } from "lodash";
import {
  setFriends,
  setIncomingFriendRequests,
  setOutgoingFriendRequests,
  setBlockedUsers,
  setFans,
  setFollowing,
  setVisitors,
  setUserProfile,
} from "../../../../../src/redux/userSlice";
import { SocketContext } from "../../../../../src/contexts/socket.context";
import { PAGE_SIZE } from "../../../../../src/constants";
import {
  addRoom,
  clearRoom,
  setRoom,
} from "../../../../../src/redux/chatSlice";
import { useTranslation } from "react-i18next";
import MsgIcon from "../../../../../assets/icons/msg-icon";
import { router, useLocalSearchParams } from "expo-router";
import UserInteractiveIcon from "../../../../../src/components/user/user-interactive-icon";
import Head from "expo-router/head";
import ChatLockPasswordModal from "../../../../../src/components/chat/chat-lock-password-modal";
import { addAlert } from "~/src/redux/alertSlice";
import Popup from "~/src/components/popup";
import { ProfileUserCard, UserDisplay } from "~/src/components/user";
import { useColorScheme } from "~/lib/useColorScheme";

const RenderList = ({ activeTab }) => {
  const { socket, emitWithAck } = useContext(SocketContext);
  const {
    user,
    friends,
    incomingFriendRequests,
    outgoingFriendRequests,
    blockedUsers,
    fans,
    following,
    visitors,
  } = useSelector((state) => state.users);
  const { rooms, roomId } = useSelector((state) => state.chats);

  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const {
    handleAcceptFriend,
    handleCancelFriendRequest,
    handleRemoveFriend,
    handleUnBlockUser,
  } = useFriendAction();
  const dispatch = useDispatch();
  const getMyConnections = async (page, search, type) => {
    setLoading(true);
    if (!socket) return;
    socket.emit(
      "getMyConnections",
      {
        page,
        size: PAGE_SIZE,
        search,
        type: type,
      },
      handleGetMyConnections
    );
  };

  useEffect(() => {
    if (!socket) return;

    return () => {
      if (!socket) return;

      setPage(1);
      setHasMore(true);
      setSearching(false);
      setRefreshing(false);
      if (activeTab === "friends") {
        dispatch(setFriends([]));
      } else if (activeTab === "sent") {
        dispatch(setOutgoingFriendRequests([]));
      } else if (activeTab === "received") {
        dispatch(setIncomingFriendRequests([]));
      } else if (activeTab === "blocked") {
        dispatch(setBlockedUsers([]));
      } else if (activeTab === "fans") {
        dispatch(setFans([]));
      } else if (activeTab === "following") {
        dispatch(setFollowing([]));
      } else if (activeTab === "visitors") {
        dispatch(setVisitors([]));
      }
    };
  }, [activeTab, socket]);

  const handleGetMyConnections = (res) => {
    if (res?.type === "error") {
      return;
    }
    console.log("res", res);
    const newConnections = [...(res.data.length > 0 ? res.data : [])];
    const uniqueConnections =
      activeTab === "friends"
        ? friends.length > 0
          ? uniqBy([...friends, ...newConnections], "_id")
          : newConnections
        : activeTab === "sent"
        ? outgoingFriendRequests.length > 0
          ? uniqBy([...outgoingFriendRequests, ...newConnections], "_id")
          : newConnections
        : activeTab === "received"
        ? incomingFriendRequests.length > 0
          ? uniqBy([...incomingFriendRequests, ...newConnections], "_id")
          : newConnections
        : activeTab === "fans"
        ? fans.length > 0
          ? uniqBy([...fans, ...newConnections], "_id")
          : newConnections
        : activeTab === "following"
        ? following.length > 0
          ? uniqBy([...following, ...newConnections], "_id")
          : newConnections
        : activeTab === "visitors"
        ? visitors.length > 0
          ? uniqBy([...visitors, ...newConnections], "_id")
          : newConnections
        : activeTab === "blocked"
        ? blockedUsers.length > 0
          ? uniqBy([...blockedUsers, ...newConnections], "_id")
          : newConnections
        : [];
    dispatch(
      activeTab === "friends"
        ? setFriends(page === 1 ? newConnections : uniqueConnections)
        : activeTab === "sent"
        ? setOutgoingFriendRequests(
            page === 1 ? newConnections : uniqueConnections
          )
        : activeTab === "received"
        ? setIncomingFriendRequests(
            page === 1 ? newConnections : uniqueConnections
          )
        : activeTab === "fans"
        ? setFans(page === 1 ? newConnections : uniqueConnections)
        : activeTab === "following"
        ? setFollowing(page === 1 ? newConnections : uniqueConnections)
        : activeTab === "visitors"
        ? setVisitors(page === 1 ? newConnections : uniqueConnections)
        : activeTab === "blocked"
        ? setBlockedUsers(page === 1 ? newConnections : uniqueConnections)
        : null
    );
    setHasMore(res?.data?.length > 0);
    setLoading(false);
  };

  useEffect(() => {
    if (!socket) return;

    if (!searching) {
      getMyConnections(page, search, activeTab);
    }
  }, [page, search, searching, socket]);

  const debouncedSearch = useCallback(
    debounce(async (text) => {
      getMyConnections(1, text, activeTab);
      setPage(1);
      setSearching(false);
    }, 1500),
    []
  );
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
            res?.data?.passwords?.find(
              (password) => password?.user === user?._id
            )
          ) {
            setLockModal("enter");
          } else {
            await socket.emit("getMessages", {
              room: res?.data._id,
              override: true,
            });
            router.push({
              pathname: `/chats/${res?.data?._id}`,
              params: { from: "users" },
            });
          }
        }
      }
    );
  };
  const { isDarkColorScheme } = useColorScheme();
  const { t } = useTranslation();
  const [showUserCard, setShowUserCard] = useState(false);
  // const [deleteModal, setDeleteModal] = useState(false);
  return (
    <>
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

      <Popup
        showModal={showUserCard}
        onCancel={() => setShowUserCard(false)}
        withActions={false}
        w="w-11/12"
        maxDialogWidth={500}
        minDialogWidth={300}
        dialogWidthFraction={0.92}
      >
        <ProfileUserCard
          inPopup
          backButton={false}
          onImagePress={() => {}}
          w="w-full"
          onCancel={() => setShowUserCard(false)}
          viewProfile={true}
          viewProfileFrom="users"
        />
      </Popup>

      {/* <Popup
        showModal={deleteModal}
        setShowModal={setDeleteModal}
        justify="justify-center"
        items="items-center"
        onCancel={() => setDeleteModal(false)}
        onClick={() => {
          setDeleteModal(false);
          selectedRooms.map((room) => {
            socket.emit("clearChat", {
              room: room,
            });
          });

          dispatch(
            setRooms(rooms.filter((room) => !selectedRooms.includes(room?._id)))
          );

          setSelectedRooms([]);
        }}
      >
        <Text
          className="text-base text-center text-placehoder dark:text-papaya"
        >
          {t("general.deleteConfirmation")}
          {selectedRooms.length > 1
            ? " " + t("general.theseChats")
            : " " + t("general.thisChat")}
        </Text>
      </Popup> */}

      {/* {friends.length === 0 && (
        <View className={`items-center justify-center flex-1`}>
          <Text
            className="w-9/12 text-base text-center text-slate-800 dark:text-slate-200"
          >
            {t("general.noChats")}
          </Text>
          <Text>{"\n"}</Text>
          <Text
            className="text-papaya font-semibold text-placehoder dark:text-papaya"
          >
            {t("general.clickToGoToFriendsList")}
          </Text>
        </View>
      )} */}

      {activeTab === "friends" && friends.length === 0 && (
        <View className={`flex-row items-center justify-center px-3 mt-6`}>
          <Text
            className="text-base text-slate-800 dark:text-slate-200"
          >
            {t("general.noFriends")}
          </Text>
        </View>
      )}
      <FlatList
        data={
          activeTab === "friends"
            ? friends || []
            : activeTab === "sent"
            ? outgoingFriendRequests || []
            : activeTab === "received"
            ? incomingFriendRequests || []
            : activeTab === "fans"
            ? fans || []
            : activeTab === "following"
            ? following || []
            : activeTab === "visitors"
            ? visitors || []
            : activeTab === "blocked"
            ? blockedUsers || []
            : []
        }
        keyExtractor={(item) => item?._id.toString()}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            className="flex-row items-center justify-start w-full h-16 px-3 mb-2 rounded-2xl border-0 bg-[#f6f8f9] dark:bg-[#171b25]"
            onPress={() => handleCreateRoom(item)}
            disabled={!item?.canMsg}
          >
            <UserDisplay
              user={item}
              imageSize="h-12 w-12"
              imageBorder="border-0"
              onAvatarPress={async () => {
                const res = await emitWithAck("getOneUser", {
                  targetUserId: item?._id,
                });
                dispatch(setUserProfile(res.data));
                setShowUserCard(true);
              }}
              className="flex-1"
              onlyFirst={false}
              actions={
                <View className={`flex-row items-center justify-between gap-x-3`}>
              {activeTab === "received" && (
                <View
                  className={`flex-row items-center justify-between gap-x-3`}
                >
                  {item?.canMsg && (
                    <TouchableOpacity
                      className={`items-center`}
                      onPress={() => handleCreateRoom(item)}
                      disabled={!item?.canMsg}
                    >
                      <MsgIcon width={25} height={25} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    className={`items-center`}
                    onPress={() => {
                      handleAcceptFriend({
                        targetUserId: item?._id,
                      });
                    }}
                  >
                    <UserInteractiveIcon
                      iconName="check"
                      iconSize={23}
                      iconSecondarySize={16}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`items-center`}
                    onPress={() => {
                      handleCancelFriendRequest({
                        targetUserId: item?._id,
                      });
                    }}
                  >
                    <UserInteractiveIcon
                      iconName="close"
                      iconSize={23}
                      iconSecondarySize={16}
                    />
                  </TouchableOpacity>
                </View>
              )}
              {activeTab === "friends" && (
                <View
                  className={`flex-row items-center justify-between gap-x-3`}
                >
                  {item?.canMsg && (
                    <TouchableOpacity
                      className={`items-center`}
                      onPress={() => {
                        handleCreateRoom(item);
                      }}
                      disabled={!item?.canMsg}
                    >
                      <MsgIcon width={25} height={25} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    className={`items-center`}
                    onPress={() => {
                      handleRemoveFriend({
                        targetUserId: item?._id,
                      });
                    }}
                  >
                    <UserInteractiveIcon
                      iconName="minus"
                      iconSize={23}
                      iconSecondarySize={16}
                    />
                  </TouchableOpacity>
                </View>
              )}

              {activeTab === "sent" && (
                <View
                  className={`flex-row items-center justify-between gap-x-3`}
                >
                  {item?.canMsg && (
                    <TouchableOpacity
                      className={`items-center`}
                      onPress={() => handleCreateRoom(item)}
                      disabled={!item?.canMsg}
                    >
                      <MsgIcon width={25} height={25} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    className={`items-center`}
                    onPress={() => {
                      // handleAccept(item);
                    }}
                  >
                    <FeIcon
                      name="send"
                      size={25}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`items-center`}
                    onPress={() => {
                      handleCancelFriendRequest({
                        targetUserId: item?._id,
                      });
                    }}
                  >
                    <FeIcon
                      name="x"
                      size={25}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  </TouchableOpacity>
                </View>
              )}

              {activeTab === "blocked" && (
                <View
                  className={`flex-row items-center justify-between gap-x-3`}
                >
                  <TouchableOpacity
                    className={`items-center`}
                    onPress={() => {
                      // handleAccept(item);
                    }}
                  >
                    <FeIcon
                      name="slash"
                      size={25}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`items-center`}
                    onPress={() => {
                      handleUnBlockUser({
                        targetUserId: item?._id,
                        userId: user?._id,
                      });
                    }}
                  >
                    <FeIcon
                      name="x"
                      size={25}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  </TouchableOpacity>
                </View>
              )}
                </View>
              }
            />
          </TouchableOpacity>
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
    </>
  );
};

const UsersScreen = () => {
  const [activeTab, setActiveTab] = useState("friends");
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();

  const { tab } = useLocalSearchParams();
  useEffect(() => {
    if (tab) {
      setActiveTab(tab);
    }
  }, [tab]);

  const friendMenuItems = useMemo(() => [
    {
      name: t("general.menuFriends"),
      tab: "friends",
      icon: <FeIcon name="users" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />,
      onPress: () => router.push(`/users?tab=friends`),
      selected: activeTab === "friends",
    },
    {
      name: t("general.menuSentRequests"),
      tab: "sent",
      icon: <FeIcon name="send" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />,
      onPress: () => router.push(`/users?tab=sent`),
      selected: activeTab === "sent",
    },
    {
      name: t("general.menuReceivedRequests"),
      tab: "received",
      icon: <FeIcon name="send" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} style={{ transform: [{ rotate: "180deg" }] }} />,
      onPress: () => router.push(`/users?tab=received`),
      selected: activeTab === "received",
    },
    {
      name: t("general.menuBlockedUsers"),
      tab: "blocked",
      icon: <FeIcon name="slash" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} style={{ transform: [{ rotate: "180deg" }] }} />,
      onPress: () => router.push(`/users?tab=blocked`),
      selected: activeTab === "blocked",
    },
  ], [t, isDarkColorScheme, activeTab]);

  const networkMenuItems = useMemo(() => [
    {
      name: t("general.menuFans"),
      tab: "fans",
      icon: <MCIcon name="cards-heart-outline" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />,
      onPress: () => router.push(`/users?tab=fans`),
      selected: activeTab === "fans",
    },
    {
      name: t("general.menuFollowing"),
      tab: "following",
      icon: <FeIcon name="users" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />,
      onPress: () => router.push(`/users?tab=following`),
      selected: activeTab === "following",
    },
    {
      name: t("general.menuVisitors"),
      tab: "visitors",
      icon: <FeIcon name="eye" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />,
      onPress: () => router.push(`/users?tab=visitors`),
      selected: activeTab === "visitors",
    },
  ], [t, isDarkColorScheme, activeTab]);

  const activeGroup = friendMenuItems.some((item) => item.selected)
    ? "friends"
    : "network";
  const currentGroupItems =
    activeGroup === "friends" ? friendMenuItems : networkMenuItems;

  return (
    <>
      <Head>
        <title>Users | Linker</title>
        <meta
          name="description"
          content="Users list. Linker is the best way to connect with your friends. It's a social media platform that allows you to connect with your friends and family."
        />
      </Head>
      <Layout
        className="items-center justify-between flex-1 relative w-full linker-w p-0 bg-[#dee4e6] dark:bg-[#10131a]"
        back
        onBack={() => router.back()}
        pb="pb-4"
        h="h-auto"
        navBar={
          <View className="flex-1 w-full px-2">
            <View className="flex-row items-center justify-end gap-x-2">
              <TouchableOpacity
                className={`h-10 px-3 rounded-xl flex-row items-center ${
                  activeGroup === "friends"
                    ? "bg-[#0a97b9]"
                    : isDarkColorScheme
                    ? "bg-[#171b25]"
                    : "bg-white"
                }`}
                onPress={() => router.push("/users?tab=friends")}
              >
                <FeIcon
                  name="user-check"
                  size={16}
                  color={
                    activeGroup === "friends"
                      ? "#f6f8f9"
                      : isDarkColorScheme
                      ? "#dee4e6"
                      : "#2D2D37"
                  }
                />
                <Text
                  className={`ml-2 text-sm font-medium ${
                    activeGroup === "friends"
                      ? "text-white"
                      : isDarkColorScheme
                      ? "text-slate-200"
                      : "text-slate-800"
                  }`}
                >
                  {t("general.friendsSectionTitle")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`h-10 px-3 rounded-xl flex-row items-center ${
                  activeGroup === "network"
                    ? "bg-[#0a97b9]"
                    : isDarkColorScheme
                    ? "bg-[#171b25]"
                    : "bg-white"
                }`}
                onPress={() => router.push("/users?tab=fans")}
              >
                <FeIcon
                  name="activity"
                  size={16}
                  color={
                    activeGroup === "network"
                      ? "#f6f8f9"
                      : isDarkColorScheme
                      ? "#dee4e6"
                      : "#2D2D37"
                  }
                />
                <Text
                  className={`ml-2 text-sm font-medium ${
                    activeGroup === "network"
                      ? "text-white"
                      : isDarkColorScheme
                      ? "text-slate-200"
                      : "text-slate-800"
                  }`}
                >
                  {t("general.networkSectionTitle")}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 2 }}
              className="self-end"
            >
              <View className="flex-row items-center gap-x-2">
                {currentGroupItems.map((item) => (
                  <TouchableOpacity
                    key={item.tab}
                    onPress={item.onPress}
                    className={`h-9 px-3 rounded-xl flex-row items-center ${
                      item.selected
                        ? "bg-[#0a97b9]"
                        : isDarkColorScheme
                        ? "bg-[#171b25]"
                        : "bg-white"
                    }`}
                  >
                    {item.icon
                      ? React.cloneElement(item.icon, {
                          size: 15,
                          color: item.selected
                            ? "#f6f8f9"
                            : isDarkColorScheme
                            ? "#dee4e6"
                            : "#2D2D37",
                        })
                      : null}
                    <Text
                      className={`ml-1.5 text-xs font-medium ${
                        item.selected
                          ? "text-white"
                          : isDarkColorScheme
                          ? "text-slate-200"
                          : "text-slate-800"
                      }`}
                    >
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        }
      >
        <View className="flex-1 w-full">
          {activeTab === "friends" && <RenderList activeTab={"friends"} />}
          {activeTab === "received" && <RenderList activeTab={"received"} />}
          {activeTab === "sent" && <RenderList activeTab={"sent"} />}
          {activeTab === "fans" && <RenderList activeTab={"fans"} />}
          {activeTab === "following" && (
            <RenderList activeTab={"following"} />
          )}
          {activeTab === "visitors" && <RenderList activeTab={"visitors"} />}
          {activeTab === "blocked" && <RenderList activeTab={"blocked"} />}
        </View>
      </Layout>
    </>
  );
};

export default UsersScreen;
