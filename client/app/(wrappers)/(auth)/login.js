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
import { getLocales } from "expo-localization";
import Head from "expo-router/head";

const LoginScreen = () => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";
  const { email } = useLocalSearchParams();
  const [openSetPassword, setOpenSetPassword] = useState(false);

  useEffect(() => {
    setFormData({
      email: email || "",
      password: "",
    });
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
    // Login: server validates hash; allow symbols (client signup may be stricter)
    password: Joi.string().min(6).max(128).required().messages({
      "string.min": t("auth.login.passwordPattern"),
      "any.required": t("auth.login.passwordRequired"),
      "string.empty": t("auth.login.passwordRequired"),
    }),
  });

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
      // co
      const response = await signin(formData);
      if (response.type === "success") {
        const userResponse = await getMe();
        dispatch(setMe(userResponse.data));
        if (!userResponse.data?.emailVerification?.verified) {
          // ✅ Use replace to prevent going back to login after verification
          router.replace({
            pathname: "/verify-email",
            params: { email: formData.email },
          });
        } else {
          if (userResponse.data?.isCompleted) {
            // ✅ Use replace to clear auth stack
            router.replace("/chats");
          } else {
            // ✅ Use replace to clear auth stack
            router.replace("/user-info");
          }
        }
      }
      setIsLoading(false);

      if (response.type === "error" && response.data.openSetPassword) {
        setOpenSetPassword(true);
      }
    } catch (error) {
      console.log({ error });
      setIsLoading(false);
    }
  };
  const { isDarkColorScheme } = useColorScheme();
  const keyboardVisible = useKeyboardVisibility();

  return (
    <>
      <Head>
        <title>Login | Linker</title>
        <meta
          name="description"
          content="Login to Linker to access all features. Enter your email and password to complete the process."
        />
      </Head>
      <View
        className="items-center justify-between flex-1 relative w-full linker-w bg-[#dee4e6] dark:bg-[#12141b]"
      >
        {!keyboardVisible && (
          <>
            <WelcomeTool />
            <Logo />
          </>
        )}
        <View className="items-center justify-center flex-1 w-full">
          <View
            className={`items-center justify-start flex-1 w-full ${
              keyboardVisible ? "mt-12" : ""
            }`}
          >
            <Input
              containerStyle="mb-4 w-4/5"
              placeholder={t("auth.login.emailPlaceholder")}
              name="email"
              value={formData.email}
              onChange={(text) => handleInputChange("email", text)}
              error={errors.email}
            />

            {!openSetPassword ? (
              <>
                <Input
                  containerStyle="mb-4 w-4/5"
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
                <Button
                  label={t("auth.login.loginButton")}
                  disabled={isLoading}
                  onPress={handlePress}
                  isLoading={isLoading}
                  mb="mb-0"
                />
              </>
            ) : (
              <Button
                label={t("auth.login.setNewPassword")}
                onPress={() => {
                  router.push({
                    pathname: "/forgot-password",
                    params: {
                      email: formData.email,
                      autoSetPassword: true,
                    },
                  });
                }}
                isLoading={isLoading}
                mb="mb-0"
              />
            )}
            <GoogleAuth />

            {!openSetPassword && (
              <Link
                href="/forgot-password"
                className="text-base text-center mt-3 text-placehoder dark:text-papaya"
              >
                {t("auth.login.forgotPassword")}{" "}
                <Text className="text-placehoder dark:text-papaya font-semibold">
                  {t("auth.login.pressHere")}
                </Text>
              </Link>
            )}
            <Link
              href="/signup"
              className="mt-4 text-base text-center text-placehoder dark:text-papaya"
            >
              {t("auth.login.dontHaveAccount")}{" "}
              <Text className="text-placehoder dark:text-papaya font-semibold">
                {t("auth.login.signup")}
              </Text>
            </Link>

            <View className={`absolute bottom-9`}>
              {/* <Link
              className="mt-4 text-base text-center text-placehoder dark:text-papaya"
              href="/phone-auth"
            >
              {t("auth.login.loginWithPhonePrefix")}
              <Text className="text-placehoder dark:text-papaya font-semibold"
              >
                {t("auth.login.loginWithPhoneHighlighted")}
              </Text>
            </Link> */}
            </View>
          </View>
        </View>
      </View>
    </>
  );
};

export default LoginScreen;
