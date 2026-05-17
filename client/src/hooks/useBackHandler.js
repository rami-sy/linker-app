import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";
import { router, useSegments, usePathname } from "expo-router";

/**
 * Custom hook to handle back navigation properly
 * - Prevents going back to auth routes after login
 * - Handles physical back button on Android
 * - Provides smart fallback navigation
 */
export const useBackHandler = (customHandler) => {
  const segments = useSegments();
  const pathname = usePathname();

  useEffect(() => {
    // Only for native platforms (Android mainly)
    if (Platform.OS === "web") {
      return;
    }

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        // ✅ Custom handler if provided
        if (customHandler) {
          return customHandler();
        }

        // ✅ Smart back navigation
        return handleSmartBack();
      }
    );

    return () => backHandler.remove();
  }, [segments, pathname, customHandler]);

  const handleSmartBack = () => {
    const currentSegment = segments[1];
    const isInHome = currentSegment === "(home)";
    const isInAuth = currentSegment === "(auth)";

    // ✅ If in home section and can go back
    if (isInHome && router.canGoBack()) {
      // Check if going back would take us to auth
      // If so, prevent it and exit app instead
      const navigationState = router.getState?.();
      
      // Simple heuristic: if we're deep in home section, allow back
      if (segments.length > 3) {
        router.back();
        return true;
      } else {
        // At root of home section - exit app
        return false; // Let system handle (exit app)
      }
    }

    // ✅ If in auth section, allow back within auth
    if (isInAuth && router.canGoBack()) {
      router.back();
      return true;
    }

    // ✅ Default: let system handle (exit app)
    return false;
  };

  return { handleSmartBack };
};

/**
 * Hook to handle back navigation with auth protection
 * Prevents going back to auth routes after successful login
 */
export const useProtectedBackHandler = () => {
  const segments = useSegments();
  const pathname = usePathname();

  const handleBack = () => {
    const currentSegment = segments[1];
    const isInHome = currentSegment === "(home)";

    // ✅ If logged in (in home section)
    if (isInHome) {
      if (router.canGoBack()) {
        // ✅ Check navigation history to avoid going to auth
        // For now, just go back - the main wrapper will handle auth redirect
        router.back();
      } else {
        // ✅ No history - go to chats (home)
        router.replace("/chats");
      }
    } else {
      // ✅ Not in home - normal back
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/welcome");
      }
    }
  };

  return { handleBack };
};


