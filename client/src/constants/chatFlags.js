import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra || {};

function truthy(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).toLowerCase().trim();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * Client-side chat feature toggles (EXPO_PUBLIC_* or app.json extra).
 * Server behavior is unchanged; these only hide or simplify UI.
 *
 * Rollout: set in `.env` / EAS / `app.json` `extra` for staged releases.
 * Product analytics (KPI dashboards) should subscribe to the same flags
 * in your analytics layer when you wire events.
 */
export const chatFlags = {
  /** Show link preview cards under messages when `linkPreview` is present */
  linkPreviewsEnabled: truthy(
    process.env.EXPO_PUBLIC_CHAT_LINK_PREVIEWS ??
      extra.EXPO_PUBLIC_CHAT_LINK_PREVIEWS ??
      "1"
  ),
  /** @mention suggestion list in group composer */
  mentionSuggestionsEnabled: truthy(
    process.env.EXPO_PUBLIC_CHAT_MENTION_SUGGESTIONS ??
      extra.EXPO_PUBLIC_CHAT_MENTION_SUGGESTIONS ??
      "1"
  ),
  /** Thread replies UI (open thread, send with threadRoot) */
  threadsEnabled: truthy(
    process.env.EXPO_PUBLIC_CHAT_THREADS ?? extra.EXPO_PUBLIC_CHAT_THREADS ?? "1"
  ),
  /**
   * Inline "Thread" chip only when the message already has replies.
   * When true, start a new thread via message selection (long-press) bar.
   * Default on: less noise in busy chats.
   */
  threadChipRequireReplies: truthy(
    process.env.EXPO_PUBLIC_CHAT_THREAD_CHIP_REQUIRE_REPLIES ??
      extra.EXPO_PUBLIC_CHAT_THREAD_CHIP_REQUIRE_REPLIES ??
      "1"
  ),
  /**
   * In 1:1 chats, hide the empty "start thread" chip (chip still shows when there are replies).
   * Pair with threadChipRequireReplies or use alone.
   */
  threadChipGroupsOnly: truthy(
    process.env.EXPO_PUBLIC_CHAT_THREAD_CHIP_GROUPS_ONLY ??
      extra.EXPO_PUBLIC_CHAT_THREAD_CHIP_GROUPS_ONLY ??
      "0"
  ),
  /**
   * When showing "start thread" (zero replies), use a compact icon row instead of full label text.
   */
  threadChipIconOnlyWhenEmpty: truthy(
    process.env.EXPO_PUBLIC_CHAT_THREAD_CHIP_ICON_ONLY_EMPTY ??
      extra.EXPO_PUBLIC_CHAT_THREAD_CHIP_ICON_ONLY_EMPTY ??
      "0"
  ),
  /** AI draft-assist in composer (opt-in rollout). */
  aiAssistEnabled: truthy(
    process.env.EXPO_PUBLIC_CHAT_AI_ASSIST ??
      extra.EXPO_PUBLIC_CHAT_AI_ASSIST ??
      "1"
  ),
  /** Confirm opening suspicious external links from chat previews. */
  suspiciousLinkWarningEnabled: truthy(
    process.env.EXPO_PUBLIC_CHAT_SUSPICIOUS_LINK_WARNING ??
      extra.EXPO_PUBLIC_CHAT_SUSPICIOUS_LINK_WARNING ??
      "1"
  ),
};
