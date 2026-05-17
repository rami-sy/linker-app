import Axios from "../../axiosInstance";

const getAllInterests = async () => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.get("interests"); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

export { getAllInterests };
