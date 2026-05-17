import axios from "axios";
import { getItem } from "../utils/localStorage";
import Axios from "../../axiosInstance";

const getUsers = async () => {
  const token = JSON.parse(await getItem("token"));

  try {
    const res = await axios({
      method: "get",
      url: `${process.env.EXPO_PUBLIC_API_URL}/api/users/`,
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
