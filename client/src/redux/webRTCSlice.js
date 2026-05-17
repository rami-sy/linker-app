import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  localStream: null,
  remoteStream: null,
  localMicOn: true,
  isVideoEnabled: true,
  type: null,
  callingUser: null,
  callTime: "00:00",
  isFrontCamera: true,
};

const webRTCSlice = createSlice({
  name: "webRTC",
  initialState,
  reducers: {
    setLocalStream: (state, action) => {
      state.localStream = action.payload;
    },
    setRemoteStream: (state, action) => {
      state.remoteStream = action.payload;
    },
    toggleMic: (state) => {
      state.localMicOn = !state.localMicOn;
    },

    setType: (state, action) => {
      state.type = action.payload;
    },
    setCallingUser: (state, action) => {
      state.callingUser = action.payload;
    },
    setCallTime: (state, action) => {
      state.callTime = action.payload;
    },
    setIsFrontCamera: (state, action) => {
      state.isFrontCamera = action.payload;
    },
    setIsVideoEnabled: (state, action) => {
      state.isVideoEnabled = action.payload;
    },
    setLocalMicOn: (state, action) => {
      state.localMicOn = action.payload;
    },

    resetCallState: (state) => {
      return initialState;
    },
  },
});

export const {
  setLocalStream,
  setRemoteStream,
  toggleMic,
  toggleWebcam,
  setType,
  setCallingUser,
  setCallTime,
  setIsFrontCamera,
  setIsVideoEnabled,
  resetCallState,
  setLocalMicOn,
  setLocalWebcamOn,
} = webRTCSlice.actions;

export default webRTCSlice.reducer;
