import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import PhoneInput from "../../../src/components/phone-input";
import Button from "../../../src/components/button";
import { getMe, phoneAuth } from "../../../src/api/me";
import { useDispatch } from "react-redux";
import { useColorScheme } from "~/lib/useColorScheme";
import WelcomeTool from "../../../src/components/welcome-tool";
import Logo from "../../../src/components/logo";
import { Link, router } from "expo-router";
import Head from "expo-router/head";
import GoogleAuth from "../../../src/components/google-auth";

const PhoneAuthScreen = () => {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const { t } = useTranslation();

  const handlePress = async () => {
    setIsLoading(true);
    setServerError("");
    if (!phoneNumber) {
      setErrors((prevData) => ({
        ...prevData,
        phoneNumber: t("auth.phoneAuth.pleaseEnterPhoneNumber"),
      }));
      setIsLoading(false);
      return;
    }

    try {
      const response = await phoneAuth({ phoneNumber });
      if (response.type === "success") {
        router.push({
          pathname: "/verify-phone",
          params: { phoneNumber: phoneNumber },
        });
      } else {
        setServerError(response.message || t("common.somethingWentWrong"));
      }
      setIsLoading(false);
    } catch {
      setIsLoading(false);
      setServerError(t("common.somethingWentWrong"));
    }
  };
  const { isDarkColorScheme } = useColorScheme();

  return (
    <>
      <Head>
        <title>Phone Auth | Linker</title>
        <meta
          name="description"
          content="Linker is datting app that allows you to connect with your friends and family."
        />
      </Head>
      <View
        className="items-center justify-between flex-1 relative w-full linker-w bg-[#dee4e6] dark:bg-[#12141b]"
      >
        <WelcomeTool />
        <Logo />
        <View className="items-center justify-center flex-1 w-full">
          <PhoneInput
            label={t("auth.phoneAuth.phoneInputLabel")}
            containerStyle="mb-4 w-4/5"
            placeholder={t("auth.phoneAuth.phoneInputPlaceholder")}
            initialCountry={"tr"}
            value={phoneNumber}
            placeholderTextColor={isDarkColorScheme ? "#EDF6F9" : "#023047"}
            error={errors.phoneNumber}
            onChange={({ value, error }) => {
              setPhoneNumber(value);
              if (error) {
                setErrors((prevData) => ({
                  ...prevData,
                  phoneNumber: error,
                }));
              } else {
                setErrors({});
              }
            }}
          />
          <Button
            label={t("auth.phoneAuth.sendCode")}
            disabled={Object.keys(errors).length > 0 || isLoading}
            onPress={handlePress}
            isLoading={isLoading}
            mb="mb-0"
          />
          {!!serverError && (
            <Text className="text-red-500 text-sm mt-2 text-center">{serverError}</Text>
          )}

          <Link
            href="/login"
            className="mt-2 text-base text-center text-placehoder dark:text-papaya"
          >
            {t("auth.phoneAuth.loginOrSignup")}{" "}
            <Text className="text-placehoder dark:text-papaya font-semibold">
              {t("auth.phoneAuth.emailAndPassword")}
            </Text>
          </Link>

          <GoogleAuth />
        </View>
      </View>
    </>
  );
};

export default PhoneAuthScreen;
