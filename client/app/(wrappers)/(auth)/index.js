import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";

// ✅ Default root route - redirects to welcome screen
export default function Index() {
  useEffect(() => {
    router.replace("/welcome");
  }, []);

  // Show loading indicator while redirecting
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#12141b" }}>
      <ActivityIndicator size="large" color="#dee4e6" />
    </View>
  );
}

