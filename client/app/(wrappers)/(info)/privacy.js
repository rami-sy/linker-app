import React from "react";
import {
  View,
  Text,
  ScrollView,
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

const PrivacyPolicy = () => {
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
            Privacy Policy for Linker App
          </Text>

          <Text className={`mb-4 ${textColor}`}>
            <Text className="font-bold">Effective Date:</Text> 2024
          </Text>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            1. Introduction
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            Welcome to Linker! Your privacy is of utmost importance to us. This
            Privacy Policy explains how we collect, use, and safeguard your
            personal information when you use our app.
          </Text>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            2. Information We Collect
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            We collect the following types of information:
          </Text>
          <View className="mb-4 space-y-2">
            <Text className={`${textColor}`}>
              - <Text className="font-bold">Personal Information:</Text> When
              you register or use Linker, we may collect information such as
              your name, email address, phone number, and profile picture.
            </Text>
            <Text className={`${textColor}`}>
              - <Text className="font-bold">Usage Data:</Text> We may collect
              information about how you use the app, including interactions with
              features, the time spent in the app, and settings preferences.
            </Text>
            <Text className={`${textColor}`}>
              - <Text className="font-bold">Device Information:</Text> We may
              collect information about the device you use to access Linker,
              such as the device type, operating system, and IP address.
            </Text>
          </View>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            3. How We Use Your Information
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            The information we collect is used to:
          </Text>
          <View className="mb-4 space-y-2">
            <Text className={`${textColor}`}>
              - Provide and improve our services.
            </Text>
            <Text className={`${textColor}`}>
              - Personalize user experience.
            </Text>
            <Text className={`${textColor}`}>
              - Communicate with you about updates, new features, or promotions.
            </Text>
            <Text className={`${textColor}`}>
              - Ensure the security of the app and prevent fraudulent
              activities.
            </Text>
          </View>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            4. Data Sharing and Disclosure
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            We do not sell or share your personal information with third
            parties, except:
          </Text>
          <View className="mb-4 space-y-2">
            <Text className={`${textColor}`}>
              - When required by law, regulation, or legal process.
            </Text>
            <Text className={`${textColor}`}>
              - To protect the safety, rights, or property of Linker, its users,
              or the public.
            </Text>
          </View>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            5. Data Security
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            We implement industry-standard security measures to protect your
            personal information from unauthorized access, use, or disclosure.
            However, no method of transmission over the internet is 100% secure.
          </Text>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            6. Your Choices and Rights
          </Text>
          <Text className={`mb-4 ${textColor}`}>You have the right to:</Text>
          <View className="mb-4 space-y-2">
            <Text className={`${textColor}`}>
              - Access and update your personal information in the app.
            </Text>
            <Link href="/delete-my-account">
              <Text className={`${textColor}`}>
                - Delete my account and personal data.
              </Text>
            </Link>
            <Text className={`${textColor}`}>
              - Opt-out of receiving marketing communications.
            </Text>
          </View>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            7. Changes to the Privacy Policy
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            We may update this Privacy Policy from time to time. Any changes
            will be posted here, and you are encouraged to review the policy
            periodically.
          </Text>
          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            8. Child Safety Standards
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            Linker is committed to protecting children’s privacy and preventing
            sexual abuse and exploitation. We comply with all applicable child
            safety laws and regulations to ensure the safety of children. Our
            app adheres to child sexual abuse material (CSAM) prevention
            practices.
            <Link className="font-bold" href="/safety-standards">
              Read our full child safety standards here.
            </Link>
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            We also allow users to report any child safety concerns through our
            app. To learn more about reporting, please visit our{" "}
            <Link href="/help-center" className="font-bold">
              Help center
            </Link>
            .
          </Text>

          <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
            9. Contact Us
          </Text>
          <Text className={`mb-4 ${textColor}`}>
            If you have any questions about this Privacy Policy, please contact
            us at:{" "}
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

export default PrivacyPolicy;
