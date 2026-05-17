import React, { useContext, useEffect, useState, useRef } from "react";
import { Platform, View, ActivityIndicator, Text, BackHandler } from "react-native";
import "@expo/metro-runtime";
import * as Localization from "expo-localization";
import {
  router,
  Slot,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
  useRouter,
  useSegments,
} from "expo-router";
import { getItem, setItem } from "../../src/utils/localStorage";
import i18n from "../../src/lang/i18n";
import { removeMe, setMe } from "../../src/redux/userSlice";
import { getMe } from "../../src/api/me";
import Alert from "../../src/components/alert";
import { useSelector, useDispatch } from "react-redux";
import { StatusBar } from "expo-status-bar";
import { PersistGate } from "redux-persist/integration/react";
import { persistor } from "../../store";
import uuid from "react-native-uuid";
import { useColorScheme } from "~/lib/useColorScheme";
import NetInfo from "@react-native-community/netinfo";
import { useNetworkStatus } from "../../src/hooks/useNetworkStatus";
import { SocketContext } from "../../src/contexts/socket.context";
import { useTranslation } from "react-i18next";

// ✅ Global singleton to prevent multiple checkLogin calls across component re-mounts
let globalCheckLoginLock = false;
let globalLastSyncTime = 0;

/** True while URL has ?forceLogout=true (logout in progress — do not "re-login" redirect). */
function isForceLogoutInUrl() {
  if (Platform.OS === "web" && typeof globalThis.window !== "undefined") {
    try {
      return (
        new URLSearchParams(globalThis.window.location.search).get(
          "forceLogout"
        ) === "true"
      );
    } catch {
      return false;
    }
  }
  return false;
}

// ✅ Set initial route to (auth) group - this tells expo-router which group to use by default
export const unstable_settings = {
  initialRouteName: "(auth)",
};

