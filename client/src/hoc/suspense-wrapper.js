import React, { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";
import { useColorScheme } from "../../lib/useColorScheme";

const isDevelopment = process.env.NODE_ENV === "development";

const SuspenseWrapper = ({ children, fallback }) => {
  const { isDarkColorScheme } = useColorScheme();
  // if (isDevelopment) {
  //   return <>{children}</>; // Skip Suspense fallback in development
  // }
  return (
    <Suspense
      fallback={
        fallback ? (
          fallback
        ) : (
          <View
            className="absolute top-0 left-0 z-10 items-center justify-center flex-1 w-full h-full bg-[#f6f8f9] dark:bg-main"
          >
            <ActivityIndicator
              size="large"
              color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
            />
          </View>
        )
      }
    >
      {children}
    </Suspense>
  );
};

export default SuspenseWrapper;
