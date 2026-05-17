import { createSlice } from "@reduxjs/toolkit";
const initialState = {
  callStatus: "idle",
  callerSignal: null,
  callerUser: null,
  room: null,
  isVideoCall: false,
  isMicOn: true,
  isFrontCamera: true,
  isSpeakerOn: true,
  localStream: null,
  remoteStreams: {},
  isMinimized: false,
};
export const callSlice = createSlice({
  name: "calls",
  initialState,
  reducers: {
    setCallStatus: (state, action) => {
      state.callStatus = action.payload;
    },
    setCallerSignal: (state, action) => {
      state.callerSignal = action.payload;
    },
    setCallerUser: (state, action) => {
      state.callerUser = action.payload;
    },
    setRoom: (state, action) => {
      state.room = action.payload;
    },
    setIsVideoCall: (state, action) => {
      state.isVideoCall = action.payload;
    },
    setIsMicOn: (state, action) => {
      state.isMicOn = action.payload;
    },
    setIsFrontCamera: (state, action) => {
      state.isFrontCamera = action.payload;
    },
    setIsSpeakerOn: (state, action) => {
      state.isSpeakerOn = action.payload;
    },
    setLocalStream: (state, action) => {
      state.localStream = action.payload;
    },
    setRemoteStreams: (state, action) => {
      state.remoteStreams = action.payload;
    },
    addRemoteStream: (state, action) => {
      state.remoteStreams = {
        ...state.remoteStreams,
        ...action.payload,
      };
    },

    updateRemoteStreams: (state, action) => {
      state.remoteStreams = state.remoteStreams.map((stream) => {
        if (stream.id === action.payload.id) {
          return action.payload;
        }
        return stream;
      });
    },
    removeRemoteStream: (state, action) => {
      delete state.remoteStreams[action.payload];
    },
    setIsMinimized: (state, action) => {
      state.isMinimized = action.payload;
    },
    resetCallState: (state) => {
      return initialState; // Reset the state back to the initial values
    },
  },
});

export const {
  setCallStatus,
  setCallerSignal,
  setCallerUser,
  setRoom,
  setIsVideoCall,
  setIsMicOn,
  setIsFrontCamera,
  setIsSpeakerOn,
  setLocalStream,
  setRemoteStreams,
  addRemoteStream,
  removeRemoteStream,
  resetCallState,
  setIsMinimized,
  updateRemoteStreams,
} = callSlice.actions;

export const selectCalls = (state) => state.calls;

export default callSlice.reducer;
