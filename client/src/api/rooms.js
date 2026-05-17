import axios from "axios";
import { getItem } from "../utils/localStorage";
import Axios from "../../axiosInstance";

const getRoom = async ({ _id }) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.get(`room/${_id}`); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const getMyRooms = async () => {
  const token = JSON.parse(await getItem("token"));

  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.get("room/my-rooms"); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

export { getRoom, getMyRooms, postRoom };
