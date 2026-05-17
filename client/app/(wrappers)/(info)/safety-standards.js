// safety-standards.js

import React from "react";
import {
  View,
  Text,
  ScrollView,
  Linking,
  TouchableOpacity,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { Link, router } from "expo-router";
import { I18nManager } from "react-native";
import FeIcon from "react-native-vector-icons/Feather";
import { useColorScheme } from "~/lib/useColorScheme";

const SafetyStandards = () => {
  const { isDarkColorScheme } = useColorScheme();
  const textColor = "text-placehoder dark:text-papaya";
  const headerColor = "text-slate-800 dark:text-slate-200";
  const backgroundColor = isDarkColorScheme ? "#12141b" : "#dee4e6";
  const { t } = useTranslation();
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

  return (
    <View style={{ flex: 1, backgroundColor }}>
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
      <ScrollView contentContainerStyle={{ padding: 16, marginTop: 30 }}>
        <Text className={`text-2xl font-bold mb-5 ${headerColor}`}>
          Child Safety Standards
        </Text>

        <Text className={`mb-4 ${textColor}`}>
          At Linker, we prioritize child safety and are committed to complying
          with all relevant laws to prevent child sexual abuse and exploitation
          (CSAE). Below are our safety standards to ensure the protection of
          children:
        </Text>

        <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
          1. Prevention of Child Sexual Abuse Material (CSAM)
        </Text>
        <Text className={`mb-4 ${textColor}`}>
          We take all necessary precautions to prevent the sharing,
          distribution, or possession of child sexual abuse material on our
          platform. Our team is dedicated to identifying and reporting any such
          material to the relevant authorities.
        </Text>

        <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
          2. Reporting Child Safety Concerns
        </Text>
        <Text className={`mb-4 ${textColor}`}>
          Linker allows users to report any child safety concerns directly
          through the app. Reports can be made through our{" "}
          <Link href="/help-center" className="font-bold">
            Help Center
          </Link>
          .
        </Text>

        <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
          3. Compliance with Relevant Laws
        </Text>
        <Text className={`mb-4 ${textColor}`}>
          Our app complies with all relevant child safety laws and regulations.
          We work with national and regional authorities to report any concerns
          about child safety.
        </Text>

        <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
          4. Privacy Measures
        </Text>
        <Text className={`mb-4 ${textColor}`}>
          We implement strict privacy measures to protect children’s personal
          information, and we only collect information necessary for the
          operation of the app.
        </Text>

        <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
          5. Contact Us
        </Text>
        <Text className={`mb-4 ${textColor}`}>
          If you have any questions or concerns regarding our child safety
          standards, please feel free to contact us at:{" "}
          <Text
            className="font-bold"
            onPress={() => {
              Linking.openURL("mailto:rami@linker.land");
            }}
          >
            rami@linker.land
          </Text>
        </Text>

        <Text className={`text-lg mb-4 ${textColor}`}>
          Thank you for helping us keep Linker a safe and secure platform for
          everyone.
        </Text>
      </ScrollView>
    </View>
  );
};

export default SafetyStandards;
