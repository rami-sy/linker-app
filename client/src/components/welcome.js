import React, { useEffect } from "react";
import { View, Text, Linking, ScrollView } from "react-native";
import Button from "./button";
import { useTranslation } from "react-i18next";
import Head from "expo-router/head";

import { useDispatch } from "react-redux";
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
import FacebookAuth from "./facebook-auth";
import { useColorScheme } from "~/lib/useColorScheme";
import { Feather } from "@expo/vector-icons";

const FeatureCard = ({ icon, title, desc }) => (
  <View
    style={{ borderLeftWidth: 3, borderLeftColor: "#0a97b9" }}
    className="bg-[#f0f7f9] dark:bg-[#1a1e2a] rounded-2xl p-4 mb-3 flex-row items-center w-10/12"
  >
    <View
      className="rounded-full p-2.5 mr-4"
      style={{ backgroundColor: "rgba(10,151,185,0.15)" }}
    >
      <Feather name={icon} size={20} color="#0a97b9" />
    </View>
    <View style={{ flex: 1 }}>
      <Text className="font-semibold text-sm text-placehoder dark:text-papaya">
        {title}
      </Text>
      <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
        {desc}
      </Text>
    </View>
  </View>
);

const WelcomeComponent = () => {
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  const dispatch = useDispatch();
  const { forceLogout } = useLocalSearchParams();

  const FEATURES = [
    { icon: "message-circle", title: t("auth.welcome.feature1Title"), desc: t("auth.welcome.feature1Desc") },
    { icon: "shield",         title: t("auth.welcome.feature2Title"), desc: t("auth.welcome.feature2Desc") },
    { icon: "users",          title: t("auth.welcome.feature3Title"), desc: t("auth.welcome.feature3Desc") },
  ];

  useEffect(() => {
    if (!forceLogout) return;

    void (async () => {
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
      } catch (_) {}
    })();
  }, [forceLogout, dispatch]);

  return (
    <>
      <Head>
        <title>Linker | Message, Connect, and Share</title>
        <meta
          name="description"
          content="Linker is the best way to connect with your friends. It's a social media platform that allows you to connect with your friends and family."
        />
      </Head>
      <View className="items-center justify-between flex-1 relative w-full linker-w bg-[#dee4e6] dark:bg-[#12141b]">
        <WelcomeTool />

        {/* Header */}
        <View className="items-center w-full">
          <Logo />
          {/* Accent rule below logo */}
          <View
            className="rounded-full mb-2"
            style={{ width: 48, height: 3, backgroundColor: "#0a97b9" }}
          />
          <Text className="text-sm text-slate-500 dark:text-slate-400 mb-2">
            {t("auth.welcome.title")}
          </Text>
        </View>

        {/* Feature cards + CTAs */}
        <View className="items-center justify-start flex-1 w-full mt-2">
          {FEATURES.map((f) => (
            <FeatureCard key={f.icon} {...f} />
          ))}

          <View className="w-10/12 mt-3">
            <Button
              label={t("auth.welcome.getStart")}
              onPress={() => router.push("/login")}
              mb="mb-0"
              w="w-full"
            />
          </View>

          {/* OR divider */}
          <View className="flex-row items-center w-10/12 my-3">
            <View className="flex-1 bg-slate-300 dark:bg-slate-700" style={{ height: 1 }} />
            <Text className="mx-3 text-sm text-slate-400">OR</Text>
            <View className="flex-1 bg-slate-300 dark:bg-slate-700" style={{ height: 1 }} />
          </View>

          <View className="flex-row items-center justify-center gap-4">
            <GoogleAuth />
            {/* <FacebookAuth /> */}
          </View>

          <Link
            href="/login"
            className="mt-2 text-sm text-center text-placehoder dark:text-papaya"
          >
            {t("auth.login.dontHaveAccount") || "Already have an account?"}{" "}
            <Text className="text-primary font-semibold">
              {t("auth.login.login") || "Sign in"}
            </Text>
          </Link>

          {/* Footer */}
          <View className="absolute bottom-6 flex-col items-center w-full px-4">
            <Text className="mb-2 text-xs text-center text-slate-400 dark:text-slate-500">
              {t("auth.welcome.visitWebsitePrefix")}{" "}
              <Text
                className="font-semibold text-slate-500 dark:text-slate-400"
                onPress={() => Linking.openURL("mailto:rami@linker.land")}
              >
                {t("auth.welcome.visitWebsiteHighlighted")}
              </Text>
            </Text>
            <Link
              href="/info"
              className="text-center text-xs text-slate-400 dark:text-slate-500"
            >
              {t("auth.welcome.privacy&terms")}
            </Link>
          </View>
        </View>
      </View>
    </>
  );
};

export default WelcomeComponent;
