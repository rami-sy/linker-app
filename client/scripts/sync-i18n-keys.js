/**
 * Adds system, liveStreams, and navigation.liveStreams keys to locale files
 * that are missing them (uses English fallbacks).
 */
const fs = require("fs");
const path = require("path");

const langDir = path.join(__dirname, "../src/lang");
const skip = new Set(["en.json", "ar.json"]);

const patch = {
  explore: {
    emptyTitle: "No profiles match your filters yet.",
    emptySubtitle: "Try broadening age, gender, or search terms.",
  },
  navigation: { liveStreams: "Live Streams" },
  system: {
    offlineBanner: "Offline mode - some features may be limited",
    reconnectingBanner: "Reconnecting to chat...",
    reconnectingQueued: " ({{count}} queued)",
    pendingQueueBanner: "{{count}} pending action(s) waiting to sync",
  },
  liveStreams: {
    title: "Live Streams",
    subtitle: "Watch live broadcasts from your network",
    searchPlaceholder: "Search streams...",
    streamCountOne: "{{count}} stream",
    streamCountMany: "{{count}} streams",
    loading: "Loading live streams...",
    errorTitle: "Error",
    retry: "Retry",
    emptyTitle: "No live streams available",
    emptySubtitle: "Check back later for live broadcasts",
    searchEmptyTitle: "No streams found",
    searchEmptySubtitle: "Try adjusting your search query",
    sortViewers: "Viewers",
    sortDate: "Date",
    sortName: "Name",
    liveBadge: "LIVE",
    you: "You",
    viewerOne: "viewer",
    viewerMany: "viewers",
    unknownUser: "Unknown",
    stopStream: "Stop Stream",
    viewStream: "View Stream",
    sortMostViewers: "Most Viewers",
    sortLeastViewers: "Least Viewers",
    sortNewest: "Newest",
    sortOldest: "Oldest",
  },
  callRecording: {
    countOne: "{{count}} recording",
    countMany: "{{count}} recordings",
    download: "Download",
    save: "Save",
    loadError: "Failed to load recordings",
    downloadStarted: "Recording download started",
    savedToGallery: "Recording saved to gallery",
    downloadFailed: "Failed to download recording",
    processingMessage: "Recording is being processed...",
    stoppedMessage: "Call recording has stopped.",
    completedMessage: "Recording completed! Duration: {{duration}}s",
  },
};

for (const file of fs.readdirSync(langDir).filter((f) => f.endsWith(".json"))) {
  if (skip.has(file)) continue;
  const filePath = path.join(langDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const t = data.translation;

  t.explore = { ...t.explore, ...patch.explore };
  t.navigation = { ...t.navigation, ...patch.navigation };
  t.system = { ...(t.system || {}), ...patch.system };
  t.liveStreams = { ...(t.liveStreams || {}), ...patch.liveStreams };

  if (t.call?.recording) {
    t.call.recording = { ...t.call.recording, ...patch.callRecording };
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log("Patched", file);
}
