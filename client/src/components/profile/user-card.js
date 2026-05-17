import {
  View,
  Text,
  TouchableOpacity,
  I18nManager,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import React, { useContext, useEffect, useState } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import UserImage from "../user-image";
import UserName from "../user-name";
import TimeAgo from "../time-ago";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { router, useLocalSearchParams } from "expo-router";
import MCIcon from "react-native-vector-icons/MaterialCommunityIcons";
import MsgIcon from "../../../assets/icons/msg-icon";
import { useFriendAction } from "../../sockets/friend";
import { addRoom, clearRoom, setRoom } from "../../redux/chatSlice";
import { SocketContext } from "../../contexts/socket.context";
import Button from "../button";
import UserInteractiveIcon from "../user/user-interactive-icon";
import {
  addSenderReaction,
  removeSenderReaction,
  setUserProfile,
} from "../../redux/userSlice";
import { Loader } from "lucide-react-native";
import ChatLockPasswordModal from "../chat/chat-lock-password-modal";
import { addAlert } from "~/src/redux/alertSlice";
import { useColorScheme } from "../../../lib/useColorScheme";
import { ProfileGlyph } from "./profile-icon-map";
import ExploreProfileActionBar from "../explore/explore-profile-action-bar";
import { EXPLORE_PROFILE_POPUP_CONTEXTS } from "../../hooks/useExploreSayHi";

const UserCard = ({
  onImagePress,
  w = "w-full md:w-1/2 lg:w-1/2",
  onCancel,
  backIconName = null,
  viewProfile = false,
  viewProfileFrom = null,
  className = "",
  currentUser = false,
  backButton = true,
  onBackPress = null,
  scrolledEnough = false,
  enableAnimation = false,
  onClose = null,
  /** When true: flat layout for use inside shared Popup (no extra card chrome / duplicate close) */
  inPopup = false,
}) => {
  const { height: windowHeight } = useWindowDimensions();
  const { isDarkColorScheme } = useColorScheme();
  const { userProfile, user, senderReactions } = useSelector(
    (state) => state.users
  );
  const { socket } = useContext(SocketContext);
  const { rooms, roomId } = useSelector((state) => state.chats);
  const { t } = useTranslation();
  const { from } = useLocalSearchParams();
  const dispatch = useDispatch();
  const { handleSendFriendRequest, handleCancelFriendRequest } =
    useFriendAction();

  const [lockModal, setLockModal] = useState(null);
  const [password, setPassword] = useState("");
  const handleMsg = async (item) => {
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
            });
          }
        }
      }
    );
  };

  const handleReaction = async (item, reaction = "like") => {
    try {
      const res = await socket.emitWithAck("reactToUser", {
        target: item?._id,
        reaction: reaction,
        targetModel: "User",
      });
      if (res?.action === "remove") {
        dispatch(removeSenderReaction(res?.data));
        dispatch(
          setUserProfile({
            ...userProfile,
            fans: userProfile?.fans?.filter(
              (f) => f?.liker !== res?.data?.liker
            ),
          })
        );
      } else if (res?.action === "add") {
        dispatch(addSenderReaction(res?.data));
        dispatch(
          setUserProfile({
            ...userProfile,
            fans: [
              ...userProfile?.fans,
              {
                ...res?.data,
              },
            ],
          })
        );
      }
    } catch (_) {}
  };

  const opacity = useSharedValue(0); // لعمل تأثير الفيد إن عند التحميل
  const translateY = useSharedValue(50); // لتحريك العنصر عند الدخول
  const disappear = useSharedValue(0);

  // 💡 عند تحميل البطاقة، قم بتشغيل الأنيميشن
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 500 }); // تدرج الظهور
    translateY.value = withTiming(0, { duration: 500 }); // تحريك للأعلى
    disappear.value = withTiming(1, { duration: 500 });
  }, []);

  // 💡 عند التمرير، تغيير الأنيميشن بناءً على `scrolledEnough`
  useEffect(() => {
    if (enableAnimation) {
      translateY.value = withTiming(scrolledEnough ? -10 : 0, {
        duration: 300,
      });
      opacity.value = withTiming(scrolledEnough ? 0.8 : 1, { duration: 300 });
      disappear.value = withTiming(scrolledEnough ? 0 : 1, { duration: 300 });
    }
  }, [scrolledEnough, enableAnimation]);
  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    };
  });

  const hScreen = Dimensions.get("window").height;
  const animatedDisappearStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(disappear.value, { duration: 300 }), // تدرج في الاختفاء
      transform: [{ scale: withTiming(disappear.value, { duration: 300 }) }], // تصغير تدريجي
      maxHeight: withTiming(disappear.value === 0 ? 0 : hScreen - 100, {
        duration: 300,
      }), // تقليل الارتفاع تدريجياً
      overflow: "hidden", // التأكد من عدم عرض المحتوى عند تصغير العنصر
    };
  });

  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

  function CardBodyWrapper({ children }) {
    if (!inPopup) return <React.Fragment>{children}</React.Fragment>;
    return (
      <ScrollView
        style={{
          maxHeight: Math.min(windowHeight * 0.62, 520),
          width: "100%",
          alignSelf: "stretch",
        }}
        contentContainerStyle={{
          paddingBottom: 16,
          width: "100%",
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return userProfile?._id ? (
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

      <Animated.View
        className={
          inPopup
            ? `w-full ${w} ${className}`
            : `rounded-2xl p-3 px-4 ${w} ${className}`
        }
        style={[
          inPopup
            ? {
                backgroundColor: "transparent",
                paddingHorizontal: 0,
                paddingVertical: 0,
                borderRadius: 0,
              }
            : {
                backgroundColor: isDarkColorScheme ? "#1e212b" : "#f8fafb",
                borderRadius: 16,
                padding: 16,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: isDarkColorScheme ? 0.2 : 0.1,
                shadowRadius: 10,
                elevation: 4,
              },
          enableAnimation && animatedStyle,
        ]}
      >
        <CardBodyWrapper>
        <View className="mt-2 w-full flex-row items-start">
          <UserImage
            text="text-5xl font-bold"
            user={userProfile}
            size="w-24 h-24"
            onPress={onImagePress}
            statusSize="w-8 h-8 border-4 right-0 bottom-0 border-[#f6f8f9] dark:border-[#1e212b]"
          />
          <View className={`mx-2 min-w-0 flex-1 items-start justify-between`}>
            <UserName
              user={userProfile}
              maxLength={inPopup ? 48 : 12}
              className="text-xl mb-1 font-bold text-slate-800 dark:text-slate-200"
            />

            <View className={`flex-row items-center`}>
              {userProfile?.status && userProfile?.status === "online" ? (
                <Text className={`text-xs text-emerald-500`}>
                  {t("profileScreen.activeNow")}
                </Text>
              ) : userProfile?.lastSeen ? (
                <TimeAgo
                  date={userProfile?.lastSeen}
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
            <View className="mt-3 w-auto flex-row items-center justify-between gap-x-6 pr-2">
              {[
                { key: "fans", label: "Fans", value: userProfile?.fans?.length || 0 },
                {
                  key: "following",
                  label: "Following",
                  value: userProfile?.following?.length || 0,
                },
                {
                  key: "visitors",
                  label: "Visitors",
                  value: userProfile?.visitors?.length || 0,
                },
              ].map((item) => (
                <View key={item.key} className="items-center">
                  <Text className="font-semibold text-slate-900 dark:text-slate-100">
                    {item.value}
                  </Text>
                  <Text
                    className={`text-sm ${
                      isDarkColorScheme ? "text-slate-200" : "text-slate-800"
                    }`}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          {backButton && (
            <TouchableOpacity
              className="mt-0.5 shrink-0 p-1"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => {
                if (onClose) {
                  onClose();
                } else if (onBackPress) {
                  onBackPress();
                } else {
                  if (onCancel) {
                    onCancel();
                  } else {
                    if (router.canGoBack()) {
                      if (from) {
                        router.push({
                          pathname: `/${from}`,
                          params: { userId: userProfile?._id, from: "profile" },
                        });
                      } else {
                        router.back();
                      }
                    } else {
                      router.push("/chats");
                    }
                  }
                }
              }}
            >
              {isRTL ? (
                <ProfileGlyph
                  name={backIconName || "chevron-left"}
                  size={35}
                  color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  weight="bold"
                />
              ) : (
                <ProfileGlyph
                  name={backIconName || "chevron-right"}
                  size={35}
                  color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  weight="bold"
                />
              )}
            </TouchableOpacity>
          )}
        </View>
        {/* {!scrolledEnough && ( */}
        <Animated.View style={[enableAnimation && animatedDisappearStyle]}>
          {!currentUser && (
            <View className={` w-full  mt-3 `}>
              {userProfile?.bio && (
                <View
                  className={`flex-row items-center mt-4 gap-x-2 opacity-70 mb-2`}
                >
                  <MCIcon
                    name="format-quote-close"
                    size={50}
                    className={`absolute ${
                      isRTL ? "right-0" : "left-0"
                    } -top-3`}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />

                  <Text
                    className={`text-base italic ${
                      isDarkColorScheme ? "text-slate-200" : "text-slate-800"
                    }`}
                  >
                    {`           "${
                      userProfile?.bio.length > 120
                        ? userProfile?.bio.slice(0, 120) + "..."
                        : userProfile?.bio
                    }"`}
                  </Text>
                </View>
              )}

              {userProfile?.email && (
                <View className={`mt-2 min-w-0 flex-row items-center gap-x-2`}>
                  <ProfileGlyph
                    name="mail"
                    size={25}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                    weight="bold"
                  />
                  <Text
                    className={`min-w-0 flex-1 shrink text-base ${
                      isDarkColorScheme ? "text-slate-200" : "text-slate-800"
                    }`}
                    numberOfLines={inPopup ? undefined : 1}
                  >
                    {inPopup
                      ? userProfile?.email
                      : userProfile?.email.length > 20
                        ? userProfile?.email.slice(0, 20) + "..."
                        : userProfile?.email}
                  </Text>
                </View>
              )}
              {userProfile?.phoneNumber && (
                <View className={`flex-row items-center mt-2 gap-x-2`}>
                  <ProfileGlyph
                    name="phone"
                    size={25}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                    weight="bold"
                  />
                  <Text
                    className={`text-base ${
                      isDarkColorScheme ? "text-slate-200" : "text-slate-800"
                    }`}
                  >
                    {userProfile?.phoneNumber}
                  </Text>
                </View>
              )}
            </View>
          )}

          {(!currentUser || userProfile?._id !== user?._id) && (
            <View
              className={`flex-row flex-wrap items-center justify-center mb-1 mt-6 w-full gap-x-4 gap-y-2 rounded-2xl`}
            >
              <TouchableOpacity
                className="flex-row items-center justify-center w-12 h-12 shadow-sm bg-papaya dark:bg-placehoder rounded-2xl"
                onPress={() => handleReaction(userProfile, "like")}
              >
                <MCIcon
                  name={
                    senderReactions?.find(
                      (reaction) =>
                        reaction?.target === userProfile?._id &&
                        reaction?.targetModel === "User" &&
                        reaction?.reaction === "like"
                    )
                      ? "cards-heart"
                      : "cards-heart-outline"
                  }
                  size={30}
                  style={{
                    color: senderReactions?.find(
                      (reaction) =>
                        reaction?.target === userProfile?._id &&
                        reaction?.targetModel === "User" &&
                        reaction?.reaction === "like"
                    )
                      ? "#ef233c"
                      : isDarkColorScheme
                        ? "#dee4e6"
                        : "#012a4a",
                  }}
                />
              </TouchableOpacity>
              {user?.friends?.includes?.(userProfile?._id) ? (
                <TouchableOpacity
                  className="flex-row items-center justify-center w-12 h-12 shadow-sm bg-papaya dark:bg-placehoder rounded-2xl"
                >
                  <UserInteractiveIcon iconSize={23} iconSecondarySize={null} />
                </TouchableOpacity>
              ) : user?.outgoingFriendRequests?.includes?.(userProfile?._id) ? (
                <TouchableOpacity
                  className="flex-row items-center justify-center w-12 h-12 shadow-sm bg-papaya dark:bg-placehoder rounded-2xl"
                  onPress={() =>
                    handleCancelFriendRequest({
                      targetUserId: userProfile?._id,
                    })
                  }
                >
                  <UserInteractiveIcon
                    iconName="minus"
                    iconSize={23}
                    iconSecondarySize={17}
                    iconClassName="absolute -top-1 -right-2"
                  />
                </TouchableOpacity>
              ) : userProfile?.canAdd ? (
                <TouchableOpacity
                  className="flex-row items-center justify-center w-12 h-12 shadow-sm bg-papaya dark:bg-placehoder rounded-2xl"
                  onPress={() =>
                    handleSendFriendRequest({
                      targetUserId: userProfile?._id,
                    })
                  }
                  disabled={!userProfile?.canAdd}
                >
                  <UserInteractiveIcon
                    iconName="plus"
                    iconSize={23}
                    iconSecondarySize={17}
                    iconClassName="absolute -top-1 -right-2"
                  />
                </TouchableOpacity>
              ) : null}

              {userProfile?.canMsg && (
                <TouchableOpacity
                  className="flex-row items-center justify-center w-12 h-12 shadow-sm bg-papaya dark:bg-placehoder rounded-2xl"
                  onPress={() => handleMsg(userProfile)}
                >
                  <MsgIcon width={25} height={25} />
                </TouchableOpacity>
              )}
            </View>
          )}
          {viewProfile &&
            (inPopup ? (
              EXPLORE_PROFILE_POPUP_CONTEXTS.includes(viewProfileFrom) ? (
                <ExploreProfileActionBar
                  user={userProfile}
                  context={viewProfileFrom}
                  onViewProfile={() => {
                    router.push({
                      pathname: `/profile/${userProfile?._id}`,
                      params: { from: viewProfileFrom },
                    });
                  }}
                  className="mt-4"
                />
              ) : (
                <TouchableOpacity
                  className="mt-4 h-12 w-full self-stretch rounded-2xl items-center justify-center bg-[#0a97b9]"
                  activeOpacity={0.85}
                  style={{ alignSelf: "stretch" }}
                  onPress={() => {
                    router.push({
                      pathname: `/profile/${userProfile?._id}`,
                      params: { from: viewProfileFrom },
                    });
                  }}
                >
                  <Text className="text-base font-semibold text-white">
                    {t("header.viewProfile")}
                  </Text>
                </TouchableOpacity>
              )
            )
            : (
              <Button
                label={t("header.viewProfile")}
                mb="mb-0 mt-3"
                w="w-full"
                onPress={() => {
                  router.push({
                    pathname: `/profile/${userProfile?._id}`,
                    params: { from: viewProfileFrom },
                  });
                }}
              />
            ))}
        </Animated.View>
        {/* )} */}
        </CardBodyWrapper>
      </Animated.View>
    </>
  ) : (
    <View
      className={`bg-[#f6f8f9] dark:bg-[#1e212b] rounded-2xl p-3 px-6 shadow-md ${w} ${className} min-h-[180px]`}
      style={{
        height: 180,
      }}
    >
      <View className="items-center justify-center flex-1">
        <ActivityIndicator
          size="large"
          color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
        />
      </View>
    </View>
  );
};

export default UserCard;
