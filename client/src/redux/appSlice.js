import { createSlice } from "@reduxjs/toolkit";

export const appSlice = createSlice({
  name: "app",
  initialState: {
    prevScreens: [],
    theme: null, // Will be synced with NativeWind colorScheme
    devices: [],
    isAuthenticated: false,
  },
  reducers: {
    setPrevScreen: (state, action) => {
      if (state.prevScreens.length >= 5) {
        state.prevScreens.shift();
      }
      state.prevScreens.push(action.payload);
    },

    setTheme: (state, action) => {
      state.theme = action.payload;
    },
    setDevices: (state, action) => {
      state.devices = action.payload;
    },
    removeDevice: (state, action) => {
      state.devices = state.devices.filter(
        (device) => device._id !== action.payload
      );
    },
    resetApp: (state) => {
      state.prevScreens = [];
    },
    setIsAuthenticated: (state, action) => {
      state.isAuthenticated = action.payload;
    },
  },
});

export const {
  setPrevScreen,
  resetApp,
  setTheme,
  setDevices,
  removeDevice,
  setIsAuthenticated,
} = appSlice.actions;

export const selectApp = (state) => state.app;

export default appSlice.reducer;
