import { View, TouchableOpacity, Text, I18nManager } from "react-native";
import React from "react";
import FeIcon from "@expo/vector-icons/Feather";
import { router, useSegments } from "expo-router";
import { getLocales } from "expo-localization";
import { useColorScheme } from "~/lib/useColorScheme";

const Layout = ({
  children,
  navBar,
  label,
  back,
  h = "h-12",
  onBack,
  pb = "pb-20",
  mb = "mb-2",
  className = "",
}) => {
  const { isDarkColorScheme } = useColorScheme();
  const segments = useSegments();
  const isRTL = I18nManager.isRTL;
  
  // ✅ Smart back handler
  const handleBackPress = () => {
    if (onBack) {
      onBack();
      return;
    }

    const currentSegment = segments[1];
    const isInHome = currentSegment === "(home)";
    const isInAuth = currentSegment === "(auth)";

    // ✅ If can go back, check if it's safe
    if (router.canGoBack()) {
      // ✅ In home section - prevent going back to auth
      if (isInHome) {
        // Check navigation state depth
        // If we're deep in the app, allow back
        if (segments.length > 3) {
          router.back();
        } else {
          // At root level - go to chats instead
          router.replace("/chats");
        }
      } else {
        // ✅ In auth or other sections - normal back
        router.back();
      }
    } else {
      // ✅ No history - go to appropriate home
      if (isInHome) {
        router.replace("/chats");
      } else {
        router.replace("/welcome");
      }
    }
  };

  const showHeaderRow = Boolean(back || label || navBar);

  return (
    <View
      className={`flex-1 w-full p-3 ${pb} h-screen overflow-y-auto ${className}`}
    >
      {showHeaderRow && (
        <View
          className={`flex-row items-center overflow-hidden ${
            back ? "justify-between" : "justify-end"
          } w-full ${h} ${mb}`}
        >
          {back && (
            <TouchableOpacity
              className={`items-center justify-center mr-3`}
              onPress={handleBackPress}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {isRTL ? (
                <FeIcon
                  name="chevron-right"
                  size={35}
                  color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                />
              ) : (
                <FeIcon
                  name="chevron-left"
                  size={35}
                  color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                />
              )}
            </TouchableOpacity>
          )}
          {label && (
            <Text
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {label}
            </Text>
          )}
          {navBar}
        </View>
      )}
      {children}
    </View>
  );
};

export default Layout;
