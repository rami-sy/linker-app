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
import FacebookAuth from "../../../src/components/facebook-auth";
import Head from "expo-router/head";

const SignupScreen = () => {
  const [formData, setFormData] = useState({ email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [serverError, setServerError] = useState("");
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  const keyboardVisible = useKeyboardVisibility();

  const schema = Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .required()
      .messages({
        "string.email": t("auth.signup.pleaseEnterValidEmail"),
        "string.empty": t("auth.signup.emailRequired"),
        "any.required": t("auth.signup.emailRequired"),
      }),
    password: Joi.string().min(6).max(128).required().messages({
      "string.min": t("auth.signup.passwordPattern"),
      "string.empty": t("auth.signup.passwordRequired"),
      "any.required": t("auth.signup.passwordRequired"),
    }),
    confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
      "any.only": t("auth.signup.passwordsDoNotMatch"),
      "string.empty": t("auth.signup.confirmPasswordRequired"),
      "any.required": t("auth.signup.confirmPasswordRequired"),
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
      const response = await signup(formData);
      if (response.type === "success") {
        router.replace(`/verify-email?email=${encodeURIComponent(formData.email)}`);
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
        <title>Signup | Linker, social media platform</title>
        <meta name="description" content="Create your Linker account and start connecting." />
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
            
            <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            {/* Page title */}
            <Text className="text-xl font-bold text-placehoder dark:text-papaya mb-1">
              {t("auth.signup.createAccount") || "Create your account"}
            </Text>
            <Text className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {t("auth.signup.joinLinker") || "Join Linker today — it's free"}
            </Text>

            <Input
              containerStyle="mb-3 w-full"
              placeholder={t("auth.signup.emailPlaceholder")}
              name="email"
              value={formData.email}
              onChange={(text) => handleInputChange("email", text)}
              error={errors.email}
            />
            <Input
              containerStyle="mb-3 w-full"
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
              containerStyle="mb-3 w-full"
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
              disabled={!hasInteracted || Object.keys(errors).length > 0 || isLoading}
              onPress={handlePress}
              isLoading={isLoading}
              mb="mb-0"
              w="w-full"
            />
            {!!serverError && (
              <Text className="text-red-500 text-sm mt-2 text-center">{serverError}</Text>
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

            {/* Login link */}
            <View className="items-center mt-3">
              <Link href="/login" className="text-sm text-center text-placehoder dark:text-papaya">
                {t("auth.signup.doYouHaveAccount") || "Already have an account?"}{" "}
                <Text className="text-primary font-semibold">
                  {t("auth.signup.login") || "Sign in"}
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

export default SignupScreen;
