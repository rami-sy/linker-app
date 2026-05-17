import { Text, View, Platform, TouchableOpacity } from "react-native";
import React, { useContext, useMemo } from "react";
import { Link, router, Slot, useSegments } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import { useColorScheme } from "~/lib/useColorScheme";
import UserImage from "../../../../../src/components/user-image";
import * as Haptics from "expo-haptics";
import { setUserProfile } from "../../../../../src/redux/userSlice";
import { SocketContext } from "../../../../../src/contexts/socket.context";
import FeIcon from "react-native-vector-icons/Feather";
import {
  getNavPalette,
  getShellShadowStyle,
} from "../../../../../src/components/navigation/nav-theme";

export const unstable_settings = {
  initialRouteName: "index",
};

const countUnreadLoadedMessages = (room, userId) => {
  if (!room?.messages || !userId) return 0;
  const uid = String(userId);
  return Object.values(room.messages).filter((msg) => {
    if (!msg || msg.call) return false;
    const rawUser = msg?.user;
    const ownByFlag = !!msg?.__clientIsOwn;
    const ownByString = rawUser != null && String(rawUser) === uid;
    const ownByNested =
      rawUser && typeof rawUser === "object" && String(rawUser?._id) === uid;
    if (ownByFlag || ownByString || ownByNested) return false;
    const seenByCurrentUser = (msg?.seenBy || []).some(
      (seenUserId) => String(seenUserId) === uid
    );
    return !seenByCurrentUser;
  }).length;
};

const TabsLayout = () => {
  const { isDarkColorScheme } = useColorScheme();
  const segments = useSegments();
  const { rooms } = useSelector((state) => state.chats);
  const { activeTab } = useSelector((state) => state.explore);
  const { user } = useSelector((state) => state.users);
  const dispatch = useDispatch();
  const { socket } = useContext(SocketContext);

  const chatsUnreadTotal = useMemo(
    () =>
      rooms.reduce(
        (acc, room) => acc + countUnreadLoadedMessages(room, user?._id),
        0
      ),
    [rooms, user?._id]
  );

  const handlePress = async () => {
    if (Platform.OS !== "web") {
      await Haptics.selectionAsync(Haptics.ImpactFeedbackStyle.Rigid);
    }
  };

  const currentSegment = segments?.[4];
  const palette = getNavPalette(isDarkColorScheme);
  const isLiveActive = currentSegment?.includes("live-streams");
  const isChatsActive = currentSegment === "chats" || currentSegment === undefined;
  const isExploreActive =
    currentSegment?.includes("explore") || currentSegment?.includes("swiper");
  const isUserActive = currentSegment === "user";

  const tabs = [
    {
      key: "live-streams",
      href: "/live-streams",
      icon: "radio",
      active: isLiveActive,
      onPress: handlePress,
    },
    {
      key: "chats",
      href: "/chats",
      icon: "message-circle",
      active: isChatsActive,
      onPress: handlePress,
      badge: chatsUnreadTotal,
    },
    {
      key: "explore",
      href: activeTab || "/explore",
      icon: "search",
      active: isExploreActive,
      onPress: handlePress,
    },
  ];

  return (
    <>
      <Slot />
      <View className="absolute bottom-2 left-0 right-0 z-20 items-center px-3 pb-1">
        <View
          className="h-16 w-full flex-row items-center justify-between rounded-[28px] px-1.5 md:w-1/2 lg:w-1/2"
          style={{
            backgroundColor: palette.shellBg,
            ...getShellShadowStyle(isDarkColorScheme, 10),
          }}
        >
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className="flex flex-row items-center justify-center flex-1 h-full"
              onPress={tab.onPress}
            >
              <View
                className={`relative h-11 w-full max-w-[72px] items-center justify-center rounded-2xl ${
                  tab.active ? palette.activePill : ""
                }`}
              >
                <FeIcon
                  name={tab.icon}
                  size={29}
                  color={tab.active ? palette.activeTint : palette.inactiveTint}
                />
                {!!tab.badge && (
                  <View className="absolute -right-1.5 top-0 h-5 min-w-[20px] rounded-full bg-[#0a97b9] px-1 flex-row items-center justify-center">
                    <Text className="text-[10px] font-semibold text-center text-slate-100">
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </Text>
                  </View>
                )}
              </View>
            </Link>
          ))}

          <TouchableOpacity
            className="flex flex-row items-center justify-center flex-1 h-full"
            onPress={async () => {
              handlePress();
              dispatch(setUserProfile(null));

              const res = await socket.emitWithAck("getOneUser", {
                targetUserId: user?._id,
              });

              dispatch(setUserProfile(res.data));
              router.push({ pathname: "/user" });
            }}
          >
            <View
              className={`h-11 w-full max-w-[72px] items-center justify-center rounded-2xl ${
                isUserActive ? palette.activePill : ""
              }`}
            >
              <UserImage
                onPress={null}
                showStatus={false}
                border={isUserActive ? "border-2" : "border-0"}
                size="h-10 w-10"
              />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
};

export default TabsLayout;

