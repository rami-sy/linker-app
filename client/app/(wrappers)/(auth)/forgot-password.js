import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
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
import { Feather } from "@expo/vector-icons";

const ForgetPassword = () => {
  const [formData, setFormData] = useState({ email: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();

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
    if (email) setFormData({ email });
  }, [email]);

  useEffect(() => {
    if (autoSetPassword === "true" && formData.email) {
      handleForgotPassword();
    }
  }, [autoSetPassword, formData.email]);

  const handleInputChange = (name, value) => {
    if (serverError) setServerError("");
    setFormData((prev) => ({ ...prev, [name]: value }));
    const { error } = schema.validate({ ...formData, [name]: value }, { abortEarly: false });
    if (error) {
      const errorData = {};
      error.details.forEach((item) => { errorData[item.path[0]] = item.message; });
      setErrors(errorData);
    } else {
      setErrors({});
    }
  };

  const handleForgotPassword = async () => {
    const { error } = schema.validate(formData, { abortEarly: false });
    if (error) {
      const errorData = {};
      error.details.forEach((item) => { errorData[item.path[0]] = item.message; });
      setErrors(errorData);
      return;
    }
    setErrors({});
    setIsLoading(true);
    try {
      const response = await forgotPassword({ email: formData.email });
      if (response.type === "success") {
        router.push(`/reset-password?email=${encodeURIComponent(formData.email)}`);
      } else {
        setServerError(response.message || t("common.somethingWentWrong"));
      }
      setIsLoading(false);
    } catch {
      setIsLoading(false);
      setServerError(t("common.somethingWentWrong"));
    }
  };

  return (
    <>
      <Head>
        <title>Forgot Password | Linker</title>
        <meta name="description" content="Forgot your password? Enter your email to reset it." />
      </Head>
      <View className="items-center justify-between flex-1 relative w-full linker-w bg-[#dee4e6] dark:bg-[#12141b]">
        <WelcomeTool />
        <Logo my="mb-2 mt-9" />

        <View className="items-center justify-start flex-1 w-full">
          {/* Hero icon */}
          <View
            className="rounded-full p-4 mb-3"
            style={{ backgroundColor: "rgba(10,151,185,0.15)" }}
          >
            <Feather name="lock" size={36} color="#0a97b9" />
          </View>

          {/* Subtitle */}
          <Text className="text-sm text-slate-500 dark:text-slate-400 text-center w-3/4 mb-5">
            {t("auth.forgetPassword.subtitle") ||
              "Enter your email address and we'll send you a reset code."}
          </Text>

          {/* Form card */}
          <View
            className="w-11/12 rounded-3xl px-5 pt-5 pb-4"
            style={{
              backgroundColor: isDarkColorScheme ? "rgba(26,30,42,0.9)" : "rgba(240,247,249,0.9)",
            }}
          >
            <Input
              containerStyle="mb-3 w-full"
              placeholder={t("auth.forgetPassword.emailPlaceholder")}
              name="email"
              value={formData.email}
              onChange={(text) => handleInputChange("email", text)}
              error={errors.email}
            />

            <Button
              label={t("auth.forgetPassword.sendResetCode")}
              isLoading={isLoading}
              disabled={Object.keys(errors).length > 0 || isLoading}
              onPress={handleForgotPassword}
              mb="mb-0"
              w="w-full"
            />

            {!!serverError && (
              <Text className="text-red-500 text-sm mt-2 text-center">{serverError}</Text>
            )}

            {/* Back link */}
            <View className="items-center mt-4">
              <Link href="/welcome" className="text-sm text-center text-slate-400 dark:text-slate-500">
                {t("auth.forgetPassword.backToWelcome") || "Back to"}{" "}
                <Text className="font-semibold text-slate-500 dark:text-slate-400">
                  {t("auth.forgetPassword.welcomeScreen") || "Welcome"}
                </Text>
              </Link>
            </View>
          </View>
        </View>
      </View>
    </>
  );
};

export default ForgetPassword;
