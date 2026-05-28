import {
  View,
  TouchableOpacity,
  I18nManager,
  Text,
  ActivityIndicator,
  Platform,
} from "react-native";
import React, {
  useState,
  useEffect,
  useContext,
  useCallback,
  useMemo,
  useRef,
} from "react";
import Layout from "~/src/components/layout";

import { useDispatch, useSelector } from "react-redux";
import { useColorScheme } from "~/lib/useColorScheme";

import { addRoom, clearRoom, setRoom, updateRoom } from "~/src/redux/chatSlice";
import { SocketContext } from "~/src/contexts/socket.context";

import FeIcon from "react-native-vector-icons/Feather";
import MCIcon from "react-native-vector-icons/MaterialCommunityIcons";

import AddFriendList from "~/src/components/add-friend/add-friend-list";
import AddFriendGrid from "~/src/components/add-friend/add-friend-grid";
import AddFriendCard from "~/src/components/add-friend/add-friend-card";
import debounce from "lodash/debounce";
import cloneDeep from "lodash/cloneDeep";
import uniqBy from "lodash/uniqBy";
import { PAGE_SIZE } from "~/src/constants";
import { useTranslation } from "react-i18next";
import {
  addIncomingFriendRequest,
  addOutgoingFriendRequest,
  addSenderReaction,
  removeSenderReaction,
  setMe,
} from "~/src/redux/userSlice";
import { router, useLocalSearchParams, useSegments } from "expo-router";
import { getLocales } from "expo-localization";
import Popup from "~/src/components/popup";
import {
  setActiveTab,
  setChangeFilter,
  setExploreUsers,
  setFirstLoad,
  setHasMore,
  setLoading,
  setPage,
  setRefreshing,
  setSortBy,
} from "~/src/redux/exploreSlice";
import { ProfileUserCard } from "~/src/components/user";
import Head from "expo-router/head";
import ContextMenu from "~/src/components/context-menu";
import ShowFilterPopup from "~/src/components/add-friend/show-filter-popup";
import ChatLockPasswordModal from "~/src/components/chat/chat-lock-password-modal";
import { addAlert } from "~/src/redux/alertSlice";
import ExploreModeTabs from "~/src/components/navigation/explore-mode-tabs";
import { getNavPalette } from "~/src/components/navigation/nav-theme";

// import { getLocales, getCalendars } from "expo-localization";

