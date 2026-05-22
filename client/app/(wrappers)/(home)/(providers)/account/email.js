import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import React, { useEffect, useState } from "react";
import Input from "../../../../../src/components/input";

import Button from "../../../../../src/components/button";
import {
  changeEmail,
  emailVerify,
  getMe,
  resendEmailVerificationCode,
} from "../../../../../src/api/me";
import { addAlert } from "../../../../../src/redux/alertSlice";
import { useDispatch, useSelector } from "react-redux";
import { setMe } from "../../../../../src/redux/userSlice";
import Joi from "joi";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import Layout from "../../../../../src/components/layout";
import { useColorScheme } from "~/lib/useColorScheme";
import ContextMenu from "../../../../../src/components/context-menu";
import FeIcon from "react-native-vector-icons/Feather";
import { getAccountMenuOptions } from "./account-menu-options";

const EmailScreen = () => {
  const { t } = useTranslation();
  const { user } = useSelector((state) => state.users);
  const [isVerificationStep, setIsVerificationStep] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    code: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  const [errors, setErrors] = useState({});
  useEffect(() => {
    setFormData({
      ...formData,
      email: user.email,
    });

    setIsVerificationStep(
      user?.email && !user?.emailVerification?.verified ? true : false
    );
  }, [user]);

  const emailSchema = Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .required()
      .messages({
        "string.email": t("account.emailScreen.errors.email.invalid"),
        "string.empty": t("account.emailScreen.errors.email.required"),
        "any.required": t("account.emailScreen.errors.email.required"),
      }),
  }).unknown(true);

  const verificationCodeSchema = Joi.object({
    code: Joi.string()
      .length(6)
      .required()
      .messages({
        "any.required": t(
          "account.emailScreen.errors.verificationCode.required"
        ),
        "string.empty": t(
          "account.emailScreen.errors.verificationCode.required"
        ),
        "string.length": t(
          "account.emailScreen.errors.verificationCode.length"
        ),
      }),
  }).unknown(true);
  const { isDarkColorScheme } = useColorScheme();
  const menuOptions = React.useMemo(
    () => getAccountMenuOptions("email", t, isDarkColorScheme, user),
    [t, isDarkColorScheme, user]
  );
  const activeSection = menuOptions.find((o) => o.selected);
  const dispatch = useDispatch();
  const handleInputChange = (name, value) => {
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
    // Validate the entire form data
    if (isVerificationStep) {
      const { error } = verificationCodeSchema.validate(
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
    } else {
      const { error } = emailSchema.validate(
        { email: value },
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
    }
  };

  const onClick = async () => {
    const { error } = emailSchema.validate(formData, { abortEarly: false });
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
      if (!formData.email) {
        dispatch(
          addAlert({
            message: t("account.emailScreen.errors.email.required"),
            type: "error",
          })
        );
        return;
      }
      const res = await changeEmail(formData);
      if (res.type === "success") {
        const data = await getMe();
        if (data.type === "success") {
          dispatch(setMe(data.data));
        }

        setIsVerificationStep(true);
        setErrors({});
      }
      setIsLoading(false);
    } catch (error) {
      console.log({ error });
      setIsLoading(false);
    }
  };

  const onVerify = async () => {
    const { error } = verificationCodeSchema.validate(formData, {
      abortEarly: false,
    });
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
      const response = await emailVerify({
        email: formData.email,
        verificationCode: formData.code,
      });
      if (response.type === "success") {
        const data = await getMe();
        if (data.type === "success") {
          dispatch(setMe(data.data));
          setIsVerificationStep(false);
          setFormData({
            ...formData,
            code: "",
          });
          setErrors({});
        }
      }
      setIsLoading(false);
    } catch (error) {
      console.log({ error });
      setIsLoading(false);
    }
  };

  const resendVerificationCode = async () => {
    try {
      const response = await resendEmailVerificationCode({
        email: formData.email,
      });
    } catch (error) {
      console.log({ error });
    }
  };

  return (
    <Layout
      label={
        user?.email
          ? t("account.emailScreen.title.change")
          : t("account.emailScreen.title.add")
      }
      back
      onBack={() => router.push("/user")}
      pb="pb-4"
      className="items-stretch flex-1 relative w-full linker-w bg-[#dee4e6] dark:bg-[#12141b]"
      navBar={
        <View className="flex-row flex-1 items-center justify-end w-full gap-x-3">
          <ContextMenu
            options={menuOptions}
            placement="bottom"
            width={260}
            menuClassName="rounded-2xl shadow-lg"
          >
            <View
              className={`flex-row items-center h-12 px-4 py-3 rounded-2xl ${
                activeSection?.selected
                  ? "bg-[#0a97b9]"
                  : "bg-white dark:bg-[#171b25]"
              }`}
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: activeSection?.selected
                  ? isDarkColorScheme
                    ? 0.35
                    : 0.18
                  : isDarkColorScheme
                  ? 0.22
                  : 0.08,
                shadowRadius: activeSection?.selected ? 12 : 8,
                elevation: activeSection?.selected ? 8 : 4,
              }}
            >
              {activeSection?.icon && (
                <View className="mr-2">
                  {React.cloneElement(activeSection.icon, {
                    size: 20,
                    color: activeSection.selected
                      ? "#f6f8f9"
                      : isDarkColorScheme
                      ? "#94a3b8"
                      : "#475569",
                  })}
                </View>
              )}
              <Text
                className={`text-sm font-semibold ${
                  activeSection?.selected
                    ? "text-white"
                    : "text-slate-800 dark:text-slate-100"
                }`}
                numberOfLines={1}
              >
                {activeSection?.name ||
                  (user?.email ? t("user.changeEmail") : t("user.addEmail"))}
              </Text>
              <View className="ml-2">
                <FeIcon
                  name="chevron-down"
                  size={18}
                  color={
                    activeSection?.selected
                      ? "#f6f8f9"
                      : isDarkColorScheme
                      ? "#94a3b8"
                      : "#475569"
                  }
                />
              </View>
            </View>
          </ContextMenu>
        </View>
      }
    >
      <View className="w-full flex-1 px-4 pt-1">
        <ScrollView
          contentContainerStyle={{
            marginTop: 8,
            marginBottom: 8,
          }}
          className={`mb-2`}
        >
        {!isVerificationStep ? (
          <>
            <Input
              containerStyle="w-full"
              inputStyle="h-12"
              placeholder={t("account.emailScreen.input.email")}
              value={formData.email}
              onChange={(text) => handleInputChange("email", text)}
              autoCapitalize="none"
              error={errors.email}
            />
            {user?.email && (
              <TouchableOpacity
                onPress={() => {
                  setIsVerificationStep(true);
                }}
              >
                <Text
                  className="text-sm text-slate-900 dark:text-slate-100"
                >
                  {t("account.emailScreen.alreadyHaveCode")}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <Input
              containerStyle="w-full"
              inputStyle="h-12"
              placeholder={t("account.emailScreen.input.verificationCode")}
              label={t("account.emailScreen.input.verificationCodeLabel")}
              value={formData.code}
              onChange={(text) => handleInputChange("code", text)}
              autoCapitalize="none"
              error={errors.code}
            />
            <View className={`flex-row justify-between w-full gap-x-4`}>
              <TouchableOpacity
                onPress={() => {
                  resendVerificationCode();
                }}
              >
                <Text
                  className={`text-sm text-placehoder dark:text-papaya ${isLoading ? "opacity-50" : ""}`}
                >
                  {t("account.emailScreen.resendCode")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setIsVerificationStep(false);
                }}
              >
                <Text
                  className="text-sm text-slate-900 dark:text-slate-100"
                >
                  {t("account.emailScreen.changeEmail")}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        </ScrollView>
      </View>
      <Button
        disabled={
          Object.keys(errors).length > 0 ||
          isLoading ||
          (!isVerificationStep && user?.email === formData.email)
        }
        isLoading={isLoading}
        label={
          isVerificationStep
            ? t("account.emailScreen.buttons.verify")
            : user?.email
            ? t("account.emailScreen.buttons.changeEmail")
            : t("account.emailScreen.buttons.addEmail")
        }
        w={"w-full"}
        h={"h-12"}
        onPress={() => {
          isVerificationStep ? onVerify() : onClick();
        }}
        mb="mb-0"
      />
    </Layout>
  );
};

export default EmailScreen;
