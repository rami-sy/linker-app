import { View } from "react-native";
import React from "react";
import { Slot } from "expo-router";

// ✅ Set initial route to prevent flashing to alphabetically first file
// This helps expo-router know which route to prioritize on initial load
export const unstable_settings = {
  initialRouteName: "welcome",
};

const AuthLayout = () => {
  return (
    <View style={{ flex: 1, alignItems: "center", backgroundColor: "#262a36" }}>
      <Slot />
    </View>
  );
};

export default AuthLayout;
