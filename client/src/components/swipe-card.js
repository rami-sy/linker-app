import React, {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  Dimensions,
  Text,
  View,
  ImageBackground,
  TouchableOpacity,
  Image,
  StyleSheet,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
  runOnJS,
  useDerivedValue,
} from "react-native-reanimated";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Constants from "expo-constants";
import UserImage from "./user-image";
import { useDispatch, useSelector } from "react-redux";
import { SocketContext } from "../contexts/socket.context";
import Button from "./button";
import UserName from "./user-name";
import TimeAgo from "./time-ago";
import { useTranslation } from "react-i18next";
import MIcon from "react-native-vector-icons/MaterialIcons";
import FeIcon from "react-native-vector-icons/Feather";
import Like from "../../assets/like.png";
import Nope from "../../assets/nope.png";
import { setExploreUsersSwiper } from "../redux/exploreSlice";
import { useColorScheme } from "~/lib/useColorScheme";
import ExploreProfileActionBar from "./explore/explore-profile-action-bar";

const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.125;
const EXIT_DISTANCE = SCREEN_WIDTH * 1.35;
const EXIT_DURATION_MS = 560;
const RESTORE_DURATION_MS = 320;
const BADGE_TOP = 88;
const BADGE_SIDE = 20;
const MAX_REASON_BADGES = 2;

