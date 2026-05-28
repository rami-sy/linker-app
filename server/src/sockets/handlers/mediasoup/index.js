const registerLiveStreamModerationHandlers = require("./liveStreamModeration");

/**
 * Registry for extracted MediaSoup handler modules.
 * Keep the large mediasoup.handlers.js as the main lifecycle owner while
 * moving independent event groups here incrementally.
 */
module.exports = function registerExtractedMediasoupHandlers(context) {
  registerLiveStreamModerationHandlers(context);
};
