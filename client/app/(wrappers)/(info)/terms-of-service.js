import React from "react";
import {
  View,
  Text,
  ScrollView,
  Linking,
  I18nManager,
  TouchableOpacity,
} from "react-native";
import { useSelector } from "react-redux";
import Logo from "../../../src/components/logo";
import { Link, router } from "expo-router";
import { useTranslation } from "react-i18next";
import FeIcon from "react-native-vector-icons/Feather";
import { getLocales } from "expo-localization";
import { useColorScheme } from "~/lib/useColorScheme";

const TermsOfService = () => {
  const { isDarkColorScheme } = useColorScheme();

  const textColor = "text-placehoder dark:text-papaya";
  const headerColor = "text-slate-800 dark:text-slate-200";
  const backgroundColor = isDarkColorScheme ? "#12141b" : "#dee4e6";
  const { t } = useTranslation();
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

  return (
    <>
      <TouchableOpacity
        className={`absolute items-center justify-center mr-3 top-[6px] z-10`}
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.push("/info");
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
      <View className={`items-center justify-between flex-1`}>
        <Logo my="my-9" w="w-full" withText={true} />

        <ScrollView className={`flex-1 w-full px-4`}>
          <Text className={`text-2xl font-bold mb-5 ${headerColor}`}>
            Terms of Service for Linker App
          </Text>

          <Text className={`mb-4 ${textColor}`}>
            <Text className="font-bold">Effective Date:</Text> 2024
          </Text>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            1. Acceptance of Terms
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            By using Linker, you agree to comply with and be bound by these
            Terms of Service. If you do not agree, please do not use the app.
          </Text>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            2. User Responsibilities
          </Text>
          <Text className={`mb-4 ${textColor}`}>You agree to:</Text>
          <View className="mb-4 space-y-2">
            <Text className={`${textColor}`}>
              - Use the app in a lawful and respectful manner.
            </Text>
            <Text className={`${textColor}`}>
              - Avoid any behavior that could harm or disrupt the app or its
              users.
            </Text>
            <Text className={`${textColor}`}>
              - Provide accurate information when registering or interacting
              within the app.
            </Text>
          </View>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            3. Prohibited Activities
          </Text>
          <Text className={`mb-4 ${textColor}`}>You must not:</Text>
          <View className="mb-4 space-y-2">
            <Text className={`${textColor}`}>
              - Use the app for any illegal or unauthorized purpose.
            </Text>
            <Text className={`${textColor}`}>
              - Interfere with the app's functionality or security.
            </Text>
            <Text className={`${textColor}`}>
              - Share offensive, inappropriate, or harmful content.
            </Text>
          </View>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            4. App Availability
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            Linker strives to provide a reliable app experience, but
            availability is not guaranteed.
          </Text>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            5. Intellectual Property
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            All content, logos, and designs within Linker are the property of
            Linker. You may not copy, distribute, or use any part of the app
            without explicit permission.
          </Text>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            6. Termination
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            We reserve the right to terminate or suspend your account for
            violations of these terms.
          </Text>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            7. Changes to Terms
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            Linker may update these Terms of Service at any time. Continued use
            of the app indicates your acceptance of the updated terms.
          </Text>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            8. Contact Us
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            For questions about these Terms of Service, contact us at:{" "}
            <Text
              className="font-bold"
              onPress={() => {
                Linking.openURL("mailto:rami@linker.land");
              }}
            >
              rami@linker.land
            </Text>
          </Text>

          <Link
            className="my-6 text-base text-center text-placehoder dark:text-papaya"
            href="/"
          >
            {t("auth.deleteAccount.backToWelcome")}{" "}
            <Text
              className="text-placehoder dark:text-papaya font-semibold"
            >
              {t("auth.deleteAccount.welcomeScreen")}
            </Text>
          </Link>
        </ScrollView>
      </View>
    </>
  );
};

export default TermsOfService;
