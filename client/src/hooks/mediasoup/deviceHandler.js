import { Platform } from "react-native";
import Bowser from "bowser";

/**
 * Detect browser/runtime and select mediasoup device handler.
 */
export function getDeviceHandler() {
  if (Platform.OS !== "web") {
    return "ReactNative";
  }

  const userAgent = globalThis?.navigator?.userAgent || "";
  const browser = Bowser.getParser(userAgent);
  const browserName = browser.getBrowserName();
  const browserVersion = parseInt(browser.getBrowserVersion(), 10);

  if (browserName === "Chrome" && browserVersion >= 111) return "Chrome111";
  if (browserName === "Chrome" && browserVersion >= 74) return "Chrome74";
  if (browserName === "Firefox" && browserVersion >= 120) return "Firefox120";
  if (browserName === "Firefox" && browserVersion >= 60) return "Firefox60";
  if (browserName === "Safari" && browserVersion >= 12) return "Safari12";
  if (browserName === "Safari") return "Safari11";
  if (browserName === "Edge" || browserName === "Microsoft Edge") return "Chrome111";
  if (browserName === "Android Browser") return "Chrome111";

  return "Chrome111";
}

