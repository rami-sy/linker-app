import { useColorScheme as useNativewindColorScheme } from "nativewind";
import { useEffect, useRef, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Store reference to avoid circular dependency
let storeInstance = null;
export function setStoreInstance(store) {
  storeInstance = store;
}

export function useColorScheme() {
  const { colorScheme, setColorScheme: setNativewindColorScheme, toggleColorScheme: toggleNativewindColorScheme } =
    useNativewindColorScheme();
  
  const reduxThemeRef = useRef(null);
  const dispatchRef = useRef(null);
  const setThemeActionRef = useRef(null);
  
  // Try to get Redux store if available (but don't use hooks to avoid Provider requirement)
  useEffect(() => {
    try {
      // Try to access store directly if it's been set
      if (storeInstance) {
        const state = storeInstance.getState();
        reduxThemeRef.current = state?.app?.theme;
        dispatchRef.current = storeInstance.dispatch;
        // Lazy load setTheme action
        if (!setThemeActionRef.current) {
          setThemeActionRef.current = require("../src/redux/appSlice").setTheme;
        }
      }
    } catch (error) {
      // Store not available yet, that's okay
    }
  }, []);
  
  // Subscribe to store changes
  useEffect(() => {
    if (!storeInstance) return;
    
    const unsubscribe = storeInstance.subscribe(() => {
      const state = storeInstance.getState();
      reduxThemeRef.current = state?.app?.theme;
    });
    
    return unsubscribe;
  }, []);
  
  // Use refs for Redux (works without Provider)
  const reduxTheme = reduxThemeRef.current;

  // Track if initialization has been done
  const initializedRef = useRef(false);
  
  // Initialize: Load from AsyncStorage and sync with Redux and NativeWind
  useEffect(() => {
    // Only initialize once
    if (initializedRef.current) return;
    
    let isMounted = true;
    
    const initializeTheme = async () => {
      try {
        // Wait a bit to ensure store is ready (reduced from 100ms to 50ms for faster initialization)
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Try to get from AsyncStorage first
        const storedTheme = await AsyncStorage.getItem("theme");
        
        if (!isMounted) return;
        
        // Get current Redux state
        const currentReduxTheme = storeInstance?.getState()?.app?.theme;
        const currentDispatch = storeInstance?.dispatch;
        const currentSetThemeAction = setThemeActionRef.current || require("../src/redux/appSlice").setTheme;
        
        if (storedTheme && (storedTheme === "dark" || storedTheme === "light")) {
          // Sync NativeWind first
          setNativewindColorScheme(storedTheme);
          // Sync Redux if available
          if (currentDispatch && currentSetThemeAction && currentReduxTheme !== storedTheme) {
            currentDispatch(currentSetThemeAction(storedTheme));
          }
          initializedRef.current = true;
        } else if (currentReduxTheme && (currentReduxTheme === "dark" || currentReduxTheme === "light")) {
          // Fallback to Redux
          setNativewindColorScheme(currentReduxTheme);
          await AsyncStorage.setItem("theme", currentReduxTheme);
          initializedRef.current = true;
        } else if (colorScheme && (colorScheme === "dark" || colorScheme === "light")) {
          // Fallback to NativeWind current value
          if (currentDispatch && currentSetThemeAction) {
            currentDispatch(currentSetThemeAction(colorScheme));
          }
          await AsyncStorage.setItem("theme", colorScheme);
          initializedRef.current = true;
        } else {
          // Default to dark
          const defaultTheme = "dark";
          setNativewindColorScheme(defaultTheme);
          if (currentDispatch && currentSetThemeAction) {
            currentDispatch(currentSetThemeAction(defaultTheme));
          }
          await AsyncStorage.setItem("theme", defaultTheme);
          initializedRef.current = true;
        }
      } catch (error) {
        console.error("Error initializing theme:", error);
        initializedRef.current = true; // Mark as initialized even on error to prevent retries
      }
    };

    initializeTheme();
    
    return () => {
      isMounted = false;
    };
  }, []); // Empty dependencies - only run once on mount

  // Sync Redux and AsyncStorage when NativeWind colorScheme changes (but not during initialization)
  useEffect(() => {
    if (!initializedRef.current) return; // Skip during initialization
    
    if (colorScheme && (colorScheme === "dark" || colorScheme === "light")) {
      const currentReduxTheme = storeInstance?.getState()?.app?.theme;
      const currentDispatch = storeInstance?.dispatch;
      const currentSetThemeAction = setThemeActionRef.current || require("../src/redux/appSlice").setTheme;
      
      // Sync Redux if different
      if (currentDispatch && currentSetThemeAction && currentReduxTheme !== colorScheme) {
        currentDispatch(currentSetThemeAction(colorScheme));
      }
      
      // Always save to AsyncStorage when colorScheme changes
      AsyncStorage.setItem("theme", colorScheme).catch(console.error);
    }
  }, [colorScheme]);

  // Wrapper function to set color scheme and sync with Redux and AsyncStorage
  // Using useCallback to prevent unnecessary re-renders
  const setColorScheme = useCallback(async (newColorScheme) => {
    // Validate input
    if (newColorScheme !== "dark" && newColorScheme !== "light") {
      console.warn(`Invalid color scheme: ${newColorScheme}. Must be "dark" or "light"`);
      return;
    }
    
    try {
      // Set NativeWind first (this will trigger the useEffect above)
      setNativewindColorScheme(newColorScheme);
      
      // Sync Redux immediately
      const currentDispatch = storeInstance?.dispatch;
      const currentSetThemeAction = setThemeActionRef.current || require("../src/redux/appSlice").setTheme;
      if (currentDispatch && currentSetThemeAction) {
        currentDispatch(currentSetThemeAction(newColorScheme));
      }
      
      // Save to AsyncStorage immediately with retry mechanism
      try {
        await AsyncStorage.setItem("theme", newColorScheme);
      } catch (storageError) {
        console.error("Error saving theme to AsyncStorage:", storageError);
        // Retry once after a short delay
        setTimeout(async () => {
          try {
            await AsyncStorage.setItem("theme", newColorScheme);
          } catch (retryError) {
            console.error("Retry failed to save theme:", retryError);
          }
        }, 100);
      }
    } catch (error) {
      console.error("Error setting color scheme:", error);
    }
  }, [setNativewindColorScheme]);

  // Wrapper function to toggle color scheme
  // Using useCallback to prevent unnecessary re-renders
  const toggleColorScheme = useCallback(async () => {
    const newColorScheme = colorScheme === "dark" ? "light" : "dark";
    await setColorScheme(newColorScheme);
  }, [colorScheme, setColorScheme]);

  // Use NativeWind as source of truth, fallback to Redux, then default
  // Using useMemo to prevent unnecessary recalculations
  const currentColorScheme = useMemo(() => {
    return colorScheme ?? reduxTheme ?? "dark";
  }, [colorScheme, reduxTheme]);

  const isDarkColorScheme = useMemo(() => {
    return currentColorScheme === "dark";
  }, [currentColorScheme]);

  return {
    colorScheme: currentColorScheme,
    isDarkColorScheme,
    setColorScheme,
    toggleColorScheme,
  };
}
