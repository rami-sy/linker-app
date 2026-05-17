import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import Input from "../../../src/components/input";
import Button from "../../../src/components/button";

import { resetPassword } from "../../../src/api/me";
import Joi from "joi";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "~/lib/useColorScheme";
import WelcomeTool from "../../../src/components/welcome-tool";
import Logo from "../../../src/components/logo";
import { Link, router, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
const ResetPassword = () => {
  const [formData, setFormData] = useState({
    code: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  // const route = useRoute();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const { t } = useTranslation();
  const { email } = useLocalSearchParams();
  useEffect(() => {
    setFormData({
      ...formData,
      email: email,
    });
  }, [email]);

  const schema = Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .required()
      .messages({
        "string.email": t("auth.resetPassword.pleaseEnterValidEmail"),
        "string.empty": t("auth.resetPassword.emailRequired"),
        "any.required": t("auth.resetPassword.emailRequired"),
      }),
    code: Joi.string()
      .length(6)
      .required()
      .messages({
        "any.required": t("auth.resetPassword.resetCodeRequired"),
        "string.empty": t("auth.resetPassword.resetCodeRequired"),
        "string.length": t("auth.resetPassword.resetCodeLength"),
      }),
    password: Joi.string()
      .pattern(new RegExp("^[a-zA-Z0-9]{6,30}$"))
      .required()
      .messages({
        "string.pattern.base": t("auth.resetPassword.passwordPattern"),
        "string.empty": t("auth.resetPassword.passwordRequired"),
        "any.required": t("auth.resetPassword.passwordRequired"),
      }),
    confirmPassword: Joi.string()
      .valid(Joi.ref("password"))
      .required()
      .messages({
        "any.only": t("auth.resetPassword.passwordsDoNotMatch"),
        "string.empty": t("auth.resetPassword.confirmPasswordRequired"),
        "any.required": t("auth.resetPassword.confirmPasswordRequired"),
      }),
  });

  const handleResetPassword = async () => {
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
      const response = await resetPassword({
        email: formData.email,
        verificationCode: formData.code,
        newPassword: formData.password,
      });
      if (response.type === "success") {
        router.push(`/login?email=${formData.email}`);
      }
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
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
  const { isDarkColorScheme } = useColorScheme();
  return (
    <>
      <Head>
        <title>Reset Password | Linker</title>
        <meta
          name="description"
          content="Reset your password to access all Linker features. Enter your verification code to complete the process."
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
            label={t("auth.resetPassword.resetCodeLabel")}
            placeholder={t("auth.resetPassword.resetCodePlaceholder")}
            value={formData.code}
            onChange={(text) => handleInputChange("code", text)}
            error={errors.code}
            autoCapitalize="none"
          />
          <Input
            containerStyle="mb-4 w-4/5"
            placeholder={t("auth.resetPassword.newPasswordPlaceholder")}
            type="password"
            name="password"
            value={formData.password}
            onChange={(text) => handleInputChange("password", text)}
            error={errors.password}
            autoCapitalize="none"
            secureTextEntry={true}
          />

          <Input
            containerStyle="mb-4 w-4/5"
            placeholder={t("auth.resetPassword.confirmPasswordPlaceholder")}
            type="password"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={(text) => handleInputChange("confirmPassword", text)}
            error={errors.confirmPassword}
            autoCapitalize="none"
            secureTextEntry={true}
          />

          <Button
            label={t("auth.resetPassword.resetPasswordButton")}
            isLoading={isLoading}
            disabled={Object.keys(errors).length > 0 || isLoading}
            onPress={handleResetPassword}
            mb="mb-0"
          />

          <View className={`flex-row gap-x-4`}>
            <Link href="/forgot-password">
              <Text
                className={`text-base text-placehoder dark:text-papaya ${formData.email ? "" : "opacity-50"}`}
              >
                {t("auth.resetPassword.backToWelcome")}{" "}
                <Text className="text-placehoder dark:text-papaya font-semibold">
                  {t("auth.resetPassword.forgotPasswordScreen")}
                </Text>
              </Text>
            </Link>
          </View>
        </View>
      </View>
    </>
  );
};

export default ResetPassword;
