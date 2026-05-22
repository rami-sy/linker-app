import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import React, { useContext, useEffect, useState } from "react";

import { useDispatch, useSelector } from "react-redux";
import FeIcon from "react-native-vector-icons/Feather";
import MCIcon from "react-native-vector-icons/MaterialCommunityIcons";
import EnIcon from "react-native-vector-icons/Entypo";
import FAW5Icon from "react-native-vector-icons/FontAwesome5";
import IoIcon from "react-native-vector-icons/Ionicons";
import ImageViewer from "react-native-image-zoom-viewer";

import upperFirst from "lodash/upperFirst";
import { SocketContext } from "../../../../../src/contexts/socket.context";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import { useLocalSearchParams } from "expo-router";
import CategoryPicker from "../../../../../src/components/category-picker";
import UserCard from "../../../../../src/components/profile/user-card";
import Button from "../../../../../src/components/button";
import { setUserProfile } from "../../../../../src/redux/userSlice";
import UserImage from "~/src/components/user-image";
import Modal from "../../../../../src/components/modal";
import { useColorScheme } from "~/lib/useColorScheme";
import { ProfileGlyph } from "../../../../../src/components/profile/profile-icon-map";
import { getNavPalette } from "../../../../../src/components/navigation/nav-theme";

const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;

