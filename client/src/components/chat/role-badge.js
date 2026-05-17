import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";

/**
 * RoleBadge - A consistent role badge component with unique colors per role
 * 
 * @param {string} role - The role type: "owner" | "admin" | "moderator" | "member"
 * @param {string} size - Size variant: "sm" | "md" (default: "sm")
 */
const RoleBadge = ({ role = "member", size = "sm" }) => {
  const { t } = useTranslation();

  // Role configurations with unique colors
  const roleConfig = {
    owner: {
      label: t("general.owner") || "Owner",
      bgLight: "bg-amber-100",
      bgDark: "dark:bg-amber-900/40",
      textLight: "text-amber-700",
      textDark: "dark:text-amber-400",
    },
    admin: {
      label: t("general.admin") || "Admin",
      bgLight: "bg-sky-100",
      bgDark: "dark:bg-sky-900/40",
      textLight: "text-sky-700",
      textDark: "dark:text-sky-400",
    },
    moderator: {
      label: t("general.moderator") || "Moderator",
      bgLight: "bg-purple-100",
      bgDark: "dark:bg-purple-900/40",
      textLight: "text-purple-700",
      textDark: "dark:text-purple-400",
    },
    member: {
      label: t("general.member") || "Member",
      bgLight: "bg-slate-100",
      bgDark: "dark:bg-slate-700/50",
      textLight: "text-slate-600",
      textDark: "dark:text-slate-400",
    },
  };

  const config = roleConfig[role] || roleConfig.member;

  // Size configurations
  const sizeConfig = {
    sm: {
      padding: "px-2 py-0.5",
      text: "text-[10px]",
    },
    md: {
      padding: "px-2.5 py-1",
      text: "text-xs",
    },
  };

  const sizeStyle = sizeConfig[size] || sizeConfig.sm;

  return (
    <View
      className={`rounded-full self-start ${sizeStyle.padding} ${config.bgLight} ${config.bgDark}`}
    >
      <Text
        className={`font-medium ${sizeStyle.text} ${config.textLight} ${config.textDark}`}
      >
        {config.label}
      </Text>
    </View>
  );
};

export default RoleBadge;
