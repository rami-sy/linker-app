import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
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
import { Feather } from "@expo/vector-icons";

const ResetPassword = () => {
  const [formData, setFormData] = useState({ code: "", email: "", password: "", confirmPassword: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  const { email } = useLocalSearchParams();

  useEffect(() => {
    setFormData((prev) => ({ ...prev, email: email || "" }));
  }, [email]);

  const schema = Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required().messages({
      "string.email": t("auth.resetPassword.pleaseEnterValidEmail"),
      "string.empty": t("auth.resetPassword.emailRequired"),
      "any.required": t("auth.resetPassword.emailRequired"),
    }),
    code: Joi.string().length(6).required().messages({
      "any.required": t("auth.resetPassword.resetCodeRequired"),
      "string.empty": t("auth.resetPassword.resetCodeRequired"),
      "string.length": t("auth.resetPassword.resetCodeLength"),
    }),
    password: Joi.string().min(6).max(128).required().messages({
      "string.min": t("auth.resetPassword.passwordPattern"),
      "string.max": t("auth.resetPassword.passwordPattern"),
      "string.empty": t("auth.resetPassword.passwordRequired"),
      "any.required": t("auth.resetPassword.passwordRequired"),
    }),
    confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
      "any.only": t("auth.resetPassword.passwordsDoNotMatch"),
      "string.empty": t("auth.resetPassword.confirmPasswordRequired"),
      "any.required": t("auth.resetPassword.confirmPasswordRequired"),
    }),
  });

  const handleResetPassword = async () => {
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
      const response = await resetPassword({
        email: formData.email,
        verificationCode: formData.code,
        newPassword: formData.password,
      });
      if (response.type === "success") {
        router.replace(`/login?email=${encodeURIComponent(formData.email)}`);
      } else {
        setServerError(response.message || t("common.somethingWentWrong"));
      }
      setIsLoading(false);
    } catch {
      setIsLoading(false);
      setServerError(t("common.somethingWentWrong"));
    }
  };

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

  return (
    <>
      <Head>
        <title>Reset Password | Linker</title>
        <meta name="description" content="Reset your password to access Linker." />
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
            <Feather name="key" size={36} color="#0a97b9" />
          </View>

          {/* Subtitle */}
          <Text className="text-sm text-slate-500 dark:text-slate-400 text-center w-3/4 mb-5">
            {t("auth.resetPassword.subtitle") ||
              "Enter the code from your email and choose a new password."}
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
              label={t("auth.resetPassword.resetCodeLabel")}
              placeholder={t("auth.resetPassword.resetCodePlaceholder")}
              value={formData.code}
              onChange={(text) => handleInputChange("code", text)}
              error={errors.code}
              autoCapitalize="none"
            />
            <Input
              containerStyle="mb-3 w-full"
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
              containerStyle="mb-3 w-full"
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
              w="w-full"
            />

            {!!serverError && (
              <Text className="text-red-500 text-sm mt-2 text-center">{serverError}</Text>
            )}

            {/* Back link */}
            <View className="items-center mt-4">
              <Link
                href="/forgot-password"
                className={`text-sm text-center text-slate-400 dark:text-slate-500 ${!formData.email ? "opacity-50" : ""}`}
              >
                {t("auth.resetPassword.backToWelcome") || "Back to"}{" "}
                <Text className="font-semibold text-slate-500 dark:text-slate-400">
                  {t("auth.resetPassword.forgotPasswordScreen") || "Forgot password"}
                </Text>
              </Link>
            </View>
          </View>
        </View>
      </View>
    </>
  );
};

export default ResetPassword;
