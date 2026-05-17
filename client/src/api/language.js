import Axios from "../../axiosInstance";

const getAllLanguages = async () => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.get("languages"); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

export { getAllLanguages };
