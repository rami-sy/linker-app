import {
  View,
  TouchableOpacity,
  Text,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import React, {
  useRef,
  useState,
  useMemo,
  useContext,
  useCallback,
  useEffect,
} from "react";

import { useDispatch, useSelector } from "react-redux";

import FeIcon from "react-native-vector-icons/Feather";
import MCIcon from "react-native-vector-icons/MaterialCommunityIcons";

import { useTranslation } from "react-i18next";

import uniqBy from "lodash/uniqBy";

import { router, useSegments } from "expo-router";

import {
  setActiveTab,
  setExploreUsersSwiper,
  setFirstLoadSwiper,
  setHasMoreSwiper,
  setLoadingSwiper,
  setPageSwiper,
} from "../../../../../src/redux/exploreSlice.js";
import { SocketContext } from "~/src/contexts/socket.context.js";
import { PAGE_SIZE } from "~/src/constants/index.js";
import ProfileScreen from "../profile/[userId].js";
import Modal from "~/src/components/modal.js";
import {
  addSenderReaction,
  removeSenderReaction,
} from "~/src/redux/userSlice.js";
import Popup from "~/src/components/popup.js";
import SwipeCard from "../../../../../src/components/swipe-card.js";
import MIcon from "react-native-vector-icons/MaterialIcons";
import { useColorScheme } from "~/lib/useColorScheme";
import ExploreModeTabs from "../../../../../src/components/navigation/explore-mode-tabs";
import { getNavPalette } from "../../../../../src/components/navigation/nav-theme";

const SWIPE_PREFETCH_THRESHOLD = 3;



const Swiper = () => {
  const { t } = useTranslation(); // Use translation hook
  const { user } = useSelector((state) => state.users);
  const { isDarkColorScheme } = useColorScheme();
  const navPalette = getNavPalette(isDarkColorScheme);
  const [showLoactionRedirection, setShowLoactionRedirection] = useState(false);
  const dispatch = useDispatch();
  const { socket, emitWithAck } = useContext(SocketContext);
  const segments = useSegments();
  const [userReaction, setUserReaction] = useState({
    type: null,
    target: null,
  });
  const {
    exploreUsersSwiper,
    pageSwiper,
    loadingSwiper,
    firstLoadSwiper,
    hasMoreSwiper,
  } =
    useSelector((state) => state.explore);
  const prefetchInFlightRef = useRef(false);

  const [currentIndex, setCurrentIndex] = useState();
  const [lastDirection, setLastDirection] = useState();
  // used for outOfFrame closure
  const currentIndexRef = useRef(currentIndex);
  const childRefs = useRef([]);

  useEffect(() => {
    // إعادة تعيين الـ refs عند تحديث المستخدمين
    childRefs.current = Array(exploreUsersSwiper?.length)
      .fill(0)
      .map(() => React.createRef());
  }, [exploreUsersSwiper?.length]);

  const updateCurrentIndex = (val) => {
    setCurrentIndex(val);
    currentIndexRef.current = val;
  };

 

  const [formData, setFormData] = useState({
    search: "",
    preferredAgeRange: user?.preferredAgeRange,
    preferredGender: user?.preferredGender,
  });

  const [selectedUserForProfile, setSelectedUserForProfile] = useState(null);
  const [selectedCardIndex, setSelectedCardIndex] = useState(null);

  // set last direction and decrease current index
  const swiped = (direction, nameToDelete, index) => {
    console.log({
      swiped: direction,
      nameToDelete: nameToDelete,
      index: index,
      pageSwiper: pageSwiper,
      currentIndex: currentIndex,
    });

    setLastDirection(direction);
    updateCurrentIndex(index - 1);
    if (index === 0) {
      onSearchUsers({
        formData,
        page: pageSwiper + 1,
        sortBy: "recommended",
        withLoading: true,
      });
    }

    setTimeout(() => {
      setUserReaction({
        type: null,
        target: null,
      });
    }, 1000);
  };

  const onSearchUsers = useCallback(
    async ({ formData, page, sortBy, withLoading = true, index }) => {
      if (withLoading) {
        dispatch(setLoadingSwiper(true));
      }
      dispatch(setPageSwiper(page));
      dispatch(setFirstLoadSwiper(false));
      if (socket) {
        const res = await emitWithAck("searchUsers", {
          searchQuery: {
            ...formData,
          },
          page: page,
          size: PAGE_SIZE,
          sortBy,
          screen: "swipe",
        });
        handleSearchUsers(res, index, page);
      }
    },
    [user?._id, socket, emitWithAck, exploreUsersSwiper]
  );

  const handleSearchUsers = (res, index, requestedPage = 1) => {
    const newData = [...(res.data.length > 0 ? res.data : [])];
    const uniqueData =
      requestedPage > 1
        ? uniqBy([...exploreUsersSwiper, ...newData], "_id")
        : uniqBy([...newData], "_id");

    dispatch(setExploreUsersSwiper([...uniqueData]));
    dispatch(setHasMoreSwiper(res.total > uniqueData.length));
    dispatch(setLoadingSwiper(false));
    if (typeof index === "number") {
      setCurrentIndex(index);
    } else if (requestedPage <= 1) {
      setCurrentIndex(uniqueData.length - 1);
    }
  };

  // useEffect(() => {
  //   onSearchUsers({
  //     formData,
  //     page: pageSwiper,
  //     sortBy: "newest",
  //     withLoading: false,
  //   });

  //   return () => {
  //     dispatch(setExploreUsersSwiper([]));
  //     dispatch(setPageSwiper(1));
  //     dispatch(setLoadingSwiper(false));
  //   };
  // }, []);

  useEffect(() => {
    if (exploreUsersSwiper.filter((item) => !item.swipe).length === 0) {
      console.log("🔄 جلب مستخدمين جدد تلقائيًا");

      onSearchUsers({
        formData,
        page: pageSwiper + 1,
        sortBy: "recommended",
        withLoading: true,
      });
    }
  }, [exploreUsersSwiper]);

  useEffect(() => {
    if (!socket || loadingSwiper) return;
    const hasCards = exploreUsersSwiper.some((item) => !item?.swipe);
    if (!hasCards) {
      onSearchUsers({
        formData,
        page: Math.max(pageSwiper, 1),
        sortBy: "recommended",
        withLoading: true,
      });
    }
  }, [socket]);

  useEffect(() => {
    if (!socket || loadingSwiper || prefetchInFlightRef.current || !hasMoreSwiper) {
      return;
    }
    const remainingCards = exploreUsersSwiper.filter((item) => !item?.swipe).length;
    if (remainingCards > SWIPE_PREFETCH_THRESHOLD) {
      return;
    }
    prefetchInFlightRef.current = true;
    onSearchUsers({
      formData,
      page: pageSwiper + 1,
      sortBy: "recommended",
      withLoading: false,
    }).finally(() => {
      prefetchInFlightRef.current = false;
    });
  }, [exploreUsersSwiper, loadingSwiper, pageSwiper, socket, hasMoreSwiper, formData]);

  // increase current index and show card
  const goBack = async () => {
    const newIndex = currentIndex + 1;
    updateCurrentIndex(newIndex);
    const cardRef = childRefs.current[newIndex]?.current;
    if (cardRef) {
      await cardRef.restoreCard();
    }
  };

  const likeUser = async (item) => {
    try {
      const res = await emitWithAck("likeUser", {
        target: item?.target,
      });
      console.log({ res });
      if (res?.action === "add") {
        dispatch(addSenderReaction(res?.data));
      }
    } catch (error) {
      console.log(error);
    }
  };

  const dislikeUser = async (item) => {
    try {
      const res = await emitWithAck("dislikeUser", {
        target: item?.target,
      });
      console.log({ res });
      if (res?.action === "remove" && res?.like) {
        dispatch(removeSenderReaction(res?.like));
      }
    } catch (error) {
      console.log(error);
    }
  };


  const handleSwipe = (direction, card) => {
    console.log("Swiped", direction, card._id);
    dispatch(
      setExploreUsersSwiper(
        exploreUsersSwiper.map((item) =>
          item._id == card._id ? { ...item, swipe: direction } : item
        )
      )
    );
    if (direction === "right") {
      likeUser({
        target: card?._id,
      });
    } else {
      dislikeUser({
        target: card?._id,
      });
    }
  };

  const currentCardRef = useRef(null);
  const [isSwiping, setIsSwiping] = useState(false);

  const openProfileFromCard = useCallback((card, index) => {
    setSelectedUserForProfile(card);
    setSelectedCardIndex(index);
    if (typeof index === "number") {
      setCurrentIndex(index);
    }
  }, []);

  const closeProfileModal = useCallback(() => {
    setSelectedUserForProfile(null);
    if (typeof selectedCardIndex === "number") {
      setCurrentIndex(selectedCardIndex);
    }
  }, [selectedCardIndex]);

  // const handleUndo = () => {
  //   const last = history[0];
  //   if (!last) return;
  //   setExploreUsersSwiper((prev) => [last, ...prev]);
  //   setHistory((prev) => prev.slice(1));
  // };

  return (
    <>
      <Modal
        showModal={!!selectedUserForProfile}
        setShowModal={(val) => {
          if (!val) closeProfileModal();
        }}
        onCancel={closeProfileModal}
      >
        <ProfileScreen
          userId={selectedUserForProfile?._id}
          onClose={closeProfileModal}
        />
      </Modal>

      <Popup
        showModal={showLoactionRedirection}
        setShowModal={setShowLoactionRedirection}
        swithColor
        onClick={() => {
          router.push("/update-profile?active=location&from=swiper");
          setShowLoactionRedirection(false);
        }}
        onCancel={() => setShowLoactionRedirection(false)}
      >
        <Text
          className={`text-base text-center text-slate-800 dark:text-slate-200`}
        >
          {t("addFriendScreen.setYourLocation")}
        </Text>
      </Popup>

      <View
        className="flex-1 w-full linker-w bg-[#dee4e6] dark:bg-[#12141b]"
      >
        <ExploreModeTabs
          isDarkColorScheme={isDarkColorScheme}
          items={[
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
                  user?.location?.coordinates?.[0] === 0 ||
                  user?.location?.coordinates?.[1] === 0 ||
                  user?.location?.coordinates?.[0] === null ||
                  user?.location?.coordinates?.[1] === null
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
          ]}
        />
        <View className="flex-1 overflow-hidden pb-0">
          {/* {loadingSwiper ? (
            <View
              className="absolute top-0 left-0 z-10 items-center justify-center flex-1 w-full h-full bg-[#f6f8f9] dark:bg-main"
            >
              <ActivityIndicator
                size="large"
                color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
              />
            </View>
          ) : (
          
            ))
          )} */}
          {exploreUsersSwiper.filter((item) => item.swipe === null || !item.swipe)
            .length === 0 ? (
            <View className="absolute inset-0 items-center justify-center">
              <ActivityIndicator
                size="large"
                color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
              />
            </View>
          ) : (
            exploreUsersSwiper
              .filter((item) => item.swipe === null || !item.swipe)
              .slice(0, 1)
              .map((card, index) => (
                <View key={card._id} className="absolute inset-0 overflow-hidden">
                  <SwipeCard
                    key={card.id}
                    item={card}
                    onSwipe={handleSwipe}
                    ref={currentCardRef}
                    onSwipeStart={() => console.log("🟡 Swipe started")}
                    onSwipeEnd={() => console.log("✅ Swipe ended")}
                    isSwiping={isSwiping}
                    setIsSwiping={setIsSwiping}
                    handleSwipe={handleSwipe}
                    currentIndex={exploreUsersSwiper.findIndex((u) => u?._id === card?._id)}
                    onOpenProfile={openProfileFromCard}
                  />
                  {index === 0 && loadingSwiper && (
                    <View className="absolute top-0 left-0 z-10 items-center justify-center flex-1 w-full h-full">
                      <ActivityIndicator size="large" color={"#dee4e6"} />
                    </View>
                  )}
                </View>
              ))
          )}

        </View>
      </View>
    </>
  );
};

export default Swiper;
