/**
 * Recording-related socket handlers extracted from useMediasoup.
 */
export function createRecordingSocketHandlers({
  callId,
  dispatch,
  addAlert,
  t,
  logger,
  setIsRecording,
  setRecordingId,
}) {
  return {
    callRecordingStopped: ({
      callId: recordingCallId,
      recordingId: stoppedRecordingId,
      status,
    }) => {
      logger.callEvent("Call recording stopped notification received", {
        callId: recordingCallId,
        recordingId: stoppedRecordingId,
        status,
      });

      if (recordingCallId !== callId) return;

      setIsRecording(false);
      setRecordingId(null);

      dispatch(
        addAlert({
          type: "info",
          message:
            status === "processing"
              ? t("call.recording.processingMessage")
              : t("call.recording.stoppedMessage"),
        })
      );
    },

    callRecordingCompleted: ({
      callId: recordingCallId,
      recordingId,
      recording,
    }) => {
      if (recordingCallId !== callId) return;

      const duration = recording?.duration || 0;
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      const durationText = `${mins}:${secs.toString().padStart(2, "0")}`;

      dispatch(
        addAlert({
          type: "success",
          message: t("call.recording.completedMessage", {
            duration: durationText,
          }),
        })
      );
    },

    callRecordingProcessing: ({
      callId: recordingCallId,
      message,
    }) => {
      if (recordingCallId !== callId) return;

      dispatch(
        addAlert({
          type: "info",
          message: message || t("call.recording.processingMessage"),
        })
      );
    },
  };
}
