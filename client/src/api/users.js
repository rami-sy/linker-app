import axios from "axios";
import { getItem } from "../utils/localStorage";
import Axios from "../../axiosInstance";
import Constants from "expo-constants";

const API_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "http://localhost:4000";

const getUsers = async () => {
  const token = JSON.parse(await getItem("accessToken"));

  try {
    const res = await axios({
      method: "get",
      url: `${API_URL}/api/users/`,
      headers: {
        "x-access-token": token,
      },
    });
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

export { getUsers };
