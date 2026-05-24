import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Input from "../../../src/components/input";
import Button from "../../../src/components/button";
import { emailVerify, getMe, resendEmailVerificationCode } from "../../../src/api/me";
import Joi from "joi";
import { setMe } from "../../../src/redux/userSlice";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "~/lib/useColorScheme";
import WelcomeTool from "../../../src/components/welcome-tool";
import Logo from "../../../src/components/logo";
import { Link, router, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { Feather } from "@expo/vector-icons";

const VerifyEmail = () => {
  const [formData, setFormData] = useState({ code: "", email: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState("");
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { isDarkColorScheme } = useColorScheme();

  const schema = Joi.object({
    code: Joi.string().length(6).required().messages({
      "string.empty": t("auth.verifyEmail.resetCodeRequired"),
      "any.required": t("auth.verifyEmail.resetCodeRequired"),
      "string.length": t("auth.verifyEmail.resetCodeLength"),
    }),
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .when(Joi.ref("$emailRequired"), {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional().allow(""),
      })
      .messages({
        "string.email": t("auth.verifyEmail.pleaseEnterValidEmail"),
        "string.empty": t("auth.verifyEmail.emailRequired"),
        "any.required": t("auth.verifyEmail.emailRequired"),
      }),
  });

  const { email } = useLocalSearchParams();

  useEffect(() => {
    setFormData((prev) => ({ ...prev, email: email || "" }));
  }, [email]);

  const validateForm = (data) => {
    const { error } = schema.validate(data, {
      abortEarly: false,
      context: { emailRequired: !email },
    });
    return error;
  };

  const handlePress = async () => {
    const error = validateForm(formData);
    if (error) {
      const errorData = {};
      error.details.forEach((item) => { errorData[item.path[0]] = item.message; });
      setErrors(errorData);
      return;
    }
    setErrors({});
    setIsLoading(true);
    try {
      const response = await emailVerify({ email: formData.email, verificationCode: formData.code });
      if (response.type === "success") {
        const userResponse = await getMe();
        dispatch(setMe(userResponse.data));
        router.replace(userResponse.data?.isCompleted ? "/chats" : "/user-info");
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
    const { error } = schema.validate(
      { ...formData, [name]: value },
      { abortEarly: false, context: { emailRequired: !email } }
    );
    if (error) {
      const errorData = {};
      error.details.forEach((item) => { errorData[item.path[0]] = item.message; });
      setErrors(errorData);
    } else {
      setErrors({});
    }
  };

  const resendVerificationCode = async () => {
    setResendSuccess(false);
    setResendError("");
    setResendLoading(true);
    try {
      const response = await resendEmailVerificationCode({ email: formData.email });
      if (response?.type === "success") {
        setResendSuccess(true);
      } else {
        setResendError(response?.message || t("auth.verifyEmail.resendError"));
      }
    } catch {
      setResendError(t("auth.verifyEmail.resendError"));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Verify Email | Linker</title>
        <meta name="description" content="Verify your email to access all Linker features." />
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
            <Feather name="mail" size={36} color="#0a97b9" />
          </View>

          {/* Subtitle */}
          <Text className="text-sm text-slate-500 dark:text-slate-400 text-center w-3/4 mb-5">
            {t("auth.verifyEmail.subtitle") ||
              "We sent a 6-digit code to your email. Enter it below to verify your account."}
          </Text>

          {/* Form card */}
          <View
            className="w-11/12 rounded-3xl px-5 pt-5 pb-4"
            style={{
              backgroundColor: isDarkColorScheme ? "rgba(26,30,42,0.9)" : "rgba(240,247,249,0.9)",
            }}
          >
            {!email && (
              <Input
                containerStyle="mb-3 w-full"
                label={t("auth.verifyEmail.emailLabel") || "Email"}
                placeholder={t("auth.verifyEmail.emailPlaceholder")}
                value={formData.email}
                onChange={(text) => handleInputChange("email", text)}
                error={errors.email}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            )}

            <Input
              containerStyle="mb-3 w-full"
              label={t("auth.verifyEmail.verificationCodeLabel")}
              placeholder={t("auth.verifyEmail.verificationCodePlaceholder")}
              value={formData.code}
              onChange={(text) => handleInputChange("code", text)}
              error={errors.code}
              autoCapitalize="none"
            />

            <Button
              label={t("auth.verifyEmail.verifyButton")}
              isLoading={isLoading}
              disabled={Object.keys(errors).length > 0 || isLoading}
              onPress={handlePress}
              mb="mb-0"
              w="w-full"
            />

            {!!serverError && (
              <Text className="text-red-500 text-sm mt-2 text-center">{serverError}</Text>
            )}

            {/* Resend link */}
            <View className="items-center mt-4">
              <TouchableOpacity onPress={resendVerificationCode} disabled={isLoading || resendLoading}>
                <Text
                  className={`text-sm text-primary font-semibold underline ${(isLoading || resendLoading) ? "opacity-50" : ""}`}
                >
                  {resendLoading
                    ? (t("auth.verifyEmail.resendCode") || "Resend code") + "..."
                    : (t("auth.verifyEmail.resendCode") || "Resend code")}
                </Text>
              </TouchableOpacity>
              {resendSuccess && (
                <Text className="text-green-500 text-xs mt-1">
                  {t("auth.verifyEmail.resendSuccess") || "Code resent successfully"}
                </Text>
              )}
              {!!resendError && (
                <Text className="text-red-500 text-xs mt-1">{resendError}</Text>
              )}
            </View>

            {/* Back link */}
            <View className="items-center mt-3">
              <Link href="/welcome" className="text-sm text-center text-slate-400 dark:text-slate-500">
                {t("auth.verifyEmail.backToWelcome") || "Back to"}{" "}
                <Text className="font-semibold text-slate-500 dark:text-slate-400">
                  {t("auth.verifyEmail.welcomeScreen") || "Welcome"}
                </Text>
              </Link>
            </View>
          </View>
        </View>
      </View>
    </>
  );
};

export default VerifyEmail;