export default function AppLayout() {
  const { t } = useTranslation();
  // Monitor network status and auto-sync when back online
  const { isOnline } = useNetworkStatus();
  const { colorScheme, isDarkColorScheme } = useColorScheme();
  const { alerts } = useSelector((state) => state.alerts);
  const { user } = useSelector((state) => state.users);
  const { socketConnected, isReconnecting, queuedOperations } =
    useContext(SocketContext);
  const dispatch = useDispatch();
  const segments = useSegments();
  const userId = useLocalSearchParams();
  const pathname = usePathname();
  const globalSearchParams = useGlobalSearchParams();
  const isForceLogoutRoute =
    String(globalSearchParams?.forceLogout) === "true" ||
    isForceLogoutInUrl();
  const isForceLogoutRef = useRef(isForceLogoutRoute);
  isForceLogoutRef.current = isForceLogoutRoute;
  
  // ✅ Prevent multiple simultaneous sync calls
  const SYNC_COOLDOWN = 30000; // 30 seconds cooldown between syncs

  const handleLanguageChange = async (lang) => {
    try {
      i18n.changeLanguage(lang);
      await setItem("appLanguage", lang);
    } catch (error) {
      // console.error("Error changing language:", error);
    }
  };

  useEffect(() => {
    if (
      Platform.OS === "web" &&
      typeof globalThis.window !== "undefined" &&
      "Notification" in globalThis.window
    ) {
      Notification.requestPermission();
    }

    const loadLanguage = async () => {
      try {
        const storedLanguage = await getItem("appLanguage");
        const phoneLocale =
          Localization.getLocales()?.[0]?.languageCode ?? "en";
        const selectedLanguage = storedLanguage
          ? JSON.parse(storedLanguage)
          : phoneLocale;

        handleLanguageChange(selectedLanguage);
      } catch (error) {
        // console.error("Error loading language:", error);
      }
    };

    loadLanguage();
  }, []);
  const [loading, setLoading] = useState(false);
  
  const navigateToAuth = () => {
    // ✅ If already in auth, don't navigate
    if (segments[1] === "(auth)") {
      console.log("✅ Already in auth section, no navigation needed");
      return;
    }
    console.log("🔓 Navigating to auth...");
    dispatch(removeMe());
    router.replace("/welcome");
  };

  const handleVerification = (user) => {
    // ✅ Skip verification check for call-recorder pages
    if (pathname?.includes("call-recorder")) {
      console.log("Skipping verification check for recorder page");
      return;
    }

    // ✅ Skip verification for recorder-bot
    if (user?._id === "recorder-bot") {
      console.log("Skipping verification for recorder-bot");
      return;
    }

    const { emailVerification, phoneVerification, email, phoneNumber } = user;

    // ✅ Not verified - need verification
    if (!emailVerification?.verified && !phoneVerification?.verified) {
      const verificationParams = email
        ? {
            screen: "verify-email",
            params: {
              email,
              emailMode: true,
              message: "Please verify your email address",
            },
          }
        : {
            screen: "verify-phone",
            params: {
              phoneNumber,
              emailMode: false,
              message: "Please verify your phone number",
            },
          };

      router.replace(`/${verificationParams.screen}`);
      return;
    }

    // ✅ Verified but profile not completed
    if (!user?.isCompleted) {
      router.replace("/user-info");
      return;
    }

    // ✅ Everything is complete - go to target or home
    const targetPath = pathname && pathname !== "/" && !pathname.includes("(auth)") && !pathname.includes("welcome")
      ? pathname 
      : "/chats";
    
    console.log("✅ User verified and complete, navigating to:", targetPath);
    router.replace(targetPath);
  };

  const checkLogin = async () => {
    // ✅ Global lock to prevent multiple simultaneous calls
    if (globalCheckLoginLock) {
      console.log("🔒 checkLogin already running, skipping...");
      setLoading(false);
      return;
    }

    if (isForceLogoutRef.current || isForceLogoutInUrl()) {
      setLoading(false);
      return;
    }

    globalCheckLoginLock = true;

    try {
      // ✅ Skip authentication check for call-recorder pages
      if (pathname?.includes("call-recorder")) {
        console.log("Skipping authentication check for recorder page");
        setLoading(false);
        globalCheckLoginLock = false;
        return;
      }

      // Check network status
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable;

      const deviceId = await getItem("deviceId");
      const token = await getItem("token");
      const daysRemaining = await getItem("daysRemaining");

      // Set device ID if not exists
      if (!deviceId) {
        await setItem("deviceId", uuid.v4());
      }

      // No token - go to auth
      if (!token) {
        setLoading(false);
        globalCheckLoginLock = false;
        navigateToAuth();
        return;
      }

      // Skip for info pages
      if (segments[1] === "(info)") {
        setLoading(false);
        globalCheckLoginLock = false;
        return;
      }

      // ✅ User exists in Redux Persist - use cached data (offline support)
      if (user && user.isCompleted && daysRemaining > 0) {
        console.log("✅ Using cached user data (offline mode)");
        setLoading(false);
        globalCheckLoginLock = false;

        // Logged-in user must not stay on auth marketing/login routes
        if (segments[1] === "(auth)") {
          console.log("🔄 Cached session on auth route, redirecting via handleVerification");
          handleVerification(user);
          return;
        }

        if (segments[1] === "(home)") {
          console.log("ℹ️ Already in home section, no navigation needed");
          return;
        }

        // ✅ Only navigate if we're in a weird state (like root or undefined)
        if (!segments[1] || segments[1] === "") {
          console.log("🔄 Navigating to home...");
          const targetPath = pathname && pathname !== "/" ? pathname : "/chats";
          router.replace(targetPath);
        }

        console.log("ℹ️ Using cached data - sync disabled to prevent rate limiting");
        return;
      }

      // ✅ User exists but not completed - check verification
      if (user && token) {
        console.log("⚠️ User exists but profile not completed");
        setLoading(false);
        globalCheckLoginLock = false;
        handleVerification(user);
        return;
      }

      // ✅ Need fresh data from server
      if (token && isOnline) {
        console.log("📡 Fetching user data from server...");
        try {
          const response = await getMe();
          if (response.type === "success") {
            dispatch(setMe(response.data));
            await setItem("lastSyncTime", Date.now().toString());
            setLoading(false);
            globalCheckLoginLock = false;
            handleVerification(response.data);
          } else {
            setLoading(false);
            globalCheckLoginLock = false;
            navigateToAuth();
          }
        } catch (error) {
          console.error("❌ Failed to fetch user data:", error);
          setLoading(false);
          globalCheckLoginLock = false;
          navigateToAuth();
        }
      } else if (token && !isOnline) {
        // Offline but has token - show offline message or use cached data
        console.log("⚠️ Offline - cannot verify user");
        setLoading(false);
        globalCheckLoginLock = false;
        // Could show offline banner here
      } else {
        setLoading(false);
        globalCheckLoginLock = false;
        navigateToAuth();
      }
    } catch (error) {
      console.error("❌ Error in checkLogin:", error);
      setLoading(false);
      navigateToAuth();
    } finally {
      // ✅ Release lock after checkLogin completes
      globalCheckLoginLock = false;
    }
  };

  // Track if app has been initialized
  useEffect(() => {
    const initializeApp = async () => {
      // Small delay for persist rehydration before reading token
      await new Promise((resolve) => setTimeout(resolve, 150));

      const token = await getItem("token");
      const hasToken = Boolean(token);

      // Root resolved to (home): only guests go to welcome; logged-in users run session check
      if (pathname === "/" && segments[1] === "(home)") {
        if (!hasToken) {
          setTimeout(() => {
            router.replace("/welcome");
          }, 50);
          setLoading(false);
        } else {
          setLoading(true);
          await checkLogin();
        }
        return;
      }

      if (segments[1] === "(home)") {
        console.log("✅ Already in home section");
        setLoading(false);
        return;
      }

      // On auth routes with a token, always verify session (exit welcome/login when already logged in)
      if (segments[1] === "(auth)") {
        if (hasToken && !isForceLogoutRef.current && !isForceLogoutInUrl()) {
          if (globalCheckLoginLock) {
            setLoading(false);
            return;
          }
          setLoading(true);
          await checkLogin();
        } else {
          setLoading(false);
        }
        return;
      }

      if (globalCheckLoginLock) {
        console.log("⏭️ checkLogin already running");
        setLoading(false);
        return;
      }

      console.log("🔍 Initializing app...");
      setLoading(true);
      await checkLogin();
    };

    initializeApp();
  }, []); // Empty deps - run once on mount

  // Logged-in user navigated to /welcome (or other (auth) screen) manually — redirect out
  useEffect(() => {
    if (segments[1] !== "(auth)") return;
    if (pathname?.includes("call-recorder")) return;
    if (isForceLogoutRef.current || isForceLogoutInUrl()) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      if (isForceLogoutInUrl()) return;
      const token = await getItem("token");
      if (!token || cancelled) return;
      if (!user?._id) return;
      if (globalCheckLoginLock) return;

      handleVerification(user);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pathname, segments, user]);

  // ✅ Handle physical back button (Android)
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        const currentSegment = segments[1];
        const isInHome = currentSegment === "(home)";
        const isInAuth = currentSegment === "(auth)";

        // ✅ Logged in (in home section)
        if (isInHome) {
          // ✅ Prevent going back to auth routes
          if (router.canGoBack()) {
            // Check if we're deep in navigation
            if (segments.length > 3) {
              // Deep in app - allow back
              router.back();
              return true;
            } else {
              // At root level - exit app instead of going to auth
              return false;
            }
          } else {
            // No history - exit app
            return false;
          }
        }

        // ✅ In auth section - allow normal back
        if (isInAuth) {
          if (router.canGoBack()) {
            router.back();
            return true;
          }
          return false;
        }

        // ✅ Default - allow system to handle
        return false;
      }
    );

    return () => backHandler.remove();
  }, [segments]);

  return (
    <>
      <StatusBar
        style={isDarkColorScheme ? "light" : "dark"}
        backgroundColor={isDarkColorScheme ? "#12141b" : "#dee4e6"}
      />
      <PersistGate
        loading={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#12141b' }}>
            <ActivityIndicator
              size="large"
              color="#dee4e6"
            />
          </View>
        }
        persistor={persistor}
      >
        {/* Offline Indicator */}
        {!isOnline && (
          <View
            style={{
              zIndex: 30,
              left: 0,
              top: 0,
              position: "absolute",
              width: "100%",
              backgroundColor: "#f59e0b",
              paddingVertical: 8,
              paddingHorizontal: 16,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
              {t("system.offlineBanner", {
                defaultValue: "Offline mode - some features may be limited",
              })}
            </Text>
          </View>
        )}
        {isOnline && isReconnecting && (
          <View
            style={{
              zIndex: 30,
              left: 0,
              top: 0,
              position: "absolute",
              width: "100%",
              backgroundColor: "#d97706",
              paddingVertical: 8,
              paddingHorizontal: 16,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
              {t("system.reconnectingBanner", {
                defaultValue: "Reconnecting to chat...",
              })}
              {queuedOperations > 0 ? ` (${queuedOperations} queued)` : ""}
            </Text>
          </View>
        )}
        {isOnline && socketConnected && queuedOperations > 0 && !isReconnecting && (
          <View
            style={{
              zIndex: 30,
              left: 0,
              top: 0,
              position: "absolute",
              width: "100%",
              backgroundColor: "#2563eb",
              paddingVertical: 6,
              paddingHorizontal: 16,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
              {t("system.pendingQueueBanner", {
                count: queuedOperations,
                defaultValue:
                  "{{count}} pending action(s) waiting to sync",
              })}
            </Text>
          </View>
        )}

        {alerts?.length > 0 && (
          <View
            style={{
              zIndex: 20,
              top: !isOnline || isReconnecting || queuedOperations > 0 ? 40 : 48,
              left: 0,
              right: 0,
              position: "absolute",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-start",
              pointerEvents: "none", // Completely ignore touches on container
            }}
          >
            {alerts.map((alert, index) => {
              return <Alert index={index} key={alert._id} alert={alert} />;
            })}
          </View>
        )}
        <Slot />
        {loading && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isDarkColorScheme ? "#12141b" : "#f6f8f9",
            }}
          >
            <ActivityIndicator
              size="large"
              color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
            />
          </View>
        )}
      </PersistGate>
    </>
  );
}
