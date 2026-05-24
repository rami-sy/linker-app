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
          bg: isDarkColorScheme ? "#78350f" : "#fef9c3", // yellow-900/40 equivalent and yellow-50
          text: isDarkColorScheme ? "#fef3c7" : "#92400e", // yellow-100 and yellow-800
          icon: isDarkColorScheme ? "#fbbf24" : "#d97706", // yellow-400 and yellow-600
          defaultIcon: "alert-triangle",
        };
      case "error":
        return {
          bg: isDarkColorScheme ? "#7f1d1d" : "#fee2e2", // red-900/40 equivalent and red-50
          text: isDarkColorScheme ? "#fee2e2" : "#991b1b", // red-100 and red-800
          icon: isDarkColorScheme ? "#f87171" : "#dc2626", // red-400 and red-600
          defaultIcon: "alert-circle",
        };
      case "success":
        return {
          bg: isDarkColorScheme ? "#14532d" : "#d1fae5", // green-900/40 equivalent and green-50
          text: isDarkColorScheme ? "#d1fae5" : "#065f46", // green-100 and green-800
          icon: isDarkColorScheme ? "#34d399" : "#059669", // green-400 and green-600
          defaultIcon: "check-circle",
        };
      case "info":
      default:
        return {
          bg: isDarkColorScheme ? "#1e3a8a" : "#dbeafe", // blue-900/40 equivalent and blue-50
          text: isDarkColorScheme ? "#bfdbfe" : "#2563eb", // blue-200 and blue-600
          icon: isDarkColorScheme ? "#93c5fd" : "#3b82f6", // blue-300 and blue-500
          defaultIcon: "info",
        };
    }
  };

  const typeColors = getTypeColors();
  const defaultIcon = icon || typeColors.defaultIcon;
  const defaultBgColor = bgColor || typeColors.bg;
  const defaultTextColor = textColor || typeColors.text;
  const defaultIconColor = iconColor || typeColors.icon;

  return (
    <View 
      className={`w-full flex-row items-center py-2.5 px-3 rounded-xl ${className}`}
      style={{ backgroundColor: defaultBgColor }}
    >
      <FeIcon
        name={defaultIcon}
        size={18}
        color={defaultIconColor}
        style={{ marginRight: 10 }}
      />
      <View className="flex-1 flex-row items-center flex-wrap">
        {message && (
          <Text 
            className="text-sm"
            style={{ color: defaultTextColor }}
          >
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

