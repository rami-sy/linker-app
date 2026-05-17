import {
  I18nManager,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Modal from "../../../../../src/components/modal";
import React, {
  lazy,
  useContext,
  useEffect,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import ImageViewer from "react-native-image-zoom-viewer";
import FeIcon from "react-native-vector-icons/Feather";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import MenuButton from "../../../../../src/components/user/menu-button";
import SuspenseWrapper from "../../../../../src/hoc/suspense-wrapper";
import { SocketContext } from "../../../../../src/contexts/socket.context";
import { router } from "expo-router";
import { fetchDeviceId } from "../../../../../src/api/me";
import Head from "expo-router/head";
import UserCard from "../../../../../src/components/profile/user-card";
import { setUserProfile } from "../../../../../src/redux/userSlice";
import { useColorScheme } from "~/lib/useColorScheme";
// import UserIcon from "../../../../assets/icons/user-icon";

const DeleteAccountPopup = lazy(() =>
  import("../../../../../src/components/user/delete-account-popup")
);
const DeActiveAccountPopup = lazy(() =>
  import("../../../../../src/components/user/deactive-account-popup")
);
const ChangeLanguagePopup = lazy(() =>
  import("../../../../../src/components/user/change-language-popup")
);
const NotificationPopup = lazy(() =>
  import("../../../../../src/components/user/notification-popup")
);
const ThemePopup = lazy(() =>
  import("../../../../../src/components/user/theme-popup")
);
const AboutPopup = lazy(() =>
  import("../../../../../src/components/user/about-popup")
);

const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;

const ICON_TONES = {
  cyan: { iconColor: "#06b6d4", iconBg: "rgba(6, 182, 212, 0.32)" },
  blue: { iconColor: "#38bdf8", iconBg: "rgba(56, 189, 248, 0.32)" },
  violet: { iconColor: "#8b5cf6", iconBg: "rgba(139, 92, 246, 0.34)" },
  emerald: { iconColor: "#10b981", iconBg: "rgba(16, 185, 129, 0.32)" },
  amber: { iconColor: "#f59e0b", iconBg: "rgba(245, 158, 11, 0.32)" },
  rose: { iconColor: "#f43f5e", iconBg: "rgba(244, 63, 94, 0.30)" },
};

const User = () => {
  const { t } = useTranslation();
  const { user, userProfile } = useSelector((state) => state.users);
  const { prevScreens } = useSelector((state) => state.app);
  const [showImageModal, setShowImageModal] = useState(false);
  const { socket } = useContext(SocketContext);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showDeActiveAccount, setShowDeActiveAccount] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

  const [showNotificationPopup, setShowNotificationPopup] = useState(false);
  const [showThemePopup, setShowThemePopup] = useState(false);
  const [showAboutPopup, setShowAboutPopup] = useState(false);
  const { isDarkColorScheme, colorScheme } = useColorScheme();
  const dispatch = useDispatch();
  const loadUserProfile = async () => {
    if (user?._id && !userProfile?._id) {
      const res = await socket.emitWithAck("getOneUser", {
        targetUserId: user?._id,
      });
      dispatch(setUserProfile(res.data));
    }
  };

  useEffect(() => {
    loadUserProfile();
  }, [user?._id, userProfile?._id]);

  return (
    <>
      <Head>
        <title>User | Linker</title>
        <meta
          name="description"
          content="User profile and settings. Linker is the best way to connect with your friends. It's a social media platform that allows you to connect with your friends and family."
        />
      </Head>
      <SuspenseWrapper>
        {showDeleteAccount && (
          <DeleteAccountPopup
            setShowDeleteAccount={setShowDeleteAccount}
            showDeleteAccount={showDeleteAccount}
          />
        )}
        {showDeActiveAccount && (
          <DeActiveAccountPopup
            showDeActiveAccount={showDeActiveAccount}
            setShowDeActiveAccount={setShowDeActiveAccount}
          />
        )}
        {showLanguageModal && (
          <ChangeLanguagePopup
            showLanguageModal={showLanguageModal}
            setShowLanguageModal={setShowLanguageModal}
          />
        )}
        {showNotificationPopup && (
          <NotificationPopup
            showNotificationPopup={showNotificationPopup}
            setShowNotificationPopup={setShowNotificationPopup}
          />
        )}
        {showThemePopup && (
          <ThemePopup
            showThemePopup={showThemePopup}
            setShowThemePopup={setShowThemePopup}
          />
        )}
        {showAboutPopup && (
          <AboutPopup
            showAboutPopup={showAboutPopup}
            setShowAboutPopup={setShowAboutPopup}
          />
        )}
      </SuspenseWrapper>
      <View
        className="h-screen w-full flex-1 flex-col items-stretch overflow-y-auto p-4 pb-20 pt-6 md:w-1/2 lg:w-1/2"
        style={{
          backgroundColor: isDarkColorScheme ? "#12141b" : "#dee4e6",
        }}
      >
        <Modal
          showModal={showImageModal}
          setShowModal={setShowImageModal}
          onCancel={() => setShowImageModal(false)}
          opacity="90"
          animationType="fade"
        >
          <View className="relative h-full w-full">
            <ImageViewer
              renderArrowLeft={() => null}
              renderArrowRight={() => null}
              index={0}
              imageUrls={user?.images?.map((image) => ({
                url: apiUrl + image.path,
              }))}
            />
            <TouchableOpacity
              onPress={() => setShowImageModal(false)}
              className="absolute right-4 top-4 z-30 rounded-full bg-black/45 p-2"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <FeIcon name="x" size={22} color="#f6f8f9" />
            </TouchableOpacity>
          </View>
        </Modal>

        <View className="mb-5 w-full self-stretch">
          <UserCard
            w="w-full"
            className="self-stretch"
            currentUser={true}
            onImagePress={() => {
              if (user?.images?.length > 0) {
                setShowImageModal(true);
              }
            }}
            // viewProfile={true}
            backButton={true}
            backIconName="eye"
            onBackPress={() => {
              router.push({
                pathname: `/profile/${userProfile?._id}`,
                params: { from: "user" },
              });
            }}
          />
        </View>
        <ScrollView 
          className={`w-full`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        >
          <View className="w-full flex-col items-stretch gap-y-1">
            <MenuButton
              isRTL={isRTL}
              buttonText={t("user.profile")}
              children={profileMenuItems(t, router)}
              IconName="user"
              {...ICON_TONES.cyan}
            />
            <MenuButton
              isRTL={isRTL}
              buttonText={t("general.friendsSectionTitle")}
              IconName="user-check"
              children={usersFriendsMenuItems(t, router)}
              {...ICON_TONES.sky}
            />
            <MenuButton
              isRTL={isRTL}
              buttonText={t("general.networkSectionTitle")}
              IconName="activity"
              children={usersNetworkMenuItems(t, router)}
              {...ICON_TONES.blue}
            />

            <MenuButton
              isRTL={isRTL}
              buttonText={t("user.privacy")}
              IconName="lock"
              children={privacyMenuItems(t, router)}
              {...ICON_TONES.violet}
            />
            <MenuButton
              isRTL={isRTL}
              IconName="shield"
              buttonText={t("user.account")}
              children={accountMenuItems(
                t,
                user,
                setShowDeActiveAccount,
                setShowDeleteAccount,
                router
              )}
              {...ICON_TONES.emerald}
            />

            <MenuButton
              isRTL={isRTL}
              IconName="settings"
              buttonText={t("user.settings")}
              children={settingsMenuItems(
                t,
                setShowLanguageModal,
                router,
                setShowNotificationPopup,
                setShowAboutPopup,
                setShowThemePopup,
                colorScheme
              )}
              {...ICON_TONES.amber}
            />

            <MenuButton
              isRTL={isRTL}
              IconName="log-out"
              buttonText={t("user.logout")}
              {...ICON_TONES.rose}
              onPress={async () => {
                const deviceId = await fetchDeviceId();
                socket.emit(
                  "userDisconnected",
                  {
                    deviceId: deviceId,
                  },
                  () => {
                    socket.disconnect();
                  }
                );
                router.push({
                  pathname: "/welcome",
                  params: {
                    forceLogout: true,
                  },
                });
              }}
            />
          </View>
        </ScrollView>
      </View>
    </>
  );
};

const profileMenuItems = (t, router) => [
  {
    buttonText: t("user.pictures"),
    IconName: "image",
    iconColor: "#22d3ee",
    iconBg: "rgba(34, 211, 238, 0.30)",
    onPress: () => {
      router.push("/update-profile?active=pictures");
    },
  },
  {
    buttonText: t("user.info"),
    IconName: "info",
    iconColor: "#38bdf8",
    iconBg: "rgba(56, 189, 248, 0.30)",
    onPress: () => {
      router.push("/update-profile?active=info");
    },
  },
  {
    buttonText: t("user.preferences"),
    IconName: "heart",
    iconColor: "#f472b6",
    iconBg: "rgba(244, 114, 182, 0.30)",
    onPress: () => {
      router.push("/update-profile?active=preferences");
    },
  },

  // {
  //   buttonText: t("user.lifestyle"),
  //   IconName: "activity",
  //   onPress: () => {

  //   },
  // },
  {
    buttonText: t("user.location"),
    IconName: "map-pin",
    iconColor: "#14b8a6",
    iconBg: "rgba(20, 184, 166, 0.30)",
    onPress: () => {
      router.push("/update-profile?active=location");
    },
  },
  // {
  //   buttonText: t("user.physicalAttributes"),
  //   IconName: "user",
  //   onPress: () => {

  //   },
  // },
  {
    buttonText: t("user.background"),
    IconName: "image",
    iconColor: "#a78bfa",
    iconBg: "rgba(167, 139, 250, 0.32)",
    onPress: () => {
      router.push("/update-profile?active=background");
    },
  },
  // {
  //   buttonText: t("user.familyPreferences"),
  //   IconName: "users",
  //   onPress: () => {

  //   },
  // },
  {
    buttonText: t("user.culturalSocialAttributes"),
    IconName: "users",
    iconColor: "#60a5fa",
    iconBg: "rgba(96, 165, 250, 0.32)",
    onPress: () => {
      router.push("/update-profile?active=culturalSocialAttributes");
    },
  },
  {
    buttonText: t("user.languages"),
    IconName: "globe",
    iconColor: "#34d399",
    iconBg: "rgba(52, 211, 153, 0.30)",
    onPress: () => {
      router.push("/update-profile?active=languages");
    },
  },
  {
    buttonText: t("user.interests"),
    IconName: "heart",
    iconColor: "#fb7185",
    iconBg: "rgba(251, 113, 133, 0.30)",
    onPress: () => {
      router.push("/update-profile?active=interests");
    },
  },
];

const usersFriendsMenuItems = (t, router) => [
  {
    buttonText: t("general.menuFriends"),
    IconName: "users",
    iconColor: "#38bdf8",
    iconBg: "rgba(56, 189, 248, 0.30)",
    onPress: () => {
      router.push("/users?tab=friends");
    },
  },
  {
    buttonText: t("general.menuSentRequests"),
    IconName: "message-circle",
    iconColor: "#34d399",
    iconBg: "rgba(52, 211, 153, 0.30)",
    onPress: () => {
      router.push("/users?tab=sent");
    },
  },
  {
    buttonText: t("general.menuReceivedRequests"),
    IconName: "message-square",
    iconColor: "#f59e0b",
    iconBg: "rgba(245, 158, 11, 0.32)",
    onPress: () => {
      router.push("/users?tab=received");
    },
  },
  {
    buttonText: t("general.menuBlockedUsers"),
    IconName: "shield",
    iconColor: "#f97316",
    iconBg: "rgba(249, 115, 22, 0.32)",
    onPress: () => {
      router.push("/users?tab=blocked");
    },
  },
];

const usersNetworkMenuItems = (t, router) => [
  {
    buttonText: t("general.menuFans"),
    IconName: "heart",
    iconColor: "#fb7185",
    iconBg: "rgba(251, 113, 133, 0.30)",
    onPress: () => {
      router.push("/users?tab=fans");
    },
  },
  {
    buttonText: t("general.menuFollowing"),
    IconName: "user",
    iconColor: "#22d3ee",
    iconBg: "rgba(34, 211, 238, 0.30)",
    onPress: () => {
      router.push("/users?tab=following");
    },
  },
  {
    buttonText: t("general.menuVisitors"),
    IconName: "eye",
    iconColor: "#a78bfa",
    iconBg: "rgba(167, 139, 250, 0.32)",
    onPress: () => {
      router.push("/users?tab=visitors");
    },
  },
];
const privacyMenuItems = (t, navigation) => [
  {
    buttonText: t("user.visibility"),
    IconName: "eye",
    iconColor: "#22d3ee",
    iconBg: "rgba(34, 211, 238, 0.30)",
    onPress: () => {
      router.push("/privacy/visibility");
    },
  },
  {
    buttonText: t("user.content"),
    IconName: "file-text",
    iconColor: "#38bdf8",
    iconBg: "rgba(56, 189, 248, 0.30)",
    onPress: () => {
      router.push("/privacy/content");
    },
  },
  {
    buttonText: t("user.interactions"),
    IconName: "message-square",
    iconColor: "#818cf8",
    iconBg: "rgba(129, 140, 248, 0.32)",
    onPress: () => {
      router.push("/privacy/interaction");
    },
  },
  {
    buttonText: t("user.networking"),
    IconName: "users",
    iconColor: "#34d399",
    iconBg: "rgba(52, 211, 153, 0.30)",
    onPress: () => {
      router.push("/privacy/network");
    },
  },
  {
    buttonText: t("callSettingsScreen.title") || "Call Settings",
    IconName: "phone",
    iconColor: "#f59e0b",
    iconBg: "rgba(245, 158, 11, 0.32)",
    onPress: () => {
      router.push("/privacy/call-settings");
    },
  },
  {
    buttonText: t("chatSettingsScreen.title") || "Chat Settings",
    IconName: "message-circle",
    iconColor: "#2dd4bf",
    iconBg: "rgba(45, 212, 191, 0.30)",
    onPress: () => {
      router.push("/privacy/chat-settings");
    },
  },
];

const accountMenuItems = (
  t,
  user,
  setShowDeActiveAccount,
  setShowDeleteAccount,
  router
) => [
  {
    buttonText: t("user.devices"),
    onPress: () => {
      router.push("/account/devices");
    },
    IconName: "smartphone",
    iconColor: "#38bdf8",
    iconBg: "rgba(56, 189, 248, 0.30)",
  },
  {
    buttonText: user?.doseUserHavePassword
      ? t("user.changePassword")
      : t("user.addNewPassword"),
    onPress: () => {
      router.push("/account/password");
    },
    IconName: "lock",
    iconColor: "#a78bfa",
    iconBg: "rgba(167, 139, 250, 0.32)",
    hide: !user?.email,
  },
  {
    buttonText: user?.email ? t("user.changeEmail") : t("user.addEmail"),
    onPress: () => {
      router.push("/account/email");
    },
    IconName: "mail",
    iconColor: "#2dd4bf",
    iconBg: "rgba(45, 212, 191, 0.30)",
    rightIcon: {
      name: user?.emailVerification?.verified ? "check-circle" : "x-circle",
      color: user?.emailVerification?.verified ? "#059669" : "#ef233c",
      show: user?.email,
    },
  },
  {
    buttonText: user?.phoneNumber
      ? t("user.changePhoneNumber")
      : t("user.addPhoneNumber"),
    onPress: () => {
      router.push("/account/phone");
    },
    IconName: "phone",
    iconColor: "#22c55e",
    iconBg: "rgba(34, 197, 94, 0.30)",
    rightIcon: {
      name: user?.phoneVerification?.verified ? "check-circle" : "x-circle",
      color: user?.phoneVerification?.verified ? "#059669" : "#ef233c",
      show: user?.phoneVerification,
    },
  },
  {
    buttonText: t("user.deactivateAccount"),
    onPress: () => setShowDeActiveAccount(true),
    IconName: "trash-2",
    iconColor: "#fb7185",
    iconBg: "rgba(251, 113, 133, 0.30)",
  },
  {
    buttonText: t("user.deleteAccount"),
    onPress: () => setShowDeleteAccount(true),
    IconName: "trash",
    iconColor: "#f43f5e",
    iconBg: "rgba(244, 63, 94, 0.30)",
  },
];

const settingsMenuItems = (
  t,
  setShowLanguageModal,
  navigation,
  setShowNotificationPopup,
  setShowAboutPopup,
  setShowThemePopup,
  colorScheme
) => [
  // {
  //   buttonText: t("user.general"),
  //   navigationLink: "UpdateProfile",
  //   IconName: "settings",
  // },
  {
    buttonText: t("user.appLanguage"),
    IconName: "globe",
    iconColor: "#22d3ee",
    iconBg: "rgba(34, 211, 238, 0.30)",
    onPress: () => setShowLanguageModal(true),
  },

  {
    buttonText: t("user.notifications"),
    IconName: "bell",
    iconColor: "#f59e0b",
    iconBg: "rgba(245, 158, 11, 0.32)",
    onPress: () => setShowNotificationPopup(true),
  },
  {
    buttonText: t("user.theme"),
    IconName: colorScheme !== "dark" ? "sun" : "moon",
    iconColor: colorScheme !== "dark" ? "#f59e0b" : "#a78bfa",
    iconBg:
      colorScheme !== "dark"
        ? "rgba(245, 158, 11, 0.32)"
        : "rgba(167, 139, 250, 0.32)",
    onPress: () => setShowThemePopup(true),
  },
  // {
  //   buttonText: t("user.help"),
  //   navigationLink: "UpdateProfile",
  //   IconName: "help-circle",
  // },
  // ];
  // }

  // {
  //   buttonText: t("user.help"),
  //   navigationLink: "UpdateProfile",
  //   IconName: "help-circle",
  // },
  {
    buttonText: t("user.about"),

    IconName: "info",
    iconColor: "#38bdf8",
    iconBg: "rgba(56, 189, 248, 0.30)",
    onPress: () => setShowAboutPopup(true),
  },
];

export default User;
