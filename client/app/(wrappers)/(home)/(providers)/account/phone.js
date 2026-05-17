import { ScrollView, View, Text, TouchableOpacity } from "react-native";
import React, { useEffect, useState } from "react";
import Layout from "../../../../../src/components/layout";
import Input from "../../../../../src/components/input";

import Button from "../../../../../src/components/button";
import {
  changePhoneNumber,
  getMe,
  phoneAuth,
  phoneVerify,
} from "../../../../../src/api/me";
import { useDispatch, useSelector } from "react-redux";
import { setMe } from "../../../../../src/redux/userSlice";
import PhoneInput from "../../../../../src/components/phone-input";
import Joi from "joi";
import { useTranslation } from "react-i18next"; // استيراد useTranslation
import { router } from "expo-router";
import { useColorScheme } from "~/lib/useColorScheme";
import ContextMenu from "../../../../../src/components/context-menu";
import FeIcon from "react-native-vector-icons/Feather";
import { getAccountMenuOptions } from "./account-menu-options";

const PhoneScreen = () => {
  const { t } = useTranslation(); // استخدام useTranslation
  const { user } = useSelector((state) => state.users);
  const [isVerificationStep, setIsVerificationStep] = useState(false);

  const [formData, setFormData] = useState({
    code: "",
  });
  const [phoneNumber, setPhoneNumber] = useState("");
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const verificationCodeSchema = Joi.object({
    code: Joi.string()
      .length(6)
      .required()
      .messages({
        "any.required": t(
          "account.phoneScreen.errors.verificationCode.required"
        ), // استخدام الترجمة
        "string.empty": t(
          "account.phoneScreen.errors.verificationCode.required"
        ), // استخدام الترجمة
        "string.length": t(
          "account.phoneScreen.errors.verificationCode.length"
        ), // استخدام الترجمة
      }),
  }).unknown(true);

  useEffect(() => {
    setPhoneNumber(user?.phoneNumber ?? "");
    setIsVerificationStep(
      user?.phoneNumber && !user?.phoneVerification?.verified ? true : false
    );
  }, [user]);

  const dispatch = useDispatch();
  const { isDarkColorScheme } = useColorScheme();
  const menuOptions = React.useMemo(
    () => getAccountMenuOptions("phone", t, isDarkColorScheme, user),
    [t, isDarkColorScheme, user]
  );
  const activeSection = menuOptions.find((o) => o.selected);
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
    }
  };
  const onClick = async () => {
    setIsLoading(true);

    try {
      if (!phoneNumber) {
        setErrors((prevData) => ({
          ...prevData,
          phoneNumber: t("account.phoneScreen.errors.phoneNumber.required"), // استخدام الترجمة
        }));
        setIsLoading(false);
        return;
      }
      const res = await changePhoneNumber({
        phoneNumber: phoneNumber,
      });
      if (res.type === "success") {
        const data = await getMe();
        if (data.type === "success") {
          dispatch(setMe(data.data));
        }

        setTimeout(() => {
          setIsVerificationStep(true);
          setErrors({});
        }, 1000);
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
    } else {
      setErrors({});
    }

    setIsLoading(true);
    try {
      const response = await phoneVerify({
        phoneNumber: phoneNumber,
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
      const response = await phoneAuth({
        phoneNumber: phoneNumber,
      });
    } catch (error) {
      console.log({ error });
    }
  };

  return (
    <Layout
      label={
        user?.phoneNumber
          ? t("account.phoneScreen.title.change")
          : t("account.phoneScreen.title.add")
      } // استخدام الترجمة
      back
      onBack={() => router.push("/user")}
      pb="pb-4"
      className="items-stretch flex-1 relative w-full md:w-1/2 lg:w-1/2 bg-[#dee4e6] dark:bg-[#12141b]"
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
                  (user?.phoneNumber
                    ? t("user.changePhoneNumber")
                    : t("user.addPhoneNumber"))}
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
            <PhoneInput
              containerStyle={"w-full"}
              placeholder={t("account.phoneScreen.input.phoneNumber")} // استخدام الترجمة
              initialCountry={"tr"}
              value={phoneNumber}
              error={errors?.phoneNumber}
              onChange={({ value, error }) => {
                setPhoneNumber(value);
                if (error) {
                  setErrors((prevData) => ({
                    ...prevData,
                    phoneNumber: error,
                  }));
                } else {
                  setErrors({});
                }
              }}
            />
            {user?.phoneNumber && (
              <TouchableOpacity
                onPress={() => {
                  setIsVerificationStep(true);
                }}
              >
                <Text
                  className="text-sm text-slate-900 dark:text-slate-100"
                >
                  {t("account.phoneScreen.alreadyHaveCode")}{" "}
                  {/* استخدام الترجمة */}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <Input
              containerStyle="w-full"
              inputStyle="h-12"
              placeholder={t("account.phoneScreen.input.verificationCode")} // استخدام الترجمة
              label={t("account.phoneScreen.input.verificationCodeLabel")} // استخدام الترجمة
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
                  {t("account.phoneScreen.resendCode")}
                </Text>{" "}
                {/* استخدام الترجمة */}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setIsVerificationStep(false);
                }}
              >
                <Text className="text-sm text-slate-900 dark:text-slate-100">
                  {t("account.phoneScreen.changePhoneNumber")}{" "}
                  {/* استخدام الترجمة */}
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
          (!isVerificationStep && user?.phoneNumber === phoneNumber)
        }
        label={
          isVerificationStep
            ? t("account.phoneScreen.buttons.verify") // استخدام الترجمة
            : user?.phoneNumber
            ? t("account.phoneScreen.buttons.changePhoneNumber") // استخدام الترجمة
            : t("account.phoneScreen.buttons.addPhoneNumber") // استخدام الترجمة
        }
        isLoading={isLoading}
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

export default PhoneScreen;
