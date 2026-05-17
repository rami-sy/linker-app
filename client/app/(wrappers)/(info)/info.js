import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, I18nManager } from "react-native";
import Input from "../../../src/components/input";
import Button from "../../../src/components/button";

import { resetPassword } from "../../../src/api/me";
import Joi from "joi";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import WelcomeTool from "../../../src/components/welcome-tool";
import Logo from "../../../src/components/logo";
import { Link, router, useLocalSearchParams } from "expo-router";
import Layout from "../../../src/components/layout";
import FeIcon from "react-native-vector-icons/Feather";
import GoogleAuth from "../../../src/components/google-auth";
import { getLocales } from "expo-localization";
import { useColorScheme } from "~/lib/useColorScheme";

const Info = () => {
  const { t } = useTranslation();

  const { isDarkColorScheme } = useColorScheme();
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";
  return (
    <View className={`items-start justify-center h-full`}>
      <TouchableOpacity
        className={`absolute items-center justify-center mr-3 top-[6px] z-10`}
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.push("/");
          }
        }}
      >
        {isRTL ? (
          <FeIcon
            name="chevron-right"
            size={35}
            color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
          />
        ) : (
          <FeIcon
            name="chevron-left"
            size={35}
            color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
          />
        )}
      </TouchableOpacity>
      <View className={`items-center justify-between h-full flex-1`}>
        <WelcomeTool />
        <Logo />
        <View className={`items-center justify-start flex-1 w-full`}>
          <Text
            className="w-11/12 text-sm mb-6 text-center text-placehoder dark:text-papaya"
          >
            {t("auth.welcome.description")}
          </Text>
          <Button
            label={t("auth.welcome.getStart")}
            onPress={() => {
              router.push("/login");
            }}
          />
          <GoogleAuth />
        </View>
        <View className={`items-center justify-end flex-1 w-full p-4 pb-9`}>
          <View className={`flex-row items-center justify-between w-full`}>
            <Link
              href="/delete-my-account"
              className="text-center text-sm mt-2 text-placehoder dark:text-papaya"
            >
              {t("auth.welcome.deleteMyAccount")}
            </Link>
            <Link
              href="/terms-of-service"
              className="text-center text-sm mt-2 text-placehoder dark:text-papaya"
            >
              {t("auth.welcome.termsOfService")}
            </Link>
            <Link
              href="/privacy"
              className="text-center text-sm mt-2 text-placehoder dark:text-papaya"
            >
              {t("auth.welcome.privacyPolicy")}
            </Link>
          </View>
        </View>
      </View>
    </View>
  );
};

export default Info;
