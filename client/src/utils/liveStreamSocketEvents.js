/**
 * Shared live stream socket listeners for list screens and redux sync.
 */
export function subscribeLiveStreamEvents(socket, { onStarted, onEnded } = {}) {
  if (!socket) {
    return () => {};
  }

  const handleStarted = (payload) => {
    onStarted?.(payload);
  };

  const handleEnded = (payload) => {
    onEnded?.(payload);
  };

  socket.on("liveStreamStarted", handleStarted);
  socket.on("liveStreamEnded", handleEnded);

  return () => {
    socket.off("liveStreamStarted", handleStarted);
    socket.off("liveStreamEnded", handleEnded);
  };
}
