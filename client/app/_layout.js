import "../global.css";
import {
  Theme,
  ThemeProvider,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import React from "react";
import { Provider } from "react-redux";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "@expo/metro-runtime";
import "react-native-get-random-values";
import { Slot, ErrorBoundary } from "expo-router";
import store from "../store";
import { Platform } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "../lib/useColorScheme";
import { NAV_THEME } from "../lib/constants";
import CustomErrorBoundary from "../src/components/ErrorBoundary";
import { GluestackUIProvider } from "@gluestack-ui/themed";

const LIGHT_THEME = {
  ...DefaultTheme,
  colors: NAV_THEME.light,
};
const DARK_THEME = {
  ...DarkTheme,
  colors: NAV_THEME.dark,
};

if (Platform.OS !== "web") {
  if (typeof global.process === "undefined") {
    global.process = require("process");
  } else {
    const bProcess = require("process");
    for (const p in bProcess) {
      if (!(p in global.process)) {
        global.process[p] = bProcess[p];
      }
    }
  }

  if (typeof global.process.nextTick === "undefined") {
    global.process.nextTick = setImmediate;
  }
}
const useIsomorphicLayoutEffect =
  Platform.OS === "web" && typeof window === "undefined"
    ? React.useEffect
    : React.useLayoutEffect;

export default function AppLayout() {
  const hasMounted = React.useRef(false);
  const [isReady, setIsReady] = React.useState(false);
  const { colorScheme, isDarkColorScheme } = useColorScheme();

  React.useEffect(() => {
    if (hasMounted.current) {
      return;
    }

    if (Platform.OS === "web") {
      // Adds the background color to the html element to prevent white background on overscroll.
      document.documentElement.classList.add("bg-background");
    }
    setIsReady(true);
    hasMounted.current = true;
  }, []);

  // Show loading state while initializing
  if (!isReady) {
    return (
      <Provider store={store}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#12141b', alignItems: 'center', justifyContent: 'center' }}>
          <SafeAreaProvider style={{ flex: 1 }}>
            <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Slot />
            </SafeAreaView>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </Provider>
    );
  }

  return (
    <CustomErrorBoundary>
      <GluestackUIProvider>
      <ThemeProvider value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}>
        <GestureHandlerRootView style={{ flex: 1 }} className={colorScheme === 'dark' ? 'dark' : ''}>
          <SafeAreaProvider style={{ flex: 1 }}>
            <SafeAreaView style={{ flex: 1 }}>
              <Provider store={store}>
                <Slot />
              </Provider>
            </SafeAreaView>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ThemeProvider>
      </GluestackUIProvider>
    </CustomErrorBoundary>
  );
}
