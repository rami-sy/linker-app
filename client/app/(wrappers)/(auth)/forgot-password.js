import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Input from "../../../src/components/input";
import Button from "../../../src/components/button";

import { forgotPassword } from "../../../src/api/me";
import Joi from "joi";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "~/lib/useColorScheme";
import WelcomeTool from "../../../src/components/welcome-tool";
import Logo from "../../../src/components/logo";
import { Link, router, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";

const ForgetPassword = () => {
  const [formData, setFormData] = useState({
    email: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const { t } = useTranslation();

  const schema = Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .required()
      .messages({
        "string.empty": t("auth.forgetPassword.emailRequired"),
        "string.email": t("auth.forgetPassword.pleaseEnterValidEmail"),
        "any.required": t("auth.forgetPassword.emailRequired"),
      }),
  });
  const { email, autoSetPassword } = useLocalSearchParams();
  useEffect(() => {
    // 1) When "email" changes, update the form data
    if (email) {
      setFormData({ email });
    }
  }, [email]);

  useEffect(() => {
    // 2) When "autoSetPassword" is true AND formData.email has been set,
    //    call handleForgotPassword
    if (autoSetPassword === "true" && formData.email) {
      handleForgotPassword();
    }
  }, [autoSetPassword, formData.email]);
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

  const handleForgotPassword = async () => {
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
      const response = await forgotPassword({ email: formData.email });
      if (response.type === "success") {
        router.push(`/reset-password?email=${formData.email}`);
      }
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
    }
  };
  const { isDarkColorScheme } = useColorScheme();

  return (
    <>
      <Head>
        <title>Forgot Password | Linker</title>
        <meta
          name="description"
          content="Forgot your password? Enter your email to reset your password. Linker is the best way to connect with your friends. It's a social media platform that allows you to connect with your friends and family."
        />
      </Head>
      <View
        className="items-center justify-between flex-1 relative w-full md:w-1/2 lg:w-1/2 bg-[#dee4e6] dark:bg-[#12141b]"
      >
        <WelcomeTool />
        <Logo />
        <View className={`items-center justify-start flex-1 w-full`}>
          <Input
            containerStyle="mb-4 w-4/5"
            placeholder={t("auth.forgetPassword.emailPlaceholder")}
            name="email"
            value={formData.email}
            onChange={(text) => handleInputChange("email", text)}
            error={errors.email}
          />

          <Button
            containerStyle="mb-0"
            label={t("auth.forgetPassword.sendResetCode")}
            isLoading={isLoading}
            disabled={Object.keys(errors).length > 0 || isLoading}
            onPress={handleForgotPassword}
          />

          <View className={`flex-row gap-x-4`}>
            <TouchableOpacity onPress={handleForgotPassword}>
              <Text
                className={`text-base text-placehoder dark:text-papaya ${isLoading ? "opacity-50" : ""}`}
              >
                {t("auth.forgetPassword.resendCode")}
              </Text>
            </TouchableOpacity>
          </View>

          <View className={`absolute bottom-9`}>
            <Link
              href="/welcome"
              className="mt-2 text-base text-center text-placehoder dark:text-papaya"
            >
              {t("auth.forgetPassword.backToWelcome")}{" "}
              <Text className="text-placehoder dark:text-papaya font-semibold">
                {t("auth.forgetPassword.welcomeScreen")}
              </Text>
            </Link>
          </View>
        </View>
      </View>
    </>
  );
};

export default ForgetPassword;
