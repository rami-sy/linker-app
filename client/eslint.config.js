module.exports = [
  {
    files: [
      "src/contexts/socket.context.js",
      "src/utils/offlineQueue.js",
      "src/components/chat/chat-input.js",
      "src/components/chat/show-attachment.js",
      "src/components/chat/message-list.js",
      "src/components/chat/footer.js",
      "src/components/chat/header.js",
      "src/components/chat/message-item.js",
      "src/components/chat/chat-item.js",
      "src/components/chat/group-details-popup.js",
      "src/components/chat/group-settings-popup.js",
      "src/components/chat/call.js",
      "src/components/incoming-call-notification.js",
      "src/components/mediasoup-call.js",
      "app/(wrappers)/_layout.js",
      "app/(wrappers)/(home)/(providers)/chats/[[]roomId[]].js",
      "app/(wrappers)/(home)/(providers)/(tabs)/chats.js",
      "tests/**/*.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        __DEV__: "readonly",
        window: "readonly",
        Notification: "readonly",
        URLSearchParams: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unreachable": "error",
      "no-constant-condition": "error",
      "no-unused-vars": "off",
    },
  },
  {
    files: [
      "src/components/add-friend/add-friend-list.js",
      "src/components/add-friend/add-friend-grid.js",
      "src/components/add-friend/add-friend-card.js",
      "app/(wrappers)/(home)/(providers)/(tabs)/friends-list.js",
      "app/(wrappers)/(home)/(providers)/(tabs)/users.js",
      "app/(wrappers)/(home)/(providers)/(tabs)/explore.js",
      "app/(wrappers)/(home)/(providers)/(tabs)/explore-map.js",
      "src/components/chat/chat-item.js",
      "src/components/chat/header.js",
      "src/components/chat/message-read-receipts-popup.js",
      "src/components/chat/message-item.js",
      "src/components/chat/call.js",
      "src/components/incoming-call-notification.js",
      "src/components/call-waiting-notification.js",
      "src/components/mediasoup-call.js",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/src/components/user-image",
                "**/src/components/user-name",
                "**/src/components/profile/user-card",
                "**/src/components/chat/user-card",
              ],
              message:
                "Use the unified user namespace at src/components/user instead.",
            },
          ],
        },
      ],
    },
  },
];