const ProfileScreen = ({ userId, onClose }) => {
  const [active, setActive] = React.useState("more");
  const { emitWithAck } = useContext(SocketContext);
  const { userProfile } = useSelector((state) => state.users);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");

  const [showModal, setShowModal] = React.useState(false);
  const [imagesIndex, setImagesIndex] = React.useState(0);
  const dispatch = useDispatch();

  const { t } = useTranslation();
  const { userId: userIdParam, from } = useLocalSearchParams();

  useEffect(() => {
    setImagesIndex(0);
    const loadUserProfile = async () => {
      try {
        setLoadingProfile(true);
        setProfileError("");
        const res = await emitWithAck("getOneUser", {
          targetUserId: userIdParam || userId,
        });
        if (res?.type === "success" && res?.data) {
          dispatch(setUserProfile(res.data));
        } else {
          dispatch(setUserProfile(null));
          setProfileError(
            res?.message || t("general.error") || "Failed to load profile"
          );
        }
      } catch (error) {
        dispatch(setUserProfile(null));
        setProfileError(error?.message || "Failed to load profile");
      } finally {
        setLoadingProfile(false);
      }
    };
    if (userId || userIdParam) {
      loadUserProfile();
    } else {
      setLoadingProfile(false);
      setProfileError("Invalid profile id");
    }

    return () => {
      dispatch(setUserProfile(null));
    };
  }, [userId, userIdParam, emitWithAck, dispatch, t]);

  const { isDarkColorScheme } = useColorScheme();
  const navPalette = getNavPalette(isDarkColorScheme);

  const [scrolledEnough, setScrolledEnough] = useState(false);

  const handleScroll = (event) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    if (scrollY > 50 && !scrolledEnough) {
      setScrolledEnough(true);
    } else if (scrollY <= 50 && scrolledEnough) {
      setScrolledEnough(false);
    }
  };

  if (loadingProfile) {
    return (
      <View className="absolute top-0 left-0 z-10 items-center justify-center flex-1 w-full h-full bg-[#f6f8f9] dark:bg-main">
        <ActivityIndicator
          size="large"
          color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
        />
      </View>
    );
  }

  if (profileError || !userProfile) {
    return (
      <View className="absolute top-0 left-0 z-10 items-center justify-center flex-1 w-full h-full bg-[#f6f8f9] dark:bg-main px-6">
        <Text className="text-base text-center text-slate-700 dark:text-slate-200 mb-4">
          {profileError || "Profile not available."}
        </Text>
        <View className="flex-row items-center gap-x-3">
          <Button
            label={t("general.retry") || "Retry"}
            w="w-32"
            h="h-11"
            onPress={async () => {
              setLoadingProfile(true);
              setProfileError("");
              try {
                const res = await emitWithAck("getOneUser", {
                  targetUserId: userIdParam || userId,
                });
                if (res?.type === "success" && res?.data) {
                  dispatch(setUserProfile(res.data));
                } else {
                  setProfileError(res?.message || "Failed to load profile");
                }
              } catch (error) {
                setProfileError(error?.message || "Failed to load profile");
              } finally {
                setLoadingProfile(false);
              }
            }}
            mb="mb-0"
          />
          {!!onClose && (
            <Button
              label={t("general.close") || "Close"}
              w="w-32"
              h="h-11"
              className="bg-slate-600"
              onPress={onClose}
              mb="mb-0"
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <View
      className="w-full flex-1 flex-col items-stretch justify-center bg-[#dee4e6] dark:bg-[#12141b] linker-w"
    >
    <View
      className="absolute top-0 left-0 z-10 items-center justify-center flex-1 w-full h-full bg-[#f6f8f9] dark:bg-main"
    >
      <ActivityIndicator
        size="large"
        color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
      />
    </View>
    
      <Modal
        showModal={showModal}
        setShowModal={(val) => {
          if (!val) {
            setShowModal(false);
          }
        }}
        onCancel={() => {
          setShowModal(false);
        }}
        opacity="90"
        animationType="fade"
      >
        <View className="relative h-full w-full">
          <ImageViewer
            renderArrowLeft={() => null}
            renderArrowRight={() => null}
            index={imagesIndex}
            imageUrls={userProfile?.images?.map((image) => ({
              url: apiUrl + image.path,
            }))}
          />
          <TouchableOpacity
            onPress={() => {
              setShowModal(false);
            }}
            className="absolute right-4 top-4 z-30 rounded-full bg-black/45 p-2"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FeIcon name="x" size={22} color="#f6f8f9" />
          </TouchableOpacity>
        </View>
      </Modal>
      <View className="z-50 mb-1 w-full self-stretch px-3 pt-4">
        <UserCard
          w="w-full"
          className="self-stretch"
          onImagePress={() => {
            setShowModal(true);
            setImagesIndex(0);
          }}
          currentUser={from === "user"}
          scrolledEnough={scrolledEnough}
          enableAnimation={true}
          onClose={onClose}
        />
      </View>
      <View className="w-full px-3 pb-2">
        <View
          className="flex-row rounded-2xl border p-1"
          style={{
            borderColor: navPalette.shellBorder,
            backgroundColor: navPalette.shellBg,
          }}
        >
          <TouchableOpacity
            onPress={() => setActive("more")}
            className={`min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 px-1 ${
              active === "more" ? navPalette.activePill : ""
            }`}
            activeOpacity={0.85}
          >
            <View className="shrink-0">
              <UserImage
                size="w-5 h-5"
                borderWidth={0}
                text="text-xs"
                showStatus={false}
                user={userProfile}
              />
            </View>
            <Text
              className={`min-w-0 flex-1 text-xs font-semibold ${
                active === "more"
                  ? "text-[#0a97b9]"
                  : "text-slate-500 dark:text-slate-400"
              }`}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {t("profileScreen.about", {
                name: upperFirst(userProfile?.firstName),
              })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActive("photo")}
            className={`min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 px-1 ${
              active === "photo" ? navPalette.activePill : ""
            }`}
            activeOpacity={0.85}
          >
            <ProfileGlyph
              name="camera"
              size={20}
              color={
                active === "photo"
                  ? navPalette.activeTint
                  : navPalette.inactiveTint
              }
              weight={active === "photo" ? "fill" : "duotone"}
            />
            <Text
              className={`text-xs font-semibold ${
                active === "photo"
                  ? "text-[#0a97b9]"
                  : "text-slate-500 dark:text-slate-400"
              }`}
              numberOfLines={1}
            >
              {t("profileScreen.photoCount", {
                count: userProfile?.images?.length,
              })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActive("moreInfo")}
            className={`min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 px-1 ${
              active === "moreInfo" ? navPalette.activePill : ""
            }`}
            activeOpacity={0.85}
          >
            <ProfileGlyph
              name="info"
              size={20}
              color={
                active === "moreInfo"
                  ? navPalette.activeTint
                  : navPalette.inactiveTint
              }
              weight={active === "moreInfo" ? "fill" : "duotone"}
            />
            <Text
              className={`text-xs font-semibold ${
                active === "moreInfo"
                  ? "text-[#0a97b9]"
                  : "text-slate-500 dark:text-slate-400"
              }`}
              numberOfLines={1}
            >
              {t("profileScreen.more")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          marginBottom: 8,
        }}
        className={`z-50 p-3 mb-6 w-full`}
      >
        <View className={`w-full mb-4`}>
          {active === "more" &&
          (userProfile?.privacySettings?.visibility.profileInfo ===
            "everyone" ||
            (userProfile?.isFriend &&
              userProfile?.privacySettings?.visibility.profileInfo ===
                "friends")) ? (
            <>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name={
                      userProfile?.gender === "male"
                        ? "gender-male"
                        : "gender-female"
                    }
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.gender")}
                  </Text>
                  {userProfile?.gender ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {upperFirst(userProfile?.gender)}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>

              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <FeIcon
                    name="globe"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.nationality")}
                  </Text>
                  {userProfile?.nationality ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {upperFirst(userProfile?.nationality)}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>

              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <FeIcon
                    name="map-pin"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.location")}
                  </Text>
                  {userProfile?.location?.city &&
                  userProfile?.location?.country ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {`${upperFirst(
                        userProfile?.location?.city
                      )}, ${upperFirst(userProfile?.location?.country)}`}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>

              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <FeIcon
                    name="calendar"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.age")}
                  </Text>
                  {userProfile?.birthDate ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {new Date().getFullYear() - userProfile?.birthDate?.year}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>

              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name="account-heart"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>

                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.status")}
                  </Text>
                  {userProfile?.maritalStatus ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {t(
                        `attributes.maritalStatus.${userProfile?.maritalStatus}`
                      )}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <FAW5Icon
                    name="bullseye"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.lookingFor")}
                  </Text>
                  <View className={`flex-row items-center gap-x-2 flex-wrap`}>
                    {userProfile?.lookingFor.length > 0 ? (
                      userProfile?.lookingFor?.map((item, index) => (
                        <Text
                          key={item || index}
                          className="text-base text-slate-800 dark:text-slate-200"
                        >
                          {upperFirst(item)}
                        </Text>
                      ))
                    ) : (
                      <Text
                        className="text-sm italic text-slate-500 dark:text-slate-400"
                      >
                        {t("profileScreen.notAnswered")}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name="chat"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.communications")}
                  </Text>
                  <View className={`flex-row items-center gap-x-2 flex-wrap`}>
                    {userProfile?.preferredCommunications?.length > 0 ? (
                      userProfile?.preferredCommunications?.map(
                        (item, index) => (
                          <Text
                            key={item || index}
                            className="text-base text-slate-800 dark:text-slate-200"
                          >
                            {upperFirst(item)}
                          </Text>
                        )
                      )
                    ) : (
                      <Text
                        className="text-sm italic text-slate-500 dark:text-slate-400"
                      >
                        {t("profileScreen.notAnswered")}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name={`gender-male`}
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.preferredGender")}
                  </Text>
                  <View className={`flex-row items-center gap-x-2 flex-wrap`}>
                    {userProfile?.preferredGenders?.length > 0 ? (
                      userProfile?.preferredGenders?.map((item, index) => (
                        <Text
                          key={item || index}
                          className="text-base text-slate-800 dark:text-slate-200"
                        >
                          {upperFirst(item)}
                        </Text>
                      ))
                    ) : (
                      <Text
                        className="text-sm italic text-slate-500 dark:text-slate-400"
                      >
                        {t("profileScreen.notAnswered")}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name="smoking"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.smoking")}
                  </Text>
                  {userProfile?.smoking ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {upperFirst(userProfile?.smoking)}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <EnIcon
                    name="drink"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>

                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.drinking")}
                  </Text>
                  {userProfile?.drinking ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {upperFirst(userProfile?.drinking)}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name="human-male-height"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>

                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.height")}
                  </Text>
                  {userProfile?.height ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {userProfile?.height} cm
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <FAW5Icon
                    name="weight"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>

                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.weight")}
                  </Text>
                  {userProfile?.weight ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {userProfile?.weight} kg
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <IoIcon
                    name="body"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.bodyType")}
                  </Text>
                  {userProfile?.bodyType ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {upperFirst(userProfile?.bodyType)}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name="cast-education"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.education")}
                  </Text>
                  {userProfile?.education ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {upperFirst(userProfile?.education)}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name="briefcase"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.occupation")}
                  </Text>
                  {userProfile?.occupation ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {upperFirst(userProfile?.occupation)}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name="church"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.religion")}
                  </Text>
                  {userProfile?.religion ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {upperFirst(userProfile?.religion)}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name={`zodiac-${userProfile?.zodiacSign?.toLowerCase()}`}
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.zodiacSign")}
                  </Text>
                  {userProfile?.zodiacSign ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {upperFirst(userProfile?.zodiacSign)}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name="account-heart"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.personalityType")}
                  </Text>
                  {userProfile?.personalityType ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {upperFirst(userProfile?.personalityType)}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name="dumbbell"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.exercise")}
                  </Text>
                  {userProfile?.exercise ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {upperFirst(userProfile?.exercise)}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name="food-apple"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.diet")}
                  </Text>
                  {userProfile?.diet ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {upperFirst(userProfile?.diet)}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
              <View
                className="flex-row w-full items-center gap-3 border border-slate-200/50 bg-[#f6f8f9] py-3 px-3 shadow-sm dark:border-slate-700/50 dark:bg-[#1e212b] rounded-2xl min-h-[72px] mb-2"
              >
                <View className="w-11 shrink-0 flex-row items-center justify-center">
                  <MCIcon
                    name="sleep"
                    size={40}
                    color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                  />
                </View>
                <View className="flex-1 min-w-0 flex-col items-start justify-center">
                  <Text
                    className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t("profileScreen.sleepSchedule")}
                  </Text>
                  {userProfile?.sleepSchedule ? (
                    <Text
                      className="text-base text-slate-800 dark:text-slate-200"
                    >
                      {upperFirst(userProfile?.sleepSchedule)}
                    </Text>
                  ) : (
                    <Text
                      className="text-sm italic text-slate-500 dark:text-slate-400"
                    >
                      {t("profileScreen.notAnswered")}
                    </Text>
                  )}
                </View>
              </View>
            </>
          ) : (
            active === "more" && (
              <Text
                className="text-slate-800 dark:text-slate-200 text-center mt3"
              >
                {t("profileScreen.thisUserHasPrivateProfile")}
              </Text>
            )
          )}

          {active === "photo" && (
            <View
              className={`flex-row flex-wrap items-start justify-start gap-2`}
            >
              {userProfile?.images?.map((image, index) => (
                <TouchableOpacity
                  key={image._id || index}
                  className={`w-24 h-24`}
                  onPress={() => {
                    setImagesIndex(index);
                    setShowModal(true);
                  }}
                >
                  <Image
                    source={{
                      uri: apiUrl + image?.path,
                    }}
                    className={`w-full h-full rounded-2xl`}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {active === "moreInfo" && (
            <>
              <View className={`flex flex-row flex-wrap gap-2 mt-2`}>
                <CategoryPicker
                  items={userProfile?.languages}
                  valueKey="_id"
                  label={t("user.languages")}
                  containerStyle="w-full"
                />
              </View>
              <View className={`flex flex-row flex-wrap gap-2`}>
                <CategoryPicker
                  items={userProfile?.interests}
                  valueKey="_id"
                  label={t("user.interests")}
                  containerStyle="w-full"
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default ProfileScreen;
