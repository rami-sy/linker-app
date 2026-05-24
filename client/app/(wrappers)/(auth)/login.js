import React, { useEffect, useState } from "react";
import { Text, View, I18nManager } from "react-native";
import { useDispatch } from "react-redux";
import Joi from "joi";
import { getMe, signin } from "../../../src/api/me";
import { setMe } from "../../../src/redux/userSlice";
import Input from "../../../src/components/input";
import Button from "../../../src/components/button";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "~/lib/useColorScheme";
import WelcomeTool from "../../../src/components/welcome-tool";
import Logo from "../../../src/components/logo";
import useKeyboardVisibility from "../../../src/hooks/use-keyboard-visibility";
import { Link, router, useLocalSearchParams } from "expo-router";
import GoogleAuth from "../../../src/components/google-auth";
import FacebookAuth from "../../../src/components/facebook-auth";
import Head from "expo-router/head";

const LoginScreen = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [serverError, setServerError] = useState("");
  const [openSetPassword, setOpenSetPassword] = useState(false);
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const isRTL = I18nManager.isRTL;
  const { email } = useLocalSearchParams();
  const { isDarkColorScheme } = useColorScheme();
  const keyboardVisible = useKeyboardVisibility();

  useEffect(() => {
    setFormData({ email: email || "", password: "" });
  }, [email]);

  const schema = Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .required()
      .messages({
        "string.email": t("auth.login.pleaseEnterValidEmail"),
        "any.required": t("auth.login.emailRequired"),
        "string.empty": t("auth.login.emailRequired"),
      }),
    password: Joi.string().min(6).max(128).required().messages({
      "string.min": t("auth.login.passwordPattern"),
      "any.required": t("auth.login.passwordRequired"),
      "string.empty": t("auth.login.passwordRequired"),
    }),
  });

  const handleInputChange = (name, value) => {
    if (!hasInteracted) setHasInteracted(true);
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

  const handlePress = async () => {
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
      const response = await signin(formData);
      if (response.type === "success") {
        const userResponse = await getMe();
        dispatch(setMe(userResponse.data));
        if (!userResponse.data?.emailVerification?.verified) {
          router.replace({ pathname: "/verify-email", params: { email: formData.email } });
        } else if (userResponse.data?.isCompleted) {
          router.replace("/chats");
        } else {
          router.replace("/user-info");
        }
      } else {
        if (response.data?.openSetPassword) {
          setOpenSetPassword(true);
        } else {
          setServerError(response.message || t("common.somethingWentWrong"));
        }
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
        <title>Login | Linker</title>
        <meta name="description" content="Login to Linker to access all features." />
      </Head>
      <View className="items-center justify-between flex-1 relative w-full linker-w bg-[#dee4e6] dark:bg-[#12141b]">
        {!keyboardVisible && (
          <>
            <WelcomeTool />
            <Logo my="mb-2 mt-9" />
          </>
        )}

        {/* Form card */}
        <View
          className={`items-center w-full flex-1 ${keyboardVisible ? "mt-10 justify-start" : "justify-start"}`}
        >
          <View
            className="w-11/12 rounded-3xl pb-4"
            style={{
              backgroundColor: isDarkColorScheme ? "rgba(26,30,42,0.9)" : "rgba(240,247,249,0.9)",
              overflow: "hidden",
            }}
          >
            {/* Teal accent bar at top */}
            <View style={{ height: 3, backgroundColor: "#0a97b9", borderTopLeftRadius: 24, borderTopRightRadius: 24 }} />
            <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            {/* Page title */}
            <Text className="text-xl font-bold text-placehoder dark:text-papaya mb-1">
              {t("auth.login.welcomeBack") || "Welcome back"}
            </Text>
            <Text className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {t("auth.login.signInToContinue") || "Sign in to continue"}
            </Text>

            <Input
              containerStyle="mb-3 w-full"
              placeholder={t("auth.login.emailPlaceholder")}
              name="email"
              value={formData.email}
              onChange={(text) => handleInputChange("email", text)}
              error={errors.email}
            />

            {!openSetPassword ? (
              <>
                <Input
                  containerStyle="mb-3 w-full"
                  placeholder={t("auth.login.passwordPlaceholder")}
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={(text) => handleInputChange("password", text)}
                  error={errors.password}
                  autoCapitalize="none"
                  secureTextEntry={true}
                  textAlign={isRTL ? "right" : "left"}
                />

                {/* Forgot password link — right-aligned */}
                <View className="w-full items-end mb-3">
                  <Link href="/forgot-password" className="text-sm text-primary font-semibold">
                    {t("auth.login.forgotPassword") || "Forgot password?"}
                  </Link>
                </View>

                <Button
                  label={t("auth.login.loginButton")}
                  disabled={!hasInteracted || Object.keys(errors).length > 0 || isLoading}
                  onPress={handlePress}
                  isLoading={isLoading}
                  mb="mb-0"
                  w="w-full"
                />
                {!!serverError && (
                  <Text className="text-red-500 text-sm mt-2 text-center">{serverError}</Text>
                )}
              </>
            ) : (
              <Button
                label={t("auth.login.setNewPassword")}
                onPress={() => router.push({ pathname: "/forgot-password", params: { email: formData.email, autoSetPassword: true } })}
                isLoading={isLoading}
                mb="mb-0"
                w="w-full"
              />
            )}

            {/* OR divider */}
            <View className="flex-row items-center my-4">
              <View className="flex-1 bg-slate-300 dark:bg-slate-700" style={{ height: 1 }} />
              <Text className="mx-3 text-sm text-slate-400">OR</Text>
              <View className="flex-1 bg-slate-300 dark:bg-slate-700" style={{ height: 1 }} />
            </View>

            <View className="flex-row items-center justify-center gap-4">
              <GoogleAuth onError={setServerError} />
              <FacebookAuth onError={setServerError} />
            </View>

            {/* Sign up link */}
            <View className="items-center mt-3">
              <Link href="/signup" className="text-sm text-center text-placehoder dark:text-papaya">
                {t("auth.login.dontHaveAccount") || "Don't have an account?"}{" "}
                <Text className="text-primary font-semibold">
                  {t("auth.login.signup") || "Sign up"}
                </Text>
              </Link>
            </View>
            </View>
          </View>
        </View>
      </View>
    </>
  );
};

export default LoginScreen;