const Explore = () => {
  const { t } = useTranslation(); // Use translation hook
  const { user } = useSelector((state) => state.users);
  const { rooms, roomId } = useSelector((state) => state.chats);
  const [showLoactionRedirection, setShowLoactionRedirection] = useState(false);
  const listRef = useRef(null);

  const [formData, setFormData] = useState({
    search: "",
    preferredAgeRange: user?.preferredAgeRange,
    preferredGender: user?.preferredGender,
  });
  const {
    exploreUsers,
    page,
    firstLoad,
    hasMore,
    sortBy,
    loading,
    changeFilter,
  } = useSelector((state) => state.explore);
  const { socket, emitWithAck } = useContext(SocketContext);
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

  const [showFilter, setShowFilter] = useState(false);
  const [searchChanged, setSearchChanged] = useState(false);
  const [showUserCard, setShowUserCard] = useState(false);

  const [usersCount, setUsersCount] = useState(0);

  const dispatch = useDispatch();

  const onSearchUsers = useCallback(
    async (formData, page, sortBy, withLoading = true) => {
      if (withLoading) {
        dispatch(setLoading(true));
      }
      if (socket) {
        const res = await emitWithAck("searchUsers", {
          searchQuery: {
            ...formData,
          },
          page: page,
          size: PAGE_SIZE,
          sortBy,
        });
        console.log("res", res);
      }
    },
    [user?._id, socket, emitWithAck]
  );

  const debouncedSearch = useMemo(
    () =>
      debounce((fd, page, sb) => {
        onSearchUsers(fd, page, sb);
        dispatch(setPage(1));
      }, 1000),
    [onSearchUsers, dispatch]
  );

  const filterSnapshotRef = useRef(null);

  const dismissFilterWithoutApply = useCallback(() => {
    debouncedSearch.cancel();
    const snap = filterSnapshotRef.current;
    if (snap != null) {
      setFormData(cloneDeep(snap));
      onSearchUsers(cloneDeep(snap), 1, sortBy);
    }
    setSearchChanged(false);
    setShowFilter(false);
    dispatch(setChangeFilter(false));
  }, [sortBy, onSearchUsers, dispatch, debouncedSearch]);

  const openFilter = useCallback(() => {
    filterSnapshotRef.current = cloneDeep(formData);
    setShowFilter(true);
    dispatch(setPage(1));
  }, [formData, dispatch]);

  const applyFilterAndClose = useCallback(() => {
    filterSnapshotRef.current = cloneDeep(formData);
    setSearchChanged(false);
    setShowFilter(false);
    dispatch(setChangeFilter(false));
  }, [formData, dispatch]);

  // add useEFfect and debounce to onSearchUsers when formData changes
  useEffect(() => {
    if (showFilter && searchChanged) {
      console.log("searchChanged", searchChanged);
      debouncedSearch(formData, 1, sortBy);
    }

    return () => {
      debouncedSearch.cancel();
    };
  }, [formData, sortBy, showFilter, searchChanged]);

  useEffect(() => {
    if (!socket || firstLoad) return;
    console.log("firstLoad", firstLoad);
    dispatch(setFirstLoad(true));
    onSearchUsers({ ...formData }, 1, sortBy, false);
  }, [firstLoad, socket, dispatch, onSearchUsers, formData, sortBy]);

  useEffect(() => {
    if (!socket) return;

    socket.on("searchUsers", handleSearchUsers);

    return () => {
      socket.off("searchUsers", handleSearchUsers);
    };
  }, [page, socket]);

  const onSendFriendRequest = ({ user, targetUser, triggeredBySender }) => {
    dispatch(setMe({ ...user }));
    if (triggeredBySender) {
      dispatch(addOutgoingFriendRequest(targetUser));
    } else {
      dispatch(addIncomingFriendRequest(targetUser));
    }
  };

  const handleSearchUsers = (res) => {
    const newData = [...(res.data?.length > 0 ? res.data : [])];
    const currentPage = res.currentPage ?? 1;
    const uniqueData =
      currentPage === 1
        ? newData
        : uniqBy([...exploreUsers, ...newData], "_id");
    dispatch(setExploreUsers(uniqueData));
    dispatch(setHasMore(res.total > uniqueData.length && newData.length > 0));
    setUsersCount(res.total);
    dispatch(setLoading(false));
    dispatch(setRefreshing(false));
  };
  const handleLoadMore = () => {
    if (loading || !hasMore || showFilter) return;
    const nextPage = page + 1;
    dispatch(setPage(nextPage));
    onSearchUsers(formData, nextPage, sortBy, true);
  };
  const onRefresh = () => {
    dispatch(setRefreshing(true));
    dispatch(setPage(1));
    onSearchUsers(formData, 1, sortBy, false);
  };

  const { isDarkColorScheme } = useColorScheme();
  const navPalette = getNavPalette(isDarkColorScheme);
  const [lockModal, setLockModal] = useState(null);
  const [password, setPassword] = useState("");

  const handleCreateRoom = async (item) => {
    if (!socket) return;
    await dispatch(clearRoom());

    socket.emit(
      "createRoom",
      {
        receiverId: item?._id,
      },
      async (res) => {
        console.log("res", res);
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
              params: { from: "explore" },
            });
          }
        } else {
          dispatch(
            addAlert({
              message: res?.message,
              type: "error",
            })
          );
        }
      }
    );
  };

  const handleReaction = async (item, reaction = "like") => {
    if (!socket) return;
    try {
      const res = await emitWithAck("reactToUser", {
        target: item?._id,
        reaction: reaction,
        targetModel: "User",
      });
      if (res?.action === "remove") {
        dispatch(removeSenderReaction(res?.data));
      } else if (res?.action === "add") {
        dispatch(addSenderReaction(res?.data));
      }
    } catch (error) {
      console.log(error);
    }
  };

  const segments = useSegments();
  const exploreModeItems = [
    {
      name: "explore",
      active: segments[4] === "explore",
      icon: (
        <FeIcon
          name="list"
          size={25}
          color={
            segments[4] === "explore"
              ? navPalette.activeTint
              : navPalette.inactiveTint
          }
        />
      ),
      onPress: () => {
        router.push({ pathname: "/explore" });
        dispatch(setActiveTab("explore"));
      },
    },
    {
      name: "explore-map",
      active: segments[4] === "explore-map",
      icon: (
        <FeIcon
          name="map-pin"
          size={25}
          color={
            segments[4] === "explore-map"
              ? navPalette.activeTint
              : navPalette.inactiveTint
          }
        />
      ),
      onPress: () => {
        if (
          user?.location?.coordinates[0] === 0 ||
          user?.location?.coordinates[1] === 0 ||
          user?.location?.coordinates[0] === null ||
          user?.location?.coordinates[1] === null
        ) {
          setShowLoactionRedirection(true);
          dispatch(setActiveTab("explore-map"));
          return;
        }
        router.push({ pathname: "/explore-map" });
        dispatch(setActiveTab("explore-map"));
      },
    },
    {
      name: "swiper",
      active: segments[4] === "swiper",
      icon: (
        <MCIcon
          name="gesture-swipe"
          size={25}
          color={
            segments[4] === "swiper"
              ? navPalette.activeTint
              : navPalette.inactiveTint
          }
        />
      ),
      onPress: () => {
        router.push({ pathname: "/swiper" });
        dispatch(setActiveTab("swiper"));
      },
    },
  ];
  const sortOptions = [
    {
      name: t("addFriendScreen.dropdown.recommended"),
      onPress: () => {
        listRef.current.scrollToOffset({ offset: 0 });
        setTimeout(() => {
          dispatch(setSortBy("recommended"));
          dispatch(setPage(1));
          onSearchUsers({ ...formData }, 1, "recommended");
        }, 500);
      },
    },
    {
      name: t("addFriendScreen.dropdown.mostActive"),
      onPress: () => {
        listRef.current.scrollToOffset({ offset: 0 });
        setTimeout(() => {
          dispatch(setSortBy("active"));
          dispatch(setPage(1));
          onSearchUsers({ ...formData }, 1, "active");
        }, 500);
      },
    },
    {
      name: t("addFriendScreen.dropdown.recentlyJoined"),
      onPress: () => {
        listRef.current.scrollToOffset({ offset: 0 });
        setTimeout(() => {
          dispatch(setSortBy("newest"));
          dispatch(setPage(1));
          onSearchUsers({ ...formData }, 1, "newest");
        }, 500);
      },
    },
    {
      name: t("addFriendScreen.dropdown.alphabetically"),
      onPress: () => {
        listRef.current.scrollToOffset({ offset: 0 });
        setTimeout(() => {
          dispatch(setSortBy("alphabetically"));
          dispatch(setPage(1));
          onSearchUsers({ ...formData }, 1, "alphabetically");
        }, 500);
      },
    },
    {
      name: t("addFriendScreen.dropdown.nearestFirst"),
      onPress: () => {
        listRef.current.scrollToOffset({ offset: 0 });
        setTimeout(() => {
          dispatch(setSortBy("nearest"));
          dispatch(setPage(1));
          onSearchUsers(
            { ...formData, location: user?.location },
            1,
            "nearest"
          );
        }, 500);
      },
    },
    {
      name: t("addFriendScreen.dropdown.youngest"),
      onPress: () => {
        listRef.current.scrollToOffset({ offset: 0 });
        setTimeout(() => {
          dispatch(setSortBy("youngest"));
          dispatch(setPage(1));
          onSearchUsers({ ...formData }, 1, "youngest");
        }, 500);
      },
    },
    {
      name: t("addFriendScreen.dropdown.oldest"),
      onPress: () => {
        listRef.current.scrollToOffset({ offset: 0 });
        setTimeout(() => {
          dispatch(setSortBy("oldest"));
          dispatch(setPage(1));
          onSearchUsers({ ...formData }, 1, "oldest");
        }, 500);
      },
    },
  ];
  const emptyHints = useMemo(() => {
    const hints = [];
    const hasSearchTerm = (formData?.search || "").trim().length > 0;
    const defaultGender = user?.preferredGender;
    const selectedGender = formData?.preferredGender;
    const hasGenderFilters = Array.isArray(selectedGender)
      ? selectedGender.length > 0 &&
        JSON.stringify(selectedGender) !== JSON.stringify(defaultGender || [])
      : selectedGender != null &&
        selectedGender !== "" &&
        selectedGender !== defaultGender;
    const ageRange = formData?.preferredAgeRange || [];
    const defaultAgeRange = user?.preferredAgeRange || [18, 100];
    const hasAgeFilterApplied =
      ageRange.length === 2 &&
      (ageRange[0] !== defaultAgeRange?.[0] ||
        ageRange[1] !== defaultAgeRange?.[1]);
    const isTightAgeRange =
      ageRange.length === 2 && Math.abs((ageRange[1] || 0) - (ageRange[0] || 0)) <= 6;

    if (hasSearchTerm) {
      hints.push(t("explore.emptyHints.clearSearch"));
    }
    if (hasGenderFilters) {
      hints.push(t("explore.emptyHints.broadenGender"));
    }
    if (hasAgeFilterApplied && isTightAgeRange) {
      hints.push(t("explore.emptyHints.widenAgeRange"));
    }
    if ((formData?.locationType || "") === "nearby") {
      hints.push(t("explore.emptyHints.increaseDistance"));
    }
    if (sortBy !== "recommended") {
      hints.push(t("explore.emptyHints.tryRecommended"));
    }

    return hints.slice(0, 2);
  }, [formData, sortBy, t, user]);

  return (
    <>
      <Head>
        <title>Explore | Linker</title>
        <meta
          name="description"
          content="Discover new connections, meet interesting people, and expand your social network with Linker. Start exploring today!"
        />
      </Head>

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
          viewProfileFrom="explore"
        />
      </Popup>

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

              if (!socket) return;
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
        showModal={showLoactionRedirection}
        setShowModal={setShowLoactionRedirection}
        swithColor
        onClick={() => {
          router.push("/update-profile?active=location&from=explore");
          setShowLoactionRedirection(false);
          setShowFilter(false);
        }}
        onCancel={() => setShowLoactionRedirection(false)}
      >
        <Text
          className="text-base text-center text-slate-800 dark:text-slate-200"
        >
          {t("addFriendScreen.setYourLocation")}
        </Text>
      </Popup>

      <View
        className="flex-1 w-full linker-w bg-[#dee4e6] dark:bg-[#12141b]"
      >
        <ExploreModeTabs
          isDarkColorScheme={isDarkColorScheme}
          items={exploreModeItems}
          rightContent={
            <View className="flex-row items-center justify-center gap-x-2 pr-2">
              {(Object.keys(formData).length > 3 ||
                formData.search.length > 0 ||
                formData.preferredGender !== user?.preferredGender ||
                formData.preferredAgeRange[0] !== user?.preferredAgeRange[0] ||
                formData.preferredAgeRange[1] !== user?.preferredAgeRange[1]) && (
                <TouchableOpacity
                  className="flex-row items-center justify-center w-10 h-10 p-2 rounded-full"
                  onPress={() => {
                    setFormData({
                      search: "",
                      preferredGender: user?.preferredGender,
                      preferredAgeRange: user?.preferredAgeRange,
                    });
                    dispatch(setPage(1));
                    onSearchUsers(
                      {
                        search: "",
                        preferredGender: user?.preferredGender,
                        preferredAgeRange: user?.preferredAgeRange,
                      },
                      1,
                      sortBy
                    );
                  }}
                >
                  <FeIcon
                    name="x"
                    size={22}
                    color={isDarkColorScheme ? "#dee4e6" : "#012a4a"}
                  />
                </TouchableOpacity>
              )}
              <ContextMenu options={sortOptions} placement="bottom" width={220}>
                <FeIcon
                  name="filter"
                  size={25}
                  color={isDarkColorScheme ? "#dee4e6" : "#012a4a"}
                />
              </ContextMenu>
              <TouchableOpacity
                className="flex-row items-center justify-center w-10 h-10 p-2 rounded-full border-0 bg-[#EDF6F9] dark:bg-[#ef233c]"
                style={{
                  borderWidth: 0,
                  ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
                }}
                onPress={openFilter}
              >
                <FeIcon
                  name="search"
                  size={22}
                  color={isDarkColorScheme ? "#f6f8f9" : "#012a4a"}
                />
              </TouchableOpacity>
            </View>
          }
        />
        <View className="flex-1 mt-[86px]">
          <Layout
            pb="pb-[70px]"
            className="pt-0"
          >
            {showFilter && (
              <ShowFilterPopup
                showFilter={showFilter}
                setShowFilter={setShowFilter}
                formData={formData}
                setFormData={setFormData}
                usersCount={usersCount}
                setSearchChanged={setSearchChanged}
                setShowLoactionRedirection={setShowLoactionRedirection}
                onSearchUsers={onSearchUsers}
                onDismissWithoutApply={dismissFilterWithoutApply}
                onApply={applyFilterAndClose}
              />
            )}
            {loading && exploreUsers.length === 0 ? (
              <View className="w-full px-2 pt-2">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <View
                    key={`explore-skeleton-${idx}`}
                    className="w-full h-20 rounded-2xl mb-2 bg-slate-200 dark:bg-slate-800"
                  />
                ))}
              </View>
            ) : exploreUsers.length === 0 ? (
              <View className="items-center justify-center flex-1">
                <FeIcon
                  name="users"
                  size={46}
                  color={isDarkColorScheme ? "#64748b" : "#94a3b8"}
                />
                <Text className="w-10/12 mt-3 text-center text-slate-700 dark:text-slate-300">
                  {t("explore.emptyTitle")}
                </Text>
                <Text className="w-10/12 mt-2 text-center text-slate-500 dark:text-slate-400">
                  {t("explore.emptySubtitle")}
                </Text>
                {emptyHints.map((hint) => (
                  <Text
                    key={hint}
                    className="w-10/12 mt-2 text-center text-slate-600 dark:text-slate-300"
                  >
                    - {hint}
                  </Text>
                ))}
              </View>
            ) : (
              <AddFriendList
                handleCreateRoom={handleCreateRoom}
                handleReaction={handleReaction}
                onRefresh={onRefresh}
                handleLoadMore={handleLoadMore}
                onSearchUsers={onSearchUsers}
                formData={formData}
                setShowUserCard={setShowUserCard}
                listRef={listRef}
              />
            )}
          </Layout>
        </View>
      </View>
    </>
  );
};

export default Explore;
