import { View, Text, TouchableOpacity, I18nManager } from "react-native";
import React, { useState } from "react";
import { useSelector } from "react-redux";
import Joi from "joi";
import { useTranslation } from "react-i18next";

import Input from "../../../src/components/input";
import Button from "../../../src/components/button";
import WelcomeTool from "../../../src/components/welcome-tool";
import Logo from "../../../src/components/logo";
import useKeyboardVisibility from "../../../src/hooks/use-keyboard-visibility";
import { Link, router } from "expo-router";
import CategoryPicker from "../../../src/components/category-picker";
import PhoneInput from "../../../src/components/phone-input";
import { deleteMyAccount, sendVerificationCode } from "../../../src/api/me";
import FeIcon from "react-native-vector-icons/Feather";
import { getLocales } from "expo-localization";
import { useColorScheme } from "~/lib/useColorScheme";
const DeleteMyAccount = () => {
  const { isDarkColorScheme } = useColorScheme();
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    email: "",
    phone: "",
    code: "",
    nextScreen: false,
    type: "email",
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // Validation schema
  const schema = Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .when("type", {
        is: "email",
        then: Joi.when("nextScreen", {
          is: false,
          then: Joi.required().messages({
            "string.email": t("auth.deleteAccount.pleaseEnterValidEmail"),
            "any.required": t("auth.deleteAccount.emailRequired"),
            "string.empty": t("auth.deleteAccount.emailRequired"),
          }),
          otherwise: Joi.optional().allow(""),
        }),
        otherwise: Joi.optional().allow(""),
      }),
    phone: Joi.string()
      .pattern(/^\+?[1-9]\d{1,14}$/) // E.164 format
      .when("type", {
        is: "phone",
        then: Joi.when("nextScreen", {
          is: false,
          then: Joi.required().messages({
            "string.pattern.base": t("auth.deleteAccount.validPhoneRequired"),
            "any.required": t("auth.deleteAccount.phoneRequired"),
            "string.empty": t("auth.deleteAccount.phoneRequired"),
          }),
          otherwise: Joi.optional().allow(""),
        }),
        otherwise: Joi.optional().allow(""),
      }),
    code: Joi.string()
      .length(6)
      .when("nextScreen", {
        is: true,
        then: Joi.required().messages({
          "string.length": t("auth.deleteAccount.validCodeRequired"),
          "any.required": t("auth.deleteAccount.verificationCodeRequired"),
          "string.empty": t("auth.deleteAccount.verificationCodeRequired"),
        }),
        otherwise: Joi.optional().allow(""),
      }),
    type: Joi.string().valid("email", "phone").required(),
    nextScreen: Joi.boolean().optional(),
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
      const response = await deleteMyAccount({
        verificationCode: formData.code,
      });

      if (response.type === "success") {
        setTimeout(() => {
          router.push("/", { relativeToDirectory: true });
        }, 1000);
      }
      setIsLoading(false);
    } catch (error) {
      console.log({ error });
      setIsLoading(false);
    }
  };

  const handleNextScreen = async () => {
    const { error } = schema.validate(formData, { abortEarly: false });

    if (error) {
      const errorData = {};
      error.details.forEach((item) => {
        errorData[item.path[0]] = item.message;
      });
      setErrors(errorData);
      return;
    }
    setErrors({});

    setIsLoading(true);

    try {
      const response = await sendVerificationCode({
        contact: formData.type === "email" ? formData.email : formData.phone,
        type: formData.type,
      });
      if (response.type === "success") {
        setFormData((prevData) => ({
          ...prevData,
          nextScreen: true,
        }));
      }
      setIsLoading(false);
    } catch (error) {
      console.log({ error });
      setIsLoading(false);
    }
  };
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

  const keyboardVisible = useKeyboardVisibility();
  return (
    <View className={`items-start justify-between flex-1`}>
      <View className={`items-center justify-between flex w-full`}>
        <WelcomeTool />
        <Logo
          my={keyboardVisible ? "my-0" : "my-9"}
          withText={!keyboardVisible}
        />
      </View>
      <TouchableOpacity
        className={`absolute items-center justify-center mr-3 top-[6px] z-10`}
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.push("/");
          }
        }}
      >
        {isRTL ? (
          <FeIcon
            name="chevron-right"
            size={35}
            color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
          />
        ) : (
          <FeIcon
            name="chevron-left"
            size={35}
            color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
          />
        )}
      </TouchableOpacity>

      <View className={`items-center justify-start flex-1 w-full`}>
        {formData.nextScreen ? (
          <>
            <Input
              containerStyle="mb-4 w-4/5"
              label={t("auth.deleteAccount.verificationCodeLabel")}
              placeholder={t("auth.deleteAccount.verificationCodePlaceholder")}
              value={formData.code}
              onChange={(text) => handleInputChange("code", text)}
              error={errors.code}
              autoCapitalize="none"
            />
            <Button
              containerStyle="mb-4 w-4/5"
              label={t("auth.deleteAccount.deleteButton")}
              disabled={Object.keys(errors).length > 0 || isLoading}
              isLoading={isLoading}
              onPress={handlePress}
            />
            <View className={`flex-row gap-x-4`}>
              <TouchableOpacity onPress={handleNextScreen}>
                <Text
                  className={`text-sm text-placehoder dark:text-papaya ${isLoading ? "opacity-50" : ""}`}
                >
                  {t("auth.deleteAccount.resendCode")}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <CategoryPicker
              label={t("auth.deleteAccount.type")}
              mb="mb-4"
              containerStyle="w-4/5"
              items={[
                {
                  name: t("auth.deleteAccount.email"),
                  _id: "email",
                },
                {
                  name: t("auth.deleteAccount.phone"),
                  _id: "phone",
                },
              ]}
              value={formData.type}
              onChange={(e) => {
                setFormData((prevData) => ({
                  ...prevData,
                  type: e,
                }));
              }}
              name="type"
              multiple={false}
            />
            {formData.type === "email" ? (
              <Input
                containerStyle="mb-4 w-4/5"
                label={t("auth.deleteAccount.emailLabel")}
                placeholder={t("auth.deleteAccount.emailPlaceholder")}
                name="email"
                value={formData.email}
                onChange={(text) => handleInputChange("email", text)}
                error={errors.email}
              />
            ) : (
              <PhoneInput
                label={t("auth.deleteAccount.phoneInputLabel")}
                containerStyle="mb-4 w-4/5"
                placeholder={t("auth.deleteAccount.phoneInputPlaceholder")}
                initialCountry={"tr"}
                value={formData.phone}
                placeholderTextColor={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                error={errors.phone}
                onChange={({ value, error }) => {
                  handleInputChange("phone", value);
                  if (error) {
                    setErrors((prevData) => ({
                      ...prevData,
                      phone: error,
                    }));
                  }
                }}
              />
            )}

            <Button
              label={t("auth.deleteAccount.getVerificationCode")}
              disabled={Object.keys(errors).length > 0 || isLoading}
              isLoading={isLoading}
              onPress={handleNextScreen}
            />
          </>
        )}
        <View className={`absolute bottom-9`}>
          <Link
            className="mt-2 text-base text-center text-placehoder dark:text-papaya"
            href="/"
          >
            {t("auth.deleteAccount.backToWelcome")}{" "}
            <Text
              className="text-placehoder dark:text-papaya font-semibold"
            >
              {t("auth.deleteAccount.welcomeScreen")}
            </Text>
          </Link>
        </View>
      </View>
    </View>
  );
};

export default DeleteMyAccount;
