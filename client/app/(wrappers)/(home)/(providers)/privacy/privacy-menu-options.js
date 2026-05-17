import React from "react";
import FeIcon from "react-native-vector-icons/Feather";
import { router } from "expo-router";

export const getPrivacyMenuOptions = (currentSection, t, isDarkColorScheme) => {
  const iconMuted = isDarkColorScheme ? "#94a3b8" : "#64748b";
  const rowActive = (key) =>
    currentSection === key
      ? "rounded-xl mx-1 my-0.5 bg-[#0a97b9]/12 dark:bg-[#0a97b9]/20"
      : "";

  const sections = [
    { key: "visibility", name: t("user.visibility"), icon: "eye", path: "/privacy/visibility" },
    { key: "content", name: t("user.content"), icon: "file-text", path: "/privacy/content" },
    { key: "interaction", name: t("user.interactions"), icon: "message-square", path: "/privacy/interaction" },
    { key: "network", name: t("user.networking"), icon: "users", path: "/privacy/network" },
    { key: "call-settings", name: t("callSettingsScreen.title") || "Call Settings", icon: "phone", path: "/privacy/call-settings" },
    { key: "chat-settings", name: t("chatSettingsScreen.title") || "Chat Settings", icon: "message-circle", path: "/privacy/chat-settings" },
  ];

  return sections.map((s) => ({
    name: s.name,
    icon: <FeIcon name={s.icon} size={18} color={iconMuted} />,
    onPress: () => router.push(s.path),
    selected: currentSection === s.key,
    className: rowActive(s.key),
  }));
};
