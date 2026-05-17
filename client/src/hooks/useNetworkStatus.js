import { useState, useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useDispatch, useSelector } from "react-redux";
import { getMe } from "../api/me";
import { setMe } from "../redux/userSlice";
import { getItem, setItem } from "../utils/localStorage";

// ✅ Global singleton to prevent multiple network sync calls
let globalNetworkSyncLock = false;

/**
 * Hook to monitor network status and sync user data when coming back online
 */
export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState(true);
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.users);
  
  // ✅ Prevent multiple sync calls
  const NETWORK_SYNC_COOLDOWN = 60000; // 60 seconds cooldown

  useEffect(() => {
    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      const wasOffline = !isOnline || !isInternetReachable;
      const isNowOnline = state.isConnected && state.isInternetReachable;

      setIsOnline(state.isConnected || false);
      setIsInternetReachable(state.isInternetReachable ?? false);

      // Coming back online - sync user data (with global lock and rate limiting)
      if (wasOffline && isNowOnline && user && !globalNetworkSyncLock) {
        console.log("🌐 Network restored - checking if sync needed...");
        syncUserData();
      }
    });

    return () => unsubscribe();
  }, [isOnline, isInternetReachable, user]);

  const syncUserData = async () => {
    // ✅ Global lock check
    if (globalNetworkSyncLock) {
      console.log("🔒 Network sync already in progress, skipping...");
      return;
    }
    
    try {
      // ✅ Check last sync time from localStorage
      const lastSyncStr = await getItem("lastSyncTime");
      const lastSyncTime = lastSyncStr ? parseInt(JSON.parse(lastSyncStr)) : 0;
      const timeSinceLastSync = Date.now() - lastSyncTime;
      
      if (timeSinceLastSync < NETWORK_SYNC_COOLDOWN) {
        const remainingTime = Math.ceil((NETWORK_SYNC_COOLDOWN - timeSinceLastSync) / 1000);
        console.log(`⏱️ Network sync cooldown: ${remainingTime}s remaining`);
        return;
      }
      
      globalNetworkSyncLock = true;
      console.log("🔄 Network restored - syncing user data...");
      
      const response = await getMe();
      if (response.type === "success") {
        dispatch(setMe(response.data));
        await setItem("lastSyncTime", Date.now().toString());
        console.log("✅ User data synced after reconnection");
      } else {
        console.log("⚠️ Failed to sync: Invalid response");
      }
    } catch (error) {
      console.log("⚠️ Failed to sync user data:", error?.message || "Network error");
    } finally {
      globalNetworkSyncLock = false;
    }
  };

  return {
    isOnline: isOnline && (isInternetReachable ?? true),
    isConnected: isOnline,
    isInternetReachable,
    syncUserData,
  };
};

