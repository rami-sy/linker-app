import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import React, { useEffect, useState } from "react";
import Layout from "~/src/components/layout";

import Info from "~/src/components/update-profile/info";
import Location from "~/src/components/update-profile/location";
import Lifestyle from "~/src/components/update-profile/lifestyle";
import PreferencesCompatibility from "~/src/components/update-profile/preferences";
import PhysicalAttributes from "~/src/components/update-profile/physical-attributes";
import Background from "~/src/components/update-profile/background";
import FamilyPreferences from "~/src/components/update-profile/family-preferences";
import CulturalSocialAttributes from "~/src/components/update-profile/cultural-social-attributes";
import Interests from "~/src/components/update-profile/Interests";
import Languages from "~/src/components/update-profile/languages";
import FeIcon from "react-native-vector-icons/Feather";
import Pictures from "~/src/components/update-profile/pictures";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, router } from "expo-router";
import Head from "expo-router/head";
import { useSelector } from "react-redux";
import ContextMenu from "~/src/components/context-menu";
import { useColorScheme } from "~/lib/useColorScheme";
const UpdateProfileScreen = () => {
  const [active, setActive] = useState("info");
  // const router = useRoute();
  const { active: activeParam } = useLocalSearchParams();
  useEffect(() => {
    setActive(activeParam || "info");
  }, [activeParam]);

  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  
  const menuOptions = React.useMemo(() => {
    const iconMuted = isDarkColorScheme ? "#94a3b8" : "#64748b";
    const rowActive = (key) =>
      active === key
        ? "rounded-xl mx-1 my-0.5 bg-[#0a97b9]/12 dark:bg-[#0a97b9]/20"
        : "";
    return [
      {
        name: t("UpdateProfile.pictures"),
        icon: <FeIcon name="image" size={18} color={iconMuted} />,
        onPress: () => setActive("pictures"),
        selected: active === "pictures",
        className: rowActive("pictures"),
      },
      {
        name: t("UpdateProfile.info"),
        icon: <FeIcon name="info" size={18} color={iconMuted} />,
        onPress: () => setActive("info"),
        selected: active === "info",
        className: rowActive("info"),
      },
      {
        name: t("UpdateProfile.preferences"),
        icon: <FeIcon name="heart" size={18} color={iconMuted} />,
        onPress: () => setActive("preferences"),
        selected: active === "preferences",
        className: rowActive("preferences"),
      },
      {
        name: t("UpdateProfile.lifestyle"),
        icon: <FeIcon name="activity" size={18} color={iconMuted} />,
        onPress: () => setActive("lifestyle"),
        selected: active === "lifestyle",
        className: rowActive("lifestyle"),
      },
      {
        name: t("UpdateProfile.location"),
        icon: <FeIcon name="map-pin" size={18} color={iconMuted} />,
        onPress: () => setActive("location"),
        selected: active === "location",
        className: rowActive("location"),
      },
      {
        name: t("UpdateProfile.physicalAttributes"),
        icon: <FeIcon name="user" size={18} color={iconMuted} />,
        onPress: () => setActive("physicalAttributes"),
        selected: active === "physicalAttributes",
        className: rowActive("physicalAttributes"),
      },
      {
        name: t("UpdateProfile.background"),
        icon: <FeIcon name="book" size={18} color={iconMuted} />,
        onPress: () => setActive("background"),
        selected: active === "background",
        className: rowActive("background"),
      },
      {
        name: t("UpdateProfile.familyPreferences"),
        icon: <FeIcon name="users" size={18} color={iconMuted} />,
        onPress: () => setActive("familyPreferences"),
        selected: active === "familyPreferences",
        className: rowActive("familyPreferences"),
      },
      {
        name: t("UpdateProfile.culturalSocialAttributes"),
        icon: <FeIcon name="globe" size={18} color={iconMuted} />,
        onPress: () => setActive("culturalSocialAttributes"),
        selected: active === "culturalSocialAttributes",
        className: rowActive("culturalSocialAttributes"),
      },
      {
        name: t("UpdateProfile.languages"),
        icon: <FeIcon name="globe" size={18} color={iconMuted} />,
        onPress: () => setActive("languages"),
        selected: active === "languages",
        className: rowActive("languages"),
      },
      {
        name: t("UpdateProfile.interests"),
        icon: <FeIcon name="star" size={18} color={iconMuted} />,
        onPress: () => setActive("interests"),
        selected: active === "interests",
        className: rowActive("interests"),
      },
    ];
  }, [t, isDarkColorScheme, active]);
  
  const activeSection = menuOptions.find((item) => item.selected);

  return (
    <>
      <Head>
        <title>Update Profile | Linker</title>
        <meta
          name="description"
          content="Update your profile. Linker is the best way to connect with your friends. It's a social media platform that allows you to connect with your friends and family."
        />
      </Head>
      <Layout
        className="items-stretch flex-1 relative w-full linker-w bg-[#dee4e6] dark:bg-[#12141b]"
        back
        onBack={() => router.back()}
        pb="pb-4"
        h="h-auto"
        navBar={
          <View
            className={`flex-row flex-1 items-center justify-end w-full gap-x-3`}
          >
            <ContextMenu
              options={menuOptions}
              placement="bottom"
              width={260}
              menuClassName="rounded-2xl shadow-lg"
            >
              <View
                className={`flex-row items-center h-12 px-4 py-3 rounded-2xl ${
                  activeSection?.selected
                    ? "bg-[#0a97b9]"
                    : "bg-white dark:bg-[#171b25]"
                }`}
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: activeSection?.selected
                    ? isDarkColorScheme
                      ? 0.35
                      : 0.18
                    : isDarkColorScheme
                      ? 0.22
                      : 0.08,
                  shadowRadius: activeSection?.selected ? 12 : 8,
                  elevation: activeSection?.selected ? 8 : 4,
                }}
              >
                {activeSection && activeSection.icon && (
                  <View className="mr-2">
                    {React.cloneElement(activeSection.icon, {
                      size: 20,
                      color: activeSection.selected
                        ? "#f6f8f9"
                        : isDarkColorScheme
                          ? "#94a3b8"
                          : "#475569",
                    })}
                  </View>
                )}
                <Text
                  className={`text-sm font-semibold ${
                    activeSection?.selected
                      ? "text-white"
                      : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {activeSection?.name || t("UpdateProfile.info")}
                </Text>
                <View className="ml-2">
                  <FeIcon
                    name="chevron-down"
                    size={18}
                    color={
                      activeSection?.selected
                        ? "#f6f8f9"
                        : isDarkColorScheme
                          ? "#94a3b8"
                          : "#475569"
                    }
                  />
                </View>
              </View>
            </ContextMenu>
          </View>
        }
      >
        <View className="w-full flex-1 px-4 pt-1">
          {active === "pictures" && <Pictures />}
          {active === "info" && <Info />}
          {active === "preferences" && <PreferencesCompatibility />}
          {active === "lifestyle" && <Lifestyle />}
          {active === "location" && <Location fromProfile />}
          {active === "physicalAttributes" && <PhysicalAttributes />}
          {active === "familyPreferences" && <FamilyPreferences />}
          {active === "culturalSocialAttributes" && (
            <CulturalSocialAttributes />
          )}
          {active === "background" && <Background />}
          {active === "languages" && (
            <Languages fromProfile withLabel={false} />
          )}
          {active === "interests" && (
            <Interests fromProfile withLabel={false} />
          )}
        </View>
      </Layout>
    </>
  );
};

export default UpdateProfileScreen;
