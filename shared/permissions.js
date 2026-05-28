/**
 * Permission values shared between client previews and server enforcement.
 */
const VALID_PERMISSION_VALUES = [
  "everyone",
  "admin",
  "moderator",
  "friends",
  "specific",
  "noOne",
];

const CALL_SETTINGS_KEYS = [
  "screenShare",
  "recording",
  "callTransfer",
  "liveStream",
  "endCallForAll",
];

module.exports = {
  VALID_PERMISSION_VALUES,
  CALL_SETTINGS_KEYS,
};
