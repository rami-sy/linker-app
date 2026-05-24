import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import FeIcon from "@expo/vector-icons/Feather";
import { useColorScheme } from "../../lib/useColorScheme";

const AlertBox = ({
  message,
  type = "info", // "info", "warning", "error", "success"
  icon,
  iconColor,
  bgColor,
  textColor,
  borderColor,
  children,
  className = "",
  onClose,
}) => {
  const { isDarkColorScheme } = useColorScheme();

  // Get default colors based on type
  const getTypeColors = () => {
    switch (type) {
      case "warning":
        return {
          bg: isDarkColorScheme ? "bg-yellow-900/30" : "bg-yellow-50",
          border: isDarkColorScheme ? "border-yellow-800" : "border-yellow-200",
          text: isDarkColorScheme ? "text-yellow-300" : "text-yellow-700",
          icon: isDarkColorScheme ? "#fbbf24" : "#d97706",
          defaultIcon: "alert-triangle",
        };
      case "error":
        return {
          bg: isDarkColorScheme ? "bg-red-900/30" : "bg-red-50",
          border: isDarkColorScheme ? "border-red-800" : "border-red-200",
          text: isDarkColorScheme ? "text-red-300" : "text-red-700",
          icon: isDarkColorScheme ? "#f87171" : "#dc2626",
          defaultIcon: "alert-circle",
        };
      case "success":
        return {
          bg: isDarkColorScheme ? "bg-green-900/30" : "bg-green-50",
          border: isDarkColorScheme ? "border-green-800" : "border-green-200",
          text: isDarkColorScheme ? "text-green-300" : "text-green-700",
          icon: isDarkColorScheme ? "#34d399" : "#059669",
          defaultIcon: "check-circle",
        };
      case "info":
      default:
        return {
          bg: isDarkColorScheme ? "bg-blue-900/30" : "bg-blue-50",
          border: isDarkColorScheme ? "border-blue-800" : "border-blue-200",
          text: isDarkColorScheme ? "text-blue-300" : "text-blue-700",
          icon: isDarkColorScheme ? "#60a5fa" : "#2563eb",
          defaultIcon: "info",
        };
    }
  };

  const typeColors = getTypeColors();
  const defaultIcon = icon || typeColors.defaultIcon;
  const defaultBgColor = bgColor || typeColors.bg;
  const defaultBorderColor = borderColor || typeColors.border;
  const defaultTextColor = textColor || typeColors.text;
  const defaultIconColor = iconColor || typeColors.icon;

  return (
    <View className={`w-full flex-row items-center p-3 rounded-xl ${defaultBgColor} border ${defaultBorderColor} ${className}`}>
      <FeIcon
        name={defaultIcon}
        size={18}
        color={defaultIconColor}
        style={{ marginRight: 10 }}
      />
      <View className="flex-1 flex-row items-center flex-wrap">
        {message && (
          <Text className={`text-sm ${defaultTextColor}`}>
            {message}
          </Text>
        )}
        {children}
      </View>
      {onClose && (
        <TouchableOpacity
          onPress={onClose}
          className="ml-2"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <FeIcon
            name="x"
            size={16}
            color={defaultIconColor}
            style={{ opacity: 0.7 }}
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

export default AlertBox;

