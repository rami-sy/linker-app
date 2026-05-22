/** Shared ContextMenu options for chat header (selection + normal modes). */
export function buildHeaderMenuOptions({
  t,
  room,
  handleMenuOption,
  handleRetryAllFailed,
  failedMessagesCount,
  openChatSummary,
  setInChatSearchOpen,
  onJumpToMessageKey,
  setGroupSettingsModal,
  setGroupDetailsModal,
  setCallSettingsModal,
  setChatSettingsModal,
  canAddMembers,
  isChatMuted,
  handleUnmuteChat,
  setShowMuteModal,
  getAutoDeleteDisplayText,
  autoDeleteOptions,
  updateAutoDeleteTimer,
  autoDeleteTimer,
  canModifyDisappearingMessages,
  youBlockedUser,
  setReportModal,
  socket,
  setSelectedMessages,
  navigateBackSafely,
  router,
}) {
  return [
    {
      name: t("header.viewProfile"),
      onPress: () => handleMenuOption("visitProfile"),
      hide: room?.isGroup,
    },
    {
      name: t("chat.retryAllFailed", { defaultValue: "Retry all failed" }),
      onPress: handleRetryAllFailed,
      hide: failedMessagesCount <= 0,
    },
    {
      name: t("chat.aiSummaryTitle", { defaultValue: "Chat summary" }),
      onPress: openChatSummary,
    },
    {
      name: t("chat.searchInChat"),
      onPress: () => setInChatSearchOpen(true),
      hide: !onJumpToMessageKey,
    },
    {
      name: t("chat.scheduledMessagesTitle", {
        defaultValue: "Scheduled messages",
      }),
      onPress: () => handleMenuOption("scheduledMessages"),
    },
    {
      name: t("header.groupSettings"),
      onPress: () => setGroupSettingsModal(true),
      hide: !room?.isGroup,
    },
    {
      name: t("general.members"),
      onPress: () => setGroupDetailsModal(true),
      hide: !room?.isGroup,
    },
    {
      name: t("user.settings") || "Settings",
      submenu: [
        {
          name: t("callSettingsScreen.title") || "Call settings",
          onPress: () => setCallSettingsModal(true),
        },
        {
          name: t("chatSettingsScreen.title") || "Chat settings",
          onPress: () => setChatSettingsModal(true),
        },
      ],
      hide: !room?.isGroup,
    },
    {
      name: t("header.addMember"),
      onPress: () => handleMenuOption("addMember"),
      hide: !room?.isGroup || !canAddMembers,
    },
    {
      name: isChatMuted
        ? t("header.unmuteChat") || "Unmute"
        : t("header.muteChat") || "Mute",
      onPress: () => {
        if (isChatMuted) {
          handleUnmuteChat();
        } else {
          setShowMuteModal(true);
        }
      },
    },
    {
      name: `${t("chatSettingsScreen.autoDelete.title") || "Disappearing Messages"} (${getAutoDeleteDisplayText})`,
      submenu: autoDeleteOptions.map((option) => ({
        name: option.label,
        onPress: () => updateAutoDeleteTimer(option.value),
        selected: autoDeleteTimer === option.value,
      })),
      hide: !canModifyDisappearingMessages,
    },
    {
      name: t("header.clearChat"),
      onPress: () => handleMenuOption("clearChat"),
    },
    {
      name: youBlockedUser ? t("header.unblockUser") : t("header.blockUser"),
      onPress: () => handleMenuOption("blockUser"),
      hide: room?.isGroup,
    },
    {
      name: "Report user",
      onPress: () => setReportModal(true),
      hide: room?.isGroup,
    },
    {
      name: t("header.exitGroup"),
      onPress: () => {
        if (socket) {
          socket.emit("exitRoom", { room: room?._id });
        }
        setSelectedMessages([]);
        if (router.canGoBack()) {
          navigateBackSafely();
        } else {
          router.push("/chats");
        }
      },
      hide: !room?.isGroup,
    },
    {
      name: t("header.cancel"),
      onPress: () => {},
    },
  ];
}
