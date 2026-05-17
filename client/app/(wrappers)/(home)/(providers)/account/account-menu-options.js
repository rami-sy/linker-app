import React from "react";
import FeIcon from "react-native-vector-icons/Feather";
import { router } from "expo-router";

export const getAccountMenuOptions = (
  currentSection,
  t,
  isDarkColorScheme,
  user
) => {
  const iconMuted = isDarkColorScheme ? "#94a3b8" : "#64748b";
  const rowActive = (key) =>
    currentSection === key
      ? "rounded-xl mx-1 my-0.5 bg-[#0a97b9]/12 dark:bg-[#0a97b9]/20"
      : "";

  const sections = [
    {
      key: "devices",
      name: t("account.devices.title"),
      icon: "smartphone",
      path: "/account/devices",
    },
    {
      key: "password",
      name: user?.doseUserHavePassword
        ? t("user.changePassword")
        : t("user.addNewPassword"),
      icon: "lock",
      path: "/account/password",
    },
    {
      key: "email",
      name: user?.email ? t("user.changeEmail") : t("user.addEmail"),
      icon: "mail",
      path: "/account/email",
    },
    {
      key: "phone",
      name: user?.phoneNumber
        ? t("user.changePhoneNumber")
        : t("user.addPhoneNumber"),
      icon: "phone",
      path: "/account/phone",
    },
  ];

  return sections.map((s) => ({
    name: s.name,
    icon: <FeIcon name={s.icon} size={18} color={iconMuted} />,
    onPress: () => router.push(s.path),
    selected: currentSection === s.key,
    className: rowActive(s.key),
  }));
};

