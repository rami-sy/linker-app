import React, { useState } from "react";
import { Text, View } from "react-native";
import Input from "../../../src/components/input";
import Button from "../../../src/components/button";
import Joi from "joi";
import { signup } from "../../../src/api/me";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "~/lib/useColorScheme";
import WelcomeTool from "../../../src/components/welcome-tool";
import Logo from "../../../src/components/logo";
import useKeyboardVisibility from "../../../src/hooks/use-keyboard-visibility";
import { Link, router } from "expo-router";
import GoogleAuth from "../../../src/components/google-auth";
import Head from "expo-router/head";
const SignupScreen = () => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  const schema = Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .required()
      .messages({
        "string.email": t("auth.signup.pleaseEnterValidEmail"),
        "string.empty": t("auth.signup.emailRequired"),
        "any.required": t("auth.signup.emailRequired"),
      }),
    password: Joi.string()
      .pattern(new RegExp("^[a-zA-Z0-9]{6,30}$"))
      .required()
      .messages({
        "string.pattern.base": t("auth.signup.passwordPattern"),
        "string.empty": t("auth.signup.passwordRequired"),
        "any.required": t("auth.signup.passwordRequired"),
      }),
    confirmPassword: Joi.string()
      .valid(Joi.ref("password"))
      .required()
      .messages({
        "any.only": t("auth.signup.passwordsDoNotMatch"),
        "string.empty": t("auth.signup.confirmPasswordRequired"),
        "any.required": t("auth.signup.confirmPasswordRequired"),
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
      const response = await signup(formData);

      if (response.type === "success") {
        // ✅ Use replace - user shouldn't go back to signup after registering
        router.replace(`/login?email=${formData.email}`);
      }
      setIsLoading(false);
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
        <title>Signup | Linker, social media platform</title>
        <meta
          name="description"
          content="Linker is the best way to connect with your friends. It's a social media platform that allows you to connect with your friends and family."
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
        <View
          className={`items-center justify-start flex-1 w-full ${
            keyboardVisible ? "mt-12" : ""
          }`}
        >
          <Input
            containerStyle="mb-4 w-4/5"
            placeholder={t("auth.signup.emailPlaceholder")}
            name="email"
            value={formData.email}
            onChange={(text) => handleInputChange("email", text)}
            error={errors.email}
          />
          <Input
            containerStyle="mb-4 w-4/5"
            placeholder={t("auth.signup.passwordPlaceholder")}
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
            placeholder={t("auth.signup.confirmPasswordPlaceholder")}
            type="password"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={(text) => handleInputChange("confirmPassword", text)}
            error={errors.confirmPassword}
            autoCapitalize="none"
            secureTextEntry={true}
          />
          <Button
            label={t("auth.signup.signupButton")}
            disabled={Object.keys(errors).length > 0 || isLoading}
            onPress={handlePress}
            isLoading={isLoading}
            mb="mb-0"
          />
          <GoogleAuth />

          <View className={`absolute bottom-9`}>
            <Link
              className="mt-4 text-base text-center text-placehoder dark:text-papaya"
              href="/login"
            >
              {t("auth.signup.doYouHaveAccount")}{" "}
              <Text className="text-placehoder dark:text-papaya font-semibold">
                {t("auth.signup.login")}
              </Text>
            </Link>

            {/* <Link
            href="/phone-auth"
            className="mt-2 text-base text-center text-placehoder dark:text-papaya"
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
    </>
  );
};

export default SignupScreen;
