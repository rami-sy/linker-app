import axios from "axios";
import { getItem } from "./src/utils/localStorage";
import { addAlert } from "./src/redux/alertSlice";
import store from "./store";
import { removeLoadingAction, setLoadingAction } from "./src/redux/appSlice";
import Constants from "expo-constants";
const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;

// Function to create and configure the Axios instance with interceptors
async function Axios({ ContentType = "application/json" }) {
  const rawToken = await getItem("token");
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
  // if (action) {
  //   console.log({ action });

  //   store.dispatch(setLoadingAction(action));
  // }
  // Set up response interceptors directly within this function
  axiosInstance.interceptors.response.use(
    (response) => {
      // Success handling
      if (response.status === 202) return response;
      if (response.data && response.data.type === "success") {
        if (response.config.method.toLowerCase() !== "get") {
          const message = response.data.message || "Operation successful!";
          store.dispatch(
            addAlert({
              type: "success",
              message,
            })
          );
        }
      }

      // if (action) {
      //   store.dispatch(removeLoadingAction(action));
      // }

      return response;
    },
    (error) => {
      const status = error.response?.status;
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
        store.dispatch(
          addAlert({
            type: "error",
            message,
          })
        );
      }
      // if (action) {
      //   store.dispatch(removeLoadingAction(action));
      // }
      return Promise.reject(error);
    }
  );

  return axiosInstance;
}

export default Axios;
