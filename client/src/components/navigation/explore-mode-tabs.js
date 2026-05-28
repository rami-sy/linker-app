import React from "react";
import { TouchableOpacity, View } from "react-native";
import { getNavPalette, getShellShadowStyle } from "./nav-theme";

const ExploreModeTabs = ({ isDarkColorScheme, items, rightContent = null }) => {
  const palette = getNavPalette(isDarkColorScheme);

  return (
    <View className="absolute top-2 left-0 right-0 z-20 items-center px-3">
      <View
        className="h-16 w-full flex-row items-center justify-between rounded-[24px] px-2"
        style={{
          backgroundColor: palette.shellBg,
          borderWidth: 0,
          ...getShellShadowStyle(isDarkColorScheme, 8),
        }}
      >
        <View className="flex-row items-center justify-start mx-1">
          {items.map((item) => (
            <TouchableOpacity
              key={item.name}
              accessibilityRole="tab"
              accessibilityLabel={item.label || item.name}
              accessibilityState={{ selected: !!item.active }}
              className={`items-center justify-center mx-1 p-2 rounded-2xl ${
                item.active ? palette.activePill : palette.idlePill
              }`}
              onPress={item.onPress}
            >
              {item.icon}
            </TouchableOpacity>
          ))}
        </View>

        {rightContent}
      </View>
    </View>
  );
};

export default ExploreModeTabs;

