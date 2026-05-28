/**
 * Live-stream socket handlers extracted from useMediasoup.
 */
export function createLiveStreamSocketHandlers({
  streamChatIntegrationRef,
  logger,
}) {
  return {
    liveStreamStarted: ({
      roomId,
      callId,
      broadcaster,
      broadcasters,
      settings,
    }) => {
      logger.streamEvent("Live stream started event received", {
        roomId,
        callId,
        broadcaster,
        broadcasters,
      });

      if (!roomId) return;

      try {
        const streamChatIntegration = streamChatIntegrationRef.current;
        const broadcasterData =
          broadcaster || (broadcasters && broadcasters[0]) || null;
        streamChatIntegration.handleStreamStarted({
          roomId,
          streamId: callId || roomId,
          broadcasterId: broadcasterData?._id,
          broadcasterData,
          settings: settings || {},
          startedAt: new Date().toISOString(),
        });
        logger.streamEvent("Stream added to activeStreams", { roomId });
      } catch (error) {
        logger.error("Error handling liveStreamStarted:", error);
      }
    },

    liveStreamEnded: ({ roomId, callId }) => {
      logger.streamEvent("Live stream ended event received", {
        roomId,
        callId,
      });

      if (!roomId) return;

      try {
        const streamChatIntegration = streamChatIntegrationRef.current;
        streamChatIntegration.handleStreamEnded({
          roomId,
          streamId: callId || roomId,
          duration: null,
          endedBy: null,
        });
        logger.streamEvent("Stream removed from activeStreams", { roomId });
      } catch (error) {
        logger.error("Error handling liveStreamEnded:", error);
      }
    },
  };
}
