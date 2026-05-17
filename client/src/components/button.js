import { TouchableOpacity, Text, ActivityIndicator } from "react-native";
import React from "react";
import { LinearGradient } from "expo-linear-gradient";

const Button = ({
  onPress,
  bg = "bg-[#0a97b9]",
  w = "w-4/5",
  text = "text-white text-lg",
  h = "h-12",
  mb = "mb-6",
  mt = "",
  disabled = false,
  children,
  label,
  title,
  isLoading,
  className,
  accessibilityLabel,
}) => {
  return (
    <TouchableOpacity
      onPress={(e) => {
        if (!disabled && !isLoading) {
          onPress(e);
        }
      }}
      disabled={disabled || isLoading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label || title || "button"}
      accessibilityState={{ disabled: disabled || !!isLoading, busy: !!isLoading }}
      className={`text-white ${w} ${h} ${mt} ${mb} justify-center items-center focus:ring-4 focus:outline-none font-medium rounded-2xl py-2.5 text-center mb-2 ${className} ${
        isLoading || disabled ? "opacity-80 cursor-not-allowed" : ""
      }`}
    >
      <LinearGradient
        // className={`items-center justify-center ${h} p-3 ${mt} ${mb} rounded-2xl ${w} ${bg} ${
        //   disabled ? "opacity-80" : ""
        // }`}

        colors={["#0a97b9", "#0891b2", "#0e7490"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.85 }}
        style={{
          padding: 10,
          width: "100%",
          height: 50,
          justifyContent: "center",
          alignItems: "center",
          borderRadius: 16,
          display: "flex",
          flexDirection: "row",
        }}
      >
        {isLoading ? (
          <ActivityIndicator color="#dee4e6" />
        ) : label || title ? (
          <Text className={`${text}`}>{label || title}</Text>
        ) : (
          children
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

export default Button;
