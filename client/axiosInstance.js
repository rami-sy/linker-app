import axios from "axios";
import { getItem, setItem, removeItem } from "./src/utils/localStorage";
import { addAlert } from "./src/redux/alertSlice";
import { setSessionExpired } from "./src/redux/appSlice";
import store from "./store";
import Constants from "expo-constants";

const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;

// Mutex: only one refresh call in flight at a time; all concurrent 401s await it.
let _refreshPromise = null;

async function attemptTokenRefresh() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const rawRefresh = await getItem("refreshToken");
      const refreshToken = rawRefresh ? JSON.parse(rawRefresh) : null;
      const rawDeviceId = await getItem("deviceId");
      const deviceId = rawDeviceId ? JSON.parse(rawDeviceId) : null;

      if (!refreshToken || !deviceId) return null;

      const res = await axios.post(`${apiUrl}/api/auth/refresh`, {
        refreshToken,
        deviceId,
      });

      const { accessToken, refreshToken: newRefresh } = res.data?.data || {};
      if (!accessToken) return null;

      await setItem("accessToken", accessToken);
      await setItem("refreshToken", newRefresh);
      return accessToken;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

// Function to create and configure the Axios instance with interceptors
async function Axios({ ContentType = "application/json" }) {
  const rawToken = await getItem("accessToken");
  let token = null;
  if (rawToken != null && rawToken !== "") {
    try {
      token = JSON.parse(rawToken);
    } catch {
      token = rawToken;
    }
  }

  const axiosInstance = axios.create({
    baseURL: `${apiUrl}/api/`,
    headers: {
      ...(token ? { "x-access-token": token } : {}),
      "Content-Type": ContentType,
    },
    maxContentLength: 100 * 1024 * 1024, // 100MB
    maxBodyLength: 100 * 1024 * 1024, // 100MB
  });

  axiosInstance.interceptors.response.use(
    (response) => {
      // Success handling
      if (response.status === 202) return response;
      if (response.data && response.data.type === "success") {
        if (response.config.method.toLowerCase() !== "get") {
          const message = response.data.message || "Operation successful!";
          store.dispatch(addAlert({ type: "success", message }));
        }
      }
      return response;
    },
    async (error) => {
      const status = error.response?.status;
      const originalRequest = error.config;

      // Attempt silent token refresh on 401 (once per request, skip /auth/ calls)
      if (
        status === 401 &&
        !originalRequest._retried &&
        !originalRequest.url?.includes("/auth/")
      ) {
        originalRequest._retried = true;
        const newAccessToken = await attemptTokenRefresh();
        if (newAccessToken) {
          originalRequest.headers["x-access-token"] = newAccessToken;
          return axiosInstance(originalRequest);
        }
        // Refresh failed — clear tokens and trigger forced logout via Redux
        await removeItem("accessToken");
        await removeItem("refreshToken");
        store.dispatch(setSessionExpired());
        return Promise.reject(error);
      }

      if (
        status === 400 ||
        status === 401 ||
        status === 403 ||
        status === 404 ||
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
      ) {
        const message =
          error.response?.data?.message ||
          "Something went wrong. Please try again later.";
        store.dispatch(addAlert({ type: "error", message }));
      }

      return Promise.reject(error);
    }
  );

  return axiosInstance;
}

export default Axios;
