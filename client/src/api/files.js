import axios from "axios";
import { getItem } from "../utils/localStorage";
import blob from "../utils/uriToBlob";
import Axios from "../../axiosInstance";

const mimeTypes = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  pdf: "application/pdf",
  webp: "image/webp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "audio/webm",
  m4a: "audio/mp4",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
};
const getFileExtension = (fileUri) => {
  const match = /\.(\w+)$/.exec(fileUri);
  return match ? match[1] : null;
};
const postFile = async (fileUri, fileName, type) => {
  const formData = new FormData();

  if (fileUri.startsWith("data:") || fileUri.startsWith("blob:")) {
    const blobData = await blob(fileUri);
    formData.append("file", blobData, fileName);
  } else {
    const fileExtension = getFileExtension(fileUri);
    formData.append("file", {
      uri: fileUri,
      name:
        fileName ||
        `${Math.random()?.toString(36)?.substring(2, 15)}.${fileExtension}`,
      type:
        type ||
        mimeTypes?.[fileExtension?.toLowerCase()] ||
        "application/octet-stream",
    });
  }

  try {
    const axios = await Axios({
      ContentType: "multipart/form-data",
    });
    const res = await axios.post("files", formData);
    return res.data;
  } catch (e) {
    console.log({ error: JSON.stringify(e.response) });
    return e.response.data;
  }
};

export { postFile };
