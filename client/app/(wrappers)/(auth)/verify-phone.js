import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Input from "../../../src/components/input";
import Button from "../../../src/components/button";
import { useDispatch } from "react-redux";
import { setMe } from "../../../src/redux/userSlice";
import { getMe, phoneAuth, phoneVerify } from "../../../src/api/me";
import Joi from "joi";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "~/lib/useColorScheme";
import WelcomeTool from "../../../src/components/welcome-tool";
import Logo from "../../../src/components/logo";
import { Link, router, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";

const VerifyPhone = () => {
  const [formData, setFormData] = useState({
    code: "",
    phoneNumber: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const { t } = useTranslation();
  const dispatch = useDispatch();

  const schema = Joi.object({
    code: Joi.string()
      .length(6)
      .required()
      .messages({
        "any.required": t("auth.verifyPhone.resetCodeRequired"),
        "string.empty": t("auth.verifyPhone.resetCodeRequired"),
        "string.length": t("auth.verifyPhone.resetCodeLength"),
      }),
    phoneNumber: Joi.string()
      .required()
      .messages({
        "any.required": t("auth.verifyPhone.phoneNumberRequired"),
        "string.empty": t("auth.verifyPhone.phoneNumberRequired"),
      }),
  });
  const { phoneNumber } = useLocalSearchParams();
  useEffect(() => {
    setFormData({
      ...formData,
      phoneNumber: phoneNumber,
    });
  }, [phoneNumber]);

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
      const response = await phoneVerify({
        phoneNumber: formData.phoneNumber,
        verificationCode: formData.code,
      });
      if (response.type === "success") {
        const response = await getMe();
        dispatch(setMe(response.data));

        if (response.data?.isCompleted) {
          // ✅ Use replace to clear auth stack
          router.replace("/chats");
        } else {
          // ✅ Use replace to clear auth stack
          router.replace("/user-info");
        }
      }
      setIsLoading(false);
    } catch (error) {
      console.log({ error });
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

  const resendVerificationCode = async () => {
    try {
      const response = await phoneAuth({
        phoneNumber: formData.phoneNumber,
      });
    } catch (error) {
      console.log({ error });
    }
  };
  const { isDarkColorScheme } = useColorScheme();

  return (
    <>
      <Head>
        <title>Verify Phone | Linker</title>
        <meta
          name="description"
          content="Verify your phone number to access all Linker features. Enter your verification code to complete the process."
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
            label={t("auth.verifyPhone.verificationCodeLabel")}
            placeholder={t("auth.verifyPhone.verificationCodePlaceholder")}
            value={formData.code}
            onChange={(text) => handleInputChange("code", text)}
            error={errors.code}
            autoCapitalize="none"
          />
          <Button
            containerStyle="mb-0"
            label={t("auth.verifyPhone.verifyButton")}
            isLoading={isLoading}
            disabled={Object.keys(errors).length > 0 || isLoading}
            onPress={handlePress}
          />
          <View className={`flex-row gap-x-4`}>
            <TouchableOpacity onPress={resendVerificationCode}>
              <Text
                className={`text-sm text-placehoder dark:text-papaya ${isLoading ? "opacity-50" : ""}`}
              >
                {t("auth.verifyPhone.resendCode")}
              </Text>
            </TouchableOpacity>
          </View>

          <View className={`absolute bottom-9`}>
            <Link
              href="/welcome"
              className="mt-2 text-sm text-center text-placehoder dark:text-papaya"
            >
              {t("auth.verifyPhone.backToWelcome")}{" "}
              <Text className="text-placehoder dark:text-papaya font-semibold">
                {t("auth.verifyPhone.welcomeScreen")}
              </Text>
            </Link>
          </View>
        </View>
      </View>
    </>
  );
};

export default VerifyPhone;
