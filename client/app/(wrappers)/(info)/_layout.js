import { View } from "react-native";
import React from "react";
import { Slot } from "expo-router";
import { useColorScheme } from "~/lib/useColorScheme";

const AuxLayout = () => {
  const { isDarkColorScheme } = useColorScheme();

  return (
    <View
      className="flex-1 bg-[#dee4e6] dark:bg-[#12141b]"
    >
      <Slot />
    </View>
  );
};

export default AuxLayout;
