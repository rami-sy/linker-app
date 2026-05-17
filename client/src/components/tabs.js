import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useColorScheme } from "../../lib/useColorScheme";

/**
 * Tabs Component - A reusable tab navigation component
 * 
 * @param {Array} tabs - Array of tab objects with { value, label } structure
 * @param {string} activeTab - The currently active tab value
 * @param {Function} onTabChange - Callback function when a tab is pressed
 * @param {string} className - Additional CSS classes for the container
 * @param {string} gap - Gap between tabs (default: "gap-x-2")
 * @param {string} justify - Justify content alignment (default: "justify-start")
 * @param {string} activeColor - Active tab text color (default: "text-placehoder dark:text-papaya")
 * @param {string} inactiveColor - Inactive tab text color (auto based on theme if not provided)
 * @param {string} indicatorColor - Active indicator line color (default: "bg-placehoder dark:bg-papaya")
 * @param {string} textSize - Text size class (default: "text-sm")
 * @param {string} textWeight - Text weight class (default: "font-semibold")
 * @param {string} tabPadding - Padding for each tab (default: "py-2.5 px-1.5")
 */
const Tabs = ({
  tabs,
  activeTab,
  onTabChange,
  className = "",
  gap = "gap-x-2",
  justify = "justify-start",
  activeColor,
  inactiveColor,
  indicatorColor,
  textSize = "text-sm",
  textWeight = "font-semibold",
  tabPadding = "py-2.5 px-1.5",
}) => {
  const { isDarkColorScheme } = useColorScheme();
  const [textWidths, setTextWidths] = useState({});

  // Default colors
  const defaultActiveColor = activeColor || "text-placehoder dark:text-papaya";
  const defaultInactiveColor =
    inactiveColor ||
    (isDarkColorScheme ? "text-drakGray" : "text-drakGray");
  const defaultIndicatorColor =
    indicatorColor || "bg-placehoder dark:bg-papaya";
  return (
    <View className={`flex-row items-center ${justify} ${gap} ${className}`}>
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.value;
        const textWidth = textWidths[tab.value] || 0;
        return (
          <TouchableOpacity key={tab.value || index} onPress={() => onTabChange(tab.value)} className={`items-center justify-center ${tabPadding} relative`} activeOpacity={0.7}>
            <Text
              className={`${textSize} ${textWeight} ${
                isActive ? defaultActiveColor : defaultInactiveColor
              }`}
              onLayout={(event) => {
                const { width } = event.nativeEvent.layout;
                if (!textWidths[tab.value] || textWidths[tab.value] !== width) {
                  setTextWidths((prev) => ({
                    ...prev,
                    [tab.value]: width,
                  }));
                }
              }}
            >
              {tab.label}
            </Text>
            {isActive && textWidth > 0 && (
              <View
                className={`absolute bottom-0 h-0.5 ${defaultIndicatorColor} rounded-full`}
                style={{
                  width: textWidth,
                  left: "50%",
                  marginLeft: -textWidth / 2,
                }}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default Tabs;

