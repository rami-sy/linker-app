import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Input from "../../../src/components/input";
import Button from "../../../src/components/button";

import {
  emailVerify,
  getMe,
  resendEmailVerificationCode,
} from "../../../src/api/me";
import Joi from "joi";
import { setMe } from "../../../src/redux/userSlice";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "~/lib/useColorScheme";
import WelcomeTool from "../../../src/components/welcome-tool";
import Logo from "../../../src/components/logo";
import { Link, router, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
const VerifyEmail = () => {
  const [formData, setFormData] = useState({
    code: "",
    email: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const { t } = useTranslation();
  // const route = useRoute();
  const dispatch = useDispatch();

  const schema = Joi.object({
    code: Joi.string()
      .length(6)
      .required()
      .messages({
        "string.empty": t("auth.verifyEmail.resetCodeRequired"),
        "any.required": t("auth.verifyEmail.resetCodeRequired"),
        "string.length": t("auth.verifyEmail.resetCodeLength"),
      }),
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .required()
      .messages({
        "string.email": t("auth.verifyEmail.pleaseEnterValidEmail"),
        "string.empty": t("auth.verifyEmail.emailRequired"),
        "any.required": t("auth.verifyEmail.emailRequired"),
      }),
  });
  const { email } = useLocalSearchParams();
  useEffect(() => {
    setFormData({
      ...formData,
      email: email,
    });
  }, [email]);

  const handlePress = async () => {
    const { error } = schema.validate(formData, { abortEarly: false });
    if (error) {
      const errorData = {};
      error.details.forEach((item) => {
        errorData[item.path[0]] = item.message;
      });

      setErrors(errorData);
      return;
    } else {
      setErrors({});
    }

    setIsLoading(true);
    try {
      const response = await emailVerify({
        email: formData.email,
        verificationCode: formData.code,
      });

      if (response.type === "success") {
        const userResponse = await getMe();
        dispatch(setMe(userResponse.data));
        if (userResponse.data?.isCompleted) {
          // ✅ Use replace to clear auth stack
          router.replace("/chats");
        } else {
          // ✅ Use replace to clear auth stack
          router.replace("/user-info");
        }
      }
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      console.log({ error });
    }
  };

  const handleInputChange = (name, value) => {
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));

    // Validate the entire form data
    const { error } = schema.validate(
      { ...formData, [name]: value },
      { abortEarly: false }
    );
    if (error) {
      const errorData = {};
      error.details.forEach((item) => {
        errorData[item.path[0]] = item.message;
      });
      setErrors(errorData);
    } else {
      setErrors({});
    }
  };

  const resendVerificationCode = async () => {
    try {
      const response = await resendEmailVerificationCode({
        email: formData.email,
      });
    } catch (error) {
      console.log({ error });
    }
  };
  const { isDarkColorScheme } = useColorScheme();
  console.log({ errors });
  return (
    <>
      <Head>
        <title>Verify Email | Linker</title>
        <meta
          name="description"
          content="Verify your email to access all Linker features. Enter your verification code to complete the process."
        />
      </Head>
      <View
        className="items-center justify-between flex-1 relative w-full md:w-1/2 lg:w-1/2 bg-[#dee4e6] dark:bg-[#12141b]"
      >
        <WelcomeTool />
        <Logo />

        <View className={`items-center justify-start flex-1 w-full`}>
          {/* <Input
          placeholder={t("auth.verifyEmail.emailPlaceholder")}
          name="email"
          value={formData.email}
          onChange={(text) => handleInputChange("email", text)}
          error={errors.email}
        /> */}

          <Input
            containerStyle="mb-4 w-4/5"
            label={t("auth.verifyEmail.verificationCodeLabel")}
            placeholder={t("auth.verifyEmail.verificationCodePlaceholder")}
            value={formData.code}
            onChange={(text) => handleInputChange("code", text)}
            error={errors.code}
            autoCapitalize="none"
          />
          <Button
            containerStyle="mb-0 w-4/5"
            label={t("auth.verifyEmail.verifyButton")}
            isLoading={isLoading}
            disabled={Object.keys(errors).length > 0 || isLoading}
            onPress={handlePress}
          />
          <View className={`flex-row gap-x-4`}>
            <TouchableOpacity onPress={resendVerificationCode}>
              <Text
                className={`text-sm text-placehoder dark:text-papaya ${isLoading ? "opacity-50" : ""}`}
              >
                {t("auth.verifyEmail.resendCode")}
              </Text>
            </TouchableOpacity>
          </View>

          <View className={`absolute bottom-9`}>
            <Link
              href="/welcome"
              className="mt-2 text-sm text-center text-placehoder dark:text-papaya"
              onPress={() => {
                router.push("/welcome");
              }}
            >
              {t("auth.verifyEmail.backToWelcome")}{" "}
              <Text className="text-placehoder dark:text-papaya font-semibold">
                {t("auth.verifyEmail.welcomeScreen")}
              </Text>
            </Link>
          </View>
        </View>
      </View>
    </>
  );
};

export default VerifyEmail;
