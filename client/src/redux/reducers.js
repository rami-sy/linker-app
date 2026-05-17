import alerts from "./alertSlice";
import users from "./userSlice";
import chats from "./chatSlice";
import calls from "./callSlice";
import app from "./appSlice";
import form from "./formSlice";
import webRTC from "./webRTCSlice";
import explore from "./exploreSlice";
import { combineReducers } from "redux";

export default combineReducers({
  app,
  alerts,
  users,
  chats,
  calls,
  form,
  webRTC,
  explore,
});
