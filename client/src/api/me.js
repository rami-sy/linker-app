import { getItem, setItem } from "../utils/localStorage";
import Axios from "../../axiosInstance";
import * as DeviceInfo from "expo-device";

const auth = async (data, method) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post(`auth/${method}`, data); // Use the relative URL

    if (res?.data?.data?.token) {
      await setItem("token", res.data.data.token);
    }

    return res.data;
  } catch (e) {
    return e.response?.data ?? { type: "error", message: e.message };
  }
};

const signin = async (data) => {
  try {
    const deviceId = await fetchDeviceId();
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/signin", { ...data, deviceId }); // Use the relative URL
    if (res?.data?.data?.token) {
      await setItem("token", res.data.data.token);
    }
    return res.data;
  } catch (e) {
    return (
      e.response?.data ?? {
        type: "error",
        message: e.message || "Network error",
      }
    );
  }
};

const signup = async (data) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/signup", data); // Use the relative URL

    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const phoneAuth = async (data) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/phone-auth", data); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const emailVerify = async (data) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post(`auth/email-verify`, data); // Use the relative URL

    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const changePhoneNumber = async (data) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post(`auth/change-phone-number`, data); // Use the relative URL

    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const phoneVerify = async (data, method) => {
  try {
    const deviceId = await fetchDeviceId();
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post(`auth/phone-verify`, { ...data, deviceId }); // Use the relative URL

    if (res?.data?.data?.token) {
      await setItem("token", res.data.data.token);
    }
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const resendEmailVerificationCode = async (data, method) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post(`auth/resend-email-verification-code`, data); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response?.data ?? { type: "error", message: e.message };
  }
};

const getMe = async () => {
  try {
    const axios = await Axios({ ContentType: "application/json" });
    const res = await axios.get("auth/me"); // Use the relative URL
    setItem("daysRemaining", res?.data?.data?.daysRemaining ?? 0);
    return res.data;
  } catch (e) {
    return e.response?.data ?? { type: "error", message: e.message };
  }
};

const googleCallback = async (data) => {
  // /google/callback
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/google/callback", data); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const googleSignin = async (data) => {
  try {
    const deviceId = await fetchDeviceId();
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/google-signin", { ...data, deviceId }); // Use the relative URL
    if (res?.data?.data?.token) {
      await setItem("token", res.data.data.token);
    }
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const updateProfile = async (data) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.put("auth/me", data); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const changeEmail = async (data) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/change-email", data); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const changePassword = async (data) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/change-password", data); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const validateUserNameAndEmail = async (data) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/validate-user-name-and-email", data); // Use the relative URL
    return res.data;
  } catch (e) {
    return e?.response?.data;
  }
};

const forgotPassword = async (data) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/forgot-password", data); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const resetPassword = async (data) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/reset-password", data); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const deleteAccount = async () => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/delete-account"); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const deActiveAccount = async () => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/deactive-account"); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};
// fetch('/api/auth/send-verification-code', {

const sendVerificationCode = async (data) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/send-verification-code", data); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

// auth/delete-my-account
const deleteMyAccount = async (data) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("auth/delete-my-account", data); // Use the relative URL
    return res.data;
  } catch (e) {
    return e.response.data;
  }
};

const fetchDeviceId = async () => {
  const id = await getItem("deviceId");
  return JSON.parse(id);
};

async function getIPAddress() {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error("Error fetching IP address:", error);
    return null;
  }
}

async function getDeviceInfo() {
  const ipAddress = await getIPAddress();
  const deviceType =
    (await DeviceInfo.getDeviceTypeAsync()) || DeviceInfo.deviceType;
  const modelName = DeviceInfo.modelName;
  const osName = DeviceInfo.osName;
  const modelId = DeviceInfo.modelId;
  const deviceName = DeviceInfo.deviceName;

  const deviceId = JSON.parse(await getItem("deviceId"));

  return {
    deviceId,
    modelName,
    deviceType,
    osName,
    ipAddress,
    modelId,
    deviceName,
  };
}

const createReport = async (data) => {
  try {
    const axios = await Axios({
      ContentType: "application/json",
    }); // Create the Axios instance
    const res = await axios.post("reports", data); // Use the relative URL

    return res.data;
  } catch (e) {
    return e.response?.data ?? { type: "error", message: e.message };
  }
};

export {
  updateProfile,
  getMe,
  auth,
  resendEmailVerificationCode,
  googleCallback,
  validateUserNameAndEmail,
  changePassword,
  forgotPassword,
  deleteAccount,
  deActiveAccount,
  resetPassword,
  signin,
  signup,
  phoneAuth,
  phoneVerify,
  emailVerify,
  changeEmail,
  changePhoneNumber,
  sendVerificationCode,
  deleteMyAccount,
  googleSignin,
  fetchDeviceId,
  createReport,
  getDeviceInfo,
};
