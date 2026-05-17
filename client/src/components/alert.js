import React, { useEffect, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import { useDispatch } from "react-redux";
import { deleteAlert } from "../redux/alertSlice";
import FeIcon from "react-native-vector-icons/Feather";
import { useColorScheme } from "~/lib/useColorScheme";
import { router } from "expo-router";
import { NotificationTypes } from "../utils/notificationContract";

const AlertComponent = ({ alert }) => {
  const dispatch = useDispatch();
  const { isDarkColorScheme } = useColorScheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const autoDismissTimer = useRef(null);

  // Auto-dismiss after duration (default 4 seconds)
  const duration = alert.duration || 4000;

  const handleDismiss = useCallback(() => {
    // Exit animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -30,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      dispatch(deleteAlert({ _id: alert._id }));
    });
  }, [alert._id, dispatch]);

  useEffect(() => {
    // Start animation immediately
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss timer
    if (duration > 0) {
      autoDismissTimer.current = setTimeout(() => {
        handleDismiss();
      }, duration);
    }

    return () => {
      if (autoDismissTimer.current) {
        clearTimeout(autoDismissTimer.current);
      }
    };
  }, [duration, handleDismiss]);

  // Get icon and color tokens based on alert type
  const getAlertConfig = () => {
    const eventType = alert?.eventType;
    const paletteByKey = {
      chat: {
        icon: "message-circle",
        accent: "#14b8a6",
      },
      friendRequest: {
        icon: "user-plus",
        accent: "#3b82f6",
      },
      friendAccepted: {
        icon: "users",
        accent: "#22c55e",
      },
      like: {
        icon: "heart",
        accent: "#ec4899",
      },
      profileVisit: {
        icon: "eye",
        accent: "#8b5cf6",
      },
      success: {
        icon: "check-circle",
        accent: "#22c55e",
      },
      error: {
        icon: "alert-circle",
        accent: "#ef4444",
      },
      warning: {
        icon: "alert-triangle",
        accent: "#f59e0b",
      },
      info: {
        icon: "info",
        accent: "#3b82f6",
      },
      neutral: {
        icon: "info",
        accent: "#64748b",
      },
    };

    const resolveTokens = (key) => {
      const palette = paletteByKey[key] || paletteByKey.neutral;
      const accent = palette.accent;
      return {
        icon: palette.icon,
        accent,
        bgColor: isDarkColorScheme ? "#12141b" : "#ffffff",
        borderColor: isDarkColorScheme ? "#252b38" : "#e2e8f0",
        titleColor: isDarkColorScheme ? "#f8fafc" : "#0f172a",
        messageColor: isDarkColorScheme ? "#94a3b8" : "#475569",
        iconBg: isDarkColorScheme
          ? "rgba(255,255,255,0.08)"
          : "rgba(15, 23, 42, 0.05)",
        accentSoft: `${accent}22`,
        iconBorderColor: `${accent}4D`,
        actionBg: accent,
        actionBorder: isDarkColorScheme
          ? "rgba(255, 255, 255, 0.08)"
          : "rgba(15, 23, 42, 0.02)",
        actionText: "#ffffff",
        actionShadow:
          isDarkColorScheme
            ? {
                shadowColor: "#000000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.28,
                shadowRadius: 5,
                elevation: 4,
              }
            : {},
        closeColor: isDarkColorScheme ? "#94a3b8" : "#64748b",
        closeBg: isDarkColorScheme
          ? "rgba(148, 163, 184, 0.12)"
          : "rgba(100, 116, 139, 0.12)",
      };
    };

    if (eventType === NotificationTypes.CHAT_MESSAGE) {
      return resolveTokens("chat");
    }
    if (eventType === NotificationTypes.FRIEND_REQUEST) {
      return resolveTokens("friendRequest");
    }
    if (eventType === NotificationTypes.FRIEND_ACCEPTED) {
      return resolveTokens("friendAccepted");
    }
    if (eventType === NotificationTypes.LIKE_RECEIVED) {
      return resolveTokens("like");
    }
    if (eventType === NotificationTypes.PROFILE_VISITED) {
      return resolveTokens("profileVisit");
    }
    switch (alert.type) {
      case "success":
        return resolveTokens("success");
      case "error":
        return resolveTokens("error");
      case "warning":
        return resolveTokens("warning");
      case "info":
        return resolveTokens("info");
      default:
        return resolveTokens("neutral");
    }
  };

  const config = getAlertConfig();

  const handleOpenRoute = useCallback(() => {
    if (!alert?.route) return;
    try {
      router.push(alert.route);
      handleDismiss();
    } catch (e) {
      console.warn("Failed to navigate from alert", e);
    }
  }, [alert?.route, handleDismiss]);

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [
          { translateY: slideAnim },
          { scale: scaleAnim },
        ],
        marginBottom: 10,
        marginHorizontal: 16,
        maxWidth: "94%",
        alignSelf: "center",
        pointerEvents: "box-none", // Allow touches to pass through empty areas
      }}
    >
      <View
        style={{
          backgroundColor: config.bgColor,
          borderRadius: 20,
          paddingVertical: 14,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "flex-start",
          shadowColor: isDarkColorScheme ? "#020617" : "#0f172a",
          shadowOffset: {
            width: 0,
            height: 8,
          },
          shadowOpacity: isDarkColorScheme ? 0.32 : 0.1,
          shadowRadius: 20,
          elevation: 8,
          borderWidth: 1,
          borderColor: config.borderColor,
          minWidth: 300,
          maxWidth: "95%",
          pointerEvents: "auto", // Allow interaction with the alert content only
          overflow: "hidden",
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            backgroundColor: config.accent,
            borderTopLeftRadius: 20,
            borderBottomLeftRadius: 20,
          }}
        />
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: config.accentSoft,
            borderWidth: 1,
            borderColor: config.iconBorderColor,
            marginRight: 12,
            marginTop: 1,
          }}
        >
          <FeIcon name={config.icon} size={19} color={config.accent} />
        </View>

        <View style={{ flex: 1, flexShrink: 1, paddingRight: 10 }}>
          {!!alert.title && (
            <Text
              style={{
                color: config.titleColor,
                fontSize: 15,
                fontWeight: "800",
                lineHeight: 21,
              }}
              numberOfLines={1}
            >
              {alert.title}
            </Text>
          )}
          <Text
            style={{
              color: config.messageColor,
              fontSize: 13.5,
              fontWeight: "600",
              lineHeight: 18,
              flexShrink: 1,
              marginTop: alert.title ? 1 : 0,
            }}
            numberOfLines={3}
          >
            {alert.message}
          </Text>
        </View>

        <View
          style={{
            marginLeft: 6,
            alignItems: "flex-end",
            justifyContent: "flex-start",
            gap: 8,
          }}
        >
          <TouchableOpacity
            onPress={handleDismiss}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: config.closeBg,
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FeIcon name="x" size={16} color={config.closeColor} />
          </TouchableOpacity>

          {!!alert.route && (
            <TouchableOpacity
              onPress={handleOpenRoute}
              style={{
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: config.actionBorder,
                backgroundColor: config.actionBg,
                minWidth: 68,
                minHeight: 32,
                alignItems: "center",
                justifyContent: "center",
                ...config.actionShadow,
              }}
            >
              <Text
                style={{
                  color: config.actionText,
                  fontSize: 12,
                  fontWeight: "800",
                  lineHeight: 14,
                }}
              >
                {alert.actionLabel || "Open"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

export default AlertComponent;
