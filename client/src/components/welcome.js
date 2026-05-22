import React, { useEffect } from "react";
import { View, Text, Linking } from "react-native";
import Button from "./button";
import { useTranslation } from "react-i18next";
import Head from "expo-router/head";

import { useDispatch, useSelector } from "react-redux";
import { removeMe } from "../redux/userSlice";
import { resetForm } from "../redux/formSlice";
import { clearChat } from "../redux/chatSlice";
import { removeItem } from "../utils/localStorage";
import { resetApp } from "../redux/appSlice";
import { resetAlrets } from "../redux/alertSlice";

import WelcomeTool from "./welcome-tool";
import { persistor } from "../../store";
import { Link, router, useLocalSearchParams } from "expo-router";
import Logo from "./logo";

import GoogleAuth from "./google-auth";
import { useColorScheme } from "~/lib/useColorScheme";

const WelcomeComponent = () => {
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();

  // const route = useRoute();
  const dispatch = useDispatch();

  const { forceLogout } = useLocalSearchParams();

  useEffect(() => {
    if (!forceLogout) return;

    void (async () => {
      // Drop session immediately so root layout does not "re-login" redirect (avoids flash)
      await removeItem("accessToken");
      await removeItem("refreshToken");
      await removeItem("persist:root");
      dispatch(removeMe());
      dispatch(resetForm());
      dispatch(clearChat());
      dispatch(resetApp());
      dispatch(resetAlrets());
      try {
        await persistor.purge();
        console.log("Persisted data cleared successfully.");
      } catch (error) {
        console.error("Failed to clear persisted data:", error);
      }
    })();
  }, [forceLogout, dispatch]);
  const getColor = (index) => {
    const colors = [
      "#2D2D37",
      "#2D2D37",
      "#2D2D37",
      "#2D2D37",
      "#2D2D37",
      "#2D2D37",
    ];
    return colors[index];
  };

  return (
    <>
      <Head>
        <title>Linker | Message, Connect, and Share</title>
        <meta
          name="description"
          content="Linker is the best way to connect with your friends. It's a social media platform that allows you to connect with your friends and family."
        />
      </Head>
      <View
        className="items-center justify-between flex-1 relative w-full linker-w bg-[#dee4e6] dark:bg-[#12141b]"
      >
        <WelcomeTool />
        <Logo />
        <View className={`items-center justify-start mt-6 flex-1 w-full`}>
          <Text
            className="w-9/12 text-base mb-6 text-center text-placehoder dark:text-papaya"
          >
            {t("auth.welcome.title")}
          </Text>
          <View className="w-10/12 mb-6 p-4 rounded-2xl bg-[#f6f8f9] dark:bg-[#1e212b]">
            <Text className="text-sm text-slate-700 dark:text-slate-200 mb-1">
              1. Start your first chat
            </Text>
            <Text className="text-sm text-slate-700 dark:text-slate-200 mb-1">
              2. Set privacy and call controls
            </Text>
            <Text className="text-sm text-slate-700 dark:text-slate-200">
              3. Explore and connect with new people
            </Text>
          </View>

          <Button
            label={t("auth.welcome.getStart")}
            onPress={() => {
              router.push("/login");
            }}
            mb="mb-0"
          />
          <GoogleAuth />

          <View
            className={`absolute bottom-9 flex-col items-center justify-between w-full px-4`}
          >
            <Text
              className="mt-2 mb-4 text-base text-center w-9/12 text-placehoder dark:text-papaya"
            >
              {t("auth.welcome.visitWebsitePrefix")}
              <Text>{"\n"}</Text>
              <Text
                className="text-placehoder dark:text-papaya font-semibold"
                onPress={() => {
                  Linking.openURL("mailto:rami@linker.land");
                }}
              >
                {t("auth.welcome.visitWebsiteHighlighted")}
              </Text>
            </Text>
            <View className={`flex-row items-center justify-center w-full`}>
              <Link
                href="/info"
                className="text-center text-base mt-2 text-placehoder dark:text-papaya"
              >
                {t("auth.welcome.privacy&terms")}
              </Link>
            </View>
          </View>
        </View>
      </View>
    </>
  );
};

export default WelcomeComponent;