const SwipeableCard = forwardRef(
  (
    { item, onSwipe, onSwipeStart, onSwipeEnd, isSwiping, setIsSwiping, handleSwipe, currentIndex, onOpenProfile },
    ref
  ) => {
    const { isDarkColorScheme } = useColorScheme();
    const { socket } = useContext(SocketContext);
    const { exploreUsersSwiper } = useSelector((state) => state.explore);
    const lastSwipedUser = useMemo(() => {
      if (!Array.isArray(exploreUsersSwiper) || exploreUsersSwiper.length === 0) {
        return null;
      }
      for (let i = exploreUsersSwiper.length - 1; i >= 0; i -= 1) {
        if (exploreUsersSwiper[i]?.swipe) {
          return exploreUsersSwiper[i];
        }
      }
      return null;
    }, [exploreUsersSwiper]);

    const translateX = useSharedValue(0);
    const rotateZ = useSharedValue(0);
    const { t } = useTranslation(); // Use translation hook
    const dispatch = useDispatch();
    const formatDistanceKm = (km) => {
      const value = Number(km || 0);
      if (!Number.isFinite(value) || value <= 0) return "1";
      if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
      return `${Math.round(value)}`;
    };
    const getReasonMeta = (reason) => {
      if (!reason?.key) return null;
      if (reason.key === "sharedInterests") {
        return {
          label: t("explore.reasons.sharedInterests", { count: reason.count || 1 }),
          icon: "star",
          badgeClassName:
            "bg-slate-100/95 border-slate-300 dark:bg-slate-800/85 dark:border-slate-600",
          textClassName: "text-slate-700 dark:text-slate-200",
        };
      }
      if (reason.key === "mutualFriends") {
        return {
          label: t("explore.reasons.mutualFriends", { count: reason.count || 1 }),
          icon: "users",
          badgeClassName:
            "bg-slate-100/95 border-slate-300 dark:bg-slate-800/85 dark:border-slate-600",
          textClassName: "text-slate-700 dark:text-slate-200",
        };
      }
      if (reason.key === "nearby") {
        return {
          label: t("explore.reasons.nearby", {
            km: formatDistanceKm(reason.km || 1),
          }),
          icon: "map-pin",
          badgeClassName:
            "bg-slate-100/95 border-slate-300 dark:bg-slate-800/85 dark:border-slate-600",
          textClassName: "text-slate-700 dark:text-slate-200",
        };
      }
      if (reason.key === "recentlyActive") {
        return {
          label: t("explore.reasons.recentlyActive"),
          icon: "clock",
          badgeClassName:
            "bg-slate-100/95 border-slate-300 dark:bg-slate-800/85 dark:border-slate-600",
          textClassName: "text-slate-700 dark:text-slate-200",
        };
      }
      return null;
    };
    const gentleReturnConfig = {
      damping: 18,
      stiffness: 180,
      mass: 0.9,
    };

    const animateCardOut = (direction) => {
      const toX = direction === "right" ? EXIT_DISTANCE : -EXIT_DISTANCE;
      rotateZ.value = withTiming(direction === "right" ? 14 : -14, {
        duration: EXIT_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      });
      translateX.value = withTiming(
        toX,
        {
          duration: EXIT_DURATION_MS,
          easing: Easing.out(Easing.cubic),
        },
        () => {
          runOnJS(onSwipe)(direction, item);
          if (onSwipeEnd) runOnJS(onSwipeEnd)();
          runOnJS(setIsSwiping)(false);
        }
      );
    };

    const openProfileDetails = () => {
      onOpenProfile?.(item, currentIndex);
    };

    const clearUndoFlag = (userId) => {
      dispatch(
        setExploreUsersSwiper(
          exploreUsersSwiper.map((user) =>
            user._id === userId ? { ...user, undoFrom: undefined } : user
          )
        )
      );
    };

    useEffect(() => {
      if (!item?.undoFrom) return;
      const fromX = item.undoFrom === "right" ? EXIT_DISTANCE : -EXIT_DISTANCE;
      const fromRotate = item.undoFrom === "right" ? 12 : -12;
      translateX.value = fromX;
      rotateZ.value = fromRotate;

      rotateZ.value = withTiming(0, {
        duration: RESTORE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      });
      translateX.value = withTiming(
        0,
        {
          duration: RESTORE_DURATION_MS,
          easing: Easing.out(Easing.cubic),
        },
        () => {
          runOnJS(clearUndoFlag)(item?._id);
        }
      );
    }, [item?._id, item?.undoFrom]);

    const panGesture = Gesture.Pan()
      .onBegin(() => {
        if (onSwipeStart) runOnJS(onSwipeStart)();
      })
      .onUpdate((event) => {
        if (isSwiping) return;
        translateX.value = event.translationX;
        rotateZ.value = event.translationX / 20;
      })
      .onEnd(() => {
        if (isSwiping) return;

        if (Math.abs(translateX.value) > SWIPE_THRESHOLD) {
          runOnJS(setIsSwiping)(true);
          const direction = translateX.value > 0 ? "right" : "left";
          animateCardOut(direction);
        } else {
          translateX.value = withSpring(0, gentleReturnConfig);
          rotateZ.value = withSpring(0, gentleReturnConfig);
          if (onSwipeEnd) runOnJS(onSwipeEnd)();
        }
      });

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: translateX.value },
        { rotateZ: `${rotateZ.value}deg` },
      ],
    }));

    useImperativeHandle(ref, () => ({
      swipe: (direction) => {
        if (isSwiping) return;
        if (onSwipeStart) onSwipeStart();
        setIsSwiping(true);
        animateCardOut(direction);
      },
      item,
    }));

    const handleSwipeManually = (direction) => {
      console.log("handleSwipeManually", direction);
      if (!item) return;
      ref.current?.swipe(direction);
    };

    const likeOpacity = useDerivedValue(() =>
      translateX.value > 0 ? Math.min(translateX.value / SWIPE_THRESHOLD, 1) : 0
    );

    const nopeOpacity = useDerivedValue(() =>
      translateX.value < 0
        ? Math.min(-translateX.value / SWIPE_THRESHOLD, 1)
        : 0
    );

    const likeStyle = useAnimatedStyle(() => ({
      opacity: likeOpacity.value,
      transform: [
        { scale: likeOpacity.value },
        { rotate: "40deg" },
      ],
    }));

    const nopeStyle = useAnimatedStyle(() => ({
      opacity: nopeOpacity.value,
      transform: [
        { scale: nopeOpacity.value },
        { rotate: "-40deg" },
      ],
    }));
    return (
      <>
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.cardFrame,
              animatedStyle,
            ]}
            className="bg-main border-2 border-sec shadow-sm items-center justify-center z-10"
          >
            <ImageBackground
              style={styles.coverImage}
              className="items-start justify-end z-20 shadow-lg"
              resizeMode="cover"
              source={{
                uri:
                  apiUrl +
                  (item?.images?.length > 0 ? item?.images?.[0]?.path : ""),
              }}
            >
              <Animated.Image
                source={Like}
                className="z-10"
                style={[
                  likeStyle,
                  {
                    position: "absolute",
                    top: BADGE_TOP,
                    left: BADGE_SIDE,
                    width: 300,
                    height: 200,
                  },
                ]}
              />

              <Animated.Image
                source={Nope}
                className="z-10"
                style={[
                  {
                    position: "absolute",
                    top: BADGE_TOP,
                    right: BADGE_SIDE,
                    width: 300,
                    height: 200,
                  },
                  nopeStyle,
                ]}
              />
              <View
                className="bg-[#f6f8f9a6] dark:bg-[#1e212ba6] rounded-2xl p-3 px-4 w-8/12 mb-56 mx-2"
                style={{
                  borderRadius: 16,
                  padding: 16,
                  minWidth: 360,
                }}
              >
                <View
                  className={`items-center self-start justify-between mt-3 flex-row`}
                >
                  <UserImage
                    text="text-5xl font-bold"
                    user={item}
                    size="w-24 h-24"
                    // onPress={onImagePress}
                    onPress={async () => {
                      openProfileDetails();
                    }}
                    statusSize="w-8 h-8 border-4 right-0 bottom-0 border-[#f6f8f9] dark:border-[#1e212b]"
                  />
                  <View className={`items-start justify-between mx-2`}>
                    <UserName
                      user={item}
                      className="text-xl mb-1 font-bold text-slate-800 dark:text-slate-200"
                    />

                    <View className={`flex-row items-center`}>
                      {item?.status && item?.status === "online" ? (
                        <Text className={`text-xs text-emerald-500`}>
                          {t("profileScreen.activeNow")}
                        </Text>
                      ) : item?.lastSeen ? (
                        <TimeAgo
                          date={item?.lastSeen}
                          className="text-xs text-slate-800 dark:text-slate-200"
                        />
                      ) : (
                        <Text
                          className="text-xs text-slate-800 dark:text-slate-200"
                        >
                          {t("profileScreen.lastSeenLongTimeAgo")}
                        </Text>
                      )}
                    </View>
                    {Array.isArray(item?.recommendationReasons) &&
                      item.recommendationReasons.length > 0 && (
                        <View className="mt-2 flex-row flex-wrap items-center">
                          {item.recommendationReasons
                            .slice(0, MAX_REASON_BADGES)
                            .map((reason, reasonIndex) => {
                              const meta = getReasonMeta(reason);
                              if (!meta?.label) return null;
                              return (
                                <View
                                  key={`${item?._id}-reason-${reason?.key}-${reasonIndex}`}
                                  className={`mr-1 mb-1 rounded-full border px-2 py-[3px] flex-row items-center gap-x-1 ${meta.badgeClassName}`}
                                >
                                  <FeIcon
                                    name={meta.icon}
                                    size={10}
                                    color={isDarkColorScheme ? "#e2e8f0" : "#0f172a"}
                                  />
                                  <Text
                                    className={`text-[11px] font-medium ${meta.textClassName}`}
                                  >
                                    {meta.label}
                                  </Text>
                                </View>
                              );
                            })}
                        </View>
                      )}
                  </View>
                </View>
                <ExploreProfileActionBar
                  user={item}
                  context="swiper"
                  onViewProfile={openProfileDetails}
                  className="mt-4"
                />
              </View>
            </ImageBackground>

            <View className="buttons w-full absolute bottom-32 left-0 right-0 flex-row items-end justify-between gap-x-2 px-3 z-20">
            <View className="flex-row items-start justify-between gap-x-6  ">
              <TouchableOpacity
                style={{ backgroundColor: exploreUsersSwiper.filter(user => !user.swipe).length === 0 ? "#c3c4d3" : null }}
                disabled={exploreUsersSwiper.filter(user => !user.swipe).length === 0}
                onPress={() => {
                  ref.current.swipe("left")
                }}
                className={`items-center justify-center h-14 w-14 mx-1 shadow-sm rounded-full bg-rose-600`}
              >
                <MIcon
                  name="swipe-left"
                  size={35}
                  color="#dee4e6"
                />
              </TouchableOpacity>
              {/* Show undo button if there is any swiped user */}
              {lastSwipedUser && (
                <TouchableOpacity
                  onPress={async () => {
                    if (lastSwipedUser?.swipe) {
                      dispatch(
                        setExploreUsersSwiper(
                          exploreUsersSwiper.map((user) => {
                            if (user._id === lastSwipedUser?._id && user.swipe) {
                              return {
                                ...user,
                                swipe: undefined,
                                undoFrom: lastSwipedUser?.swipe,
                              };
                            }
                            return user;
                          })
                        )
                      );

                      // Undo the like/dislike action on the server
                      await socket.emitWithAck("undoLikeOrDislike", {
                        target: lastSwipedUser?._id,
                      });
                    }
                  }}
                  className={`items-center justify-center h-14 w-14 mx-1 shadow-sm rounded-full bg-papaya`}
                >
                  <MIcon
                    name="undo"
                    size={35}
                    color="#12a4a"
                  />
                </TouchableOpacity>
               )} 
            </View>

            <TouchableOpacity
              style={{ backgroundColor: exploreUsersSwiper.filter(user => !user.swipe).length === 0 ? "#c3c4d3" : null }}
              disabled={exploreUsersSwiper.filter(user => !user.swipe).length === 0}
              onPress={() => {
                ref.current.swipe("right")
              }}
              className={`items-center justify-center h-14 w-14 mx-1 shadow-sm rounded-full bg-emerald-600`}
            >
              <MIcon
                name="swipe-right"
                size={35}
                color="#dee4e6"
              />
            </TouchableOpacity>
          </View>

          </Animated.View>
        </GestureDetector>


      </>
    );
  }
);

SwipeableCard.displayName = "SwipeableCard";

const styles = StyleSheet.create({
  cardFrame: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
});

export default SwipeableCard;
