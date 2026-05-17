import { createSlice } from "@reduxjs/toolkit";

export const alertSlice = createSlice({
  name: "alerts",
  initialState: {
    alerts: [],
  },
  reducers: {
    addAlert: (state, action) => {
      const {
        message,
        title,
        type,
        duration,
        route,
        dedupeKey,
        eventType,
        priority = "normal",
        actionLabel,
        meta,
      } = action.payload || {};
      const now = Date.now();
      const _id = Math.random().toString(36).substr(2, 9);

      const nextDedupeKey = dedupeKey || null;
      if (nextDedupeKey) {
        const duplicate = state.alerts.find(
          (alert) =>
            alert?.dedupeKey === nextDedupeKey &&
            now - (alert?.createdAtMs || 0) < 2500
        );
        if (duplicate) return;
      }

      state.alerts.push({
        _id,
        message: message || title || "",
        title: title || "",
        type,
        duration: duration || 4000, // Default 4 seconds, 0 means no auto-dismiss
        route: route || null,
        dedupeKey: nextDedupeKey,
        eventType: eventType || null,
        priority,
        actionLabel: actionLabel || null,
        meta: meta || {},
        createdAtMs: now,
      });
    },
    deleteAlert: (state, action) => {
      const { _id } = action.payload;
      state.alerts = state.alerts.filter((alert) => alert._id !== _id);
    },
    deleteLatestAlert: (state) => {
      state.alerts.shift();
    },
    resetAlrets: (state) => {
      state.alerts = [];
    },
  },
});

export const { addAlert, deleteAlert, deleteLatestAlert, resetAlrets } =
  alertSlice.actions;

export const selectAlerts = (state) => state.alerts;

// Middleware function to handle automatic deletion of alerts
// Note: This is now handled in the AlertComponent itself for better control
// Keeping this for backward compatibility but it's recommended to use component-level auto-dismiss
export const autoDeleteAlertMiddleware = (store) => (next) => (action) => {
  if (action.type === addAlert.type) {
    const duration = action.payload.duration || 4000;
    if (duration > 0) {
      setTimeout(() => {
        // Delete the latest alert
        store.dispatch(deleteLatestAlert());
      }, duration);
    }
  }
  return next(action);
};

export default alertSlice.reducer;
