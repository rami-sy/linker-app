import { ScrollView, View, Text } from "react-native";
import React, { useState } from "react";
import Layout from "../../../../../src/components/layout";
import Input from "../../../../../src/components/input";

import Button from "../../../../../src/components/button";
import { changePassword, getMe } from "../../../../../src/api/me";
import { useDispatch, useSelector } from "react-redux";
import { setMe } from "../../../../../src/redux/userSlice";
import Joi from "joi";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useColorScheme } from "~/lib/useColorScheme";
import ContextMenu from "../../../../../src/components/context-menu";
import FeIcon from "react-native-vector-icons/Feather";
import { getAccountMenuOptions } from "./account-menu-options";

const AccountNavBar = ({ t, isDarkColorScheme, user }) => {
  const menuOptions = React.useMemo(
    () => getAccountMenuOptions("password", t, isDarkColorScheme, user),
    [t, isDarkColorScheme, user]
  );
  const activeSection = menuOptions.find((o) => o.selected);
  return (
    <ContextMenu
      options={menuOptions}
      placement="bottom"
      width={260}
      menuClassName="rounded-2xl shadow-lg"
    >
      <View
        className={`flex-row items-center h-12 px-4 py-3 rounded-2xl ${
          activeSection?.selected ? "bg-[#0a97b9]" : "bg-white dark:bg-[#171b25]"
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
            (user?.doseUserHavePassword
              ? t("user.changePassword")
              : t("user.addNewPassword"))}
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
  );
};

const ChangePassword = () => {
  const { t } = useTranslation(); // الترجمة
  const { user } = useSelector((state) => state.users);
  const [formData, setFormData] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const schema = Joi.object({
    oldPassword: Joi.string()
      .required()
      .messages({
        "any.required": t("account.passwordScreen.errors.oldPassword"),
        "string.empty": t("account.passwordScreen.errors.oldPassword"),
      }),
    newPassword: Joi.string()
      .required()
      .messages({
        "string.pattern.base": t(
          "account.passwordScreen.errors.newPassword.pattern"
        ),
        "any.required": t("account.passwordScreen.errors.newPassword"),
        "string.empty": t("account.passwordScreen.errors.newPassword"),
      }),
    confirmPassword: Joi.string()
      .valid(Joi.ref("newPassword"))
      .required()
      .messages({
        "any.only": t("account.passwordScreen.errors.confirmPassword.mismatch"),
        "string.empty": t(
          "account.passwordScreen.errors.confirmPassword.required"
        ),
        "any.required": t(
          "account.passwordScreen.errors.confirmPassword.required"
        ),
      }),
  });

  const dispatch = useDispatch();

  const handleInputChange = (name, value) => {
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));

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

  const onClick = async () => {
    const { error } = schema.validate(formData, { abortEarly: false });
    if (error) {
      const errorData = {};
      error.details.forEach((item) => {
        errorData[item.path[0]] = item.message;
      });
      setErrors(errorData);
      return;
    }
    setIsLoading(true);
    try {
      const res = await changePassword(formData);
      if (res.type === "success") {
        const data = await getMe();
        if (data.type === "success") {
          dispatch(setMe(data.data));
          setFormData({
            oldPassword: "",
            newPassword: "",
            confirmPassword: "",
          });
        }
      }
      setIsLoading(false);
    } catch (error) {
      console.log({ error });
      setIsLoading(false);
    }
  };

  const { isDarkColorScheme } = useColorScheme();

  return (
    <Layout
      label={t("account.passwordScreen.title.change")}
      back
      onBack={() => router.push("/user")}
      pb="pb-4"
      className="items-stretch flex-1 relative w-full md:w-1/2 lg:w-1/2 bg-[#dee4e6] dark:bg-[#12141b]"
      navBar={
        <View className="flex-row flex-1 items-center justify-end w-full gap-x-3">
          <AccountNavBar
            t={t}
            isDarkColorScheme={isDarkColorScheme}
            user={user}
          />
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
        <Input
          containerStyle="w-full"
          inputStyle="h-12"
          placeholder={t("account.passwordScreen.input.oldPassword")}
          value={formData.oldPassword}
          error={errors.oldPassword}
          onChange={(text) => handleInputChange("oldPassword", text)}
          autoCapitalize="none"
          secureTextEntry={true}
        />
        <Input
          containerStyle="w-full"
          inputStyle="h-12"
          placeholder={t("account.passwordScreen.input.newPassword")}
          value={formData.newPassword}
          error={errors.newPassword}
          onChange={(text) => handleInputChange("newPassword", text)}
          autoCapitalize="none"
          secureTextEntry={true}
        />
        <Input
          containerStyle="w-full"
          inputStyle="h-12"
          placeholder={t("account.passwordScreen.input.confirmPassword")}
          value={formData.confirmPassword}
          error={errors.confirmPassword}
          onChange={(text) => handleInputChange("confirmPassword", text)}
          autoCapitalize="none"
          secureTextEntry={true}
        />
        </ScrollView>
      </View>
      <Button
        disabled={Object.keys(errors).length > 0 || isLoading}
        isLoading={isLoading}
        label={t("account.passwordScreen.buttons.update")}
        w={"w-full"}
        h={"h-12"}
        onPress={onClick}
        mb="mb-0"
      />
    </Layout>
  );
};

const AddNewPassword = () => {
  const { t } = useTranslation(); // الترجمة
  const { user } = useSelector((state) => state.users);
  const [formData, setFormData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const schema = Joi.object({
    newPassword: Joi.string()
      .required()
      .messages({
        "any.required": t("account.passwordScreen.errors.newPassword"),
      }),
    confirmPassword: Joi.string()
      .valid(Joi.ref("newPassword"))
      .required()
      .messages({
        "any.only": t("account.passwordScreen.errors.confirmPassword.mismatch"),
        "any.required": t(
          "account.passwordScreen.errors.confirmPassword.required"
        ),
      }),
  });

  const dispatch = useDispatch();
  const { isDarkColorScheme } = useColorScheme();

  const handleInputChange = (name, value) => {
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));

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

  const onClick = async () => {
    const { error } = schema.validate(formData, { abortEarly: false });
    if (error) {
      const errorData = {};
      error.details.forEach((item) => {
        errorData[item.path[0]] = item.message;
      });
      setErrors(errorData);
      return;
    }
    setIsLoading(true);
    try {
      const res = await changePassword(formData);
      if (res.type === "success") {
        const data = await getMe();
        if (data.type === "success") {
          dispatch(setMe(data.data));
          setFormData({
            newPassword: "",
            confirmPassword: "",
          });
        }
      }
      setIsLoading(false);
    } catch (error) {
      console.log({ error });
      setIsLoading(false);
    }
  };

  return (
    <Layout
      label={t("account.passwordScreen.title.add")}
      back
      onBack={() => router.push("/user")}
      pb="pb-4"
      className="items-stretch flex-1 relative w-full md:w-1/2 lg:w-1/2 bg-[#dee4e6] dark:bg-[#12141b]"
      navBar={
        <View className="flex-row flex-1 items-center justify-end w-full gap-x-3">
          <AccountNavBar
            t={t}
            isDarkColorScheme={isDarkColorScheme}
            user={user}
          />
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
        <Input
          containerStyle="w-full"
          inputStyle="h-12"
          placeholder={t("account.passwordScreen.input.newPassword")}
          value={formData.newPassword}
          error={errors.newPassword}
          onChange={(text) => handleInputChange("newPassword", text)}
          autoCapitalize="none"
          secureTextEntry={true}
        />
        <Input
          containerStyle="w-full"
          inputStyle="h-12"
          placeholder={t("account.passwordScreen.input.confirmPassword")}
          value={formData.confirmPassword}
          error={errors.confirmPassword}
          onChange={(text) => handleInputChange("confirmPassword", text)}
          autoCapitalize="none"
          secureTextEntry={true}
        />
        </ScrollView>
      </View>
      <Button
        disabled={Object.keys(errors).length > 0 || isLoading}
        isLoading={isLoading}
        label={t("account.passwordScreen.buttons.update")}
        w={"w-full"}
        h={"h-12"}
        onPress={onClick}
        mb="mb-0"
      />
    </Layout>
  );
};

const PasswordScreen = () => {
  const { user } = useSelector((state) => state.users);
  return user?.doseUserHavePassword ? <ChangePassword /> : <AddNewPassword />;
};

export default PasswordScreen;
