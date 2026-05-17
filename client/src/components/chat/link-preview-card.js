import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  Image,
  Platform,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "../../../lib/useColorScheme";
import { chatFlags } from "../../constants/chatFlags";
import logger from "../../utils/logger";

const warnedHostsCache = new Map();
const trustedHostsCache = new Set();
const HOST_WARNING_COOLDOWN_MS = 10 * 60 * 1000;

export default function LinkPreviewCard({ preview }) {
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  if (!preview?.url) return null;

  const getSuspicionScore = (value) => {
    try {
      const parsed = new URL(String(value || ""));
      const host = String(parsed.hostname || "").toLowerCase();
      if (!host) return { score: 100, host };
      let score = 0;
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) score += 60;
      if (host.includes("--")) score += 25;
      if (host.split(".").some((part) => part.length > 32)) score += 20;
      const labels = host.split(".");
      if (labels.length >= 5) score += 15;
      if (/\d{3,}/.test(host.replace(/\./g, ""))) score += 10;
      return { score, host };
    } catch {
      return { score: 100, host: "" };
    }
  };

  const open = () => {
    const targetUrl = String(preview.url || "");
    const proceed = () =>
      Linking.openURL(targetUrl).catch(() => {});
    const suspicion = getSuspicionScore(targetUrl);
    const warningLevel =
      suspicion.score >= 50 ? "high" : suspicion.score >= 25 ? "medium" : "low";
    if (
      chatFlags.suspiciousLinkWarningEnabled &&
      warningLevel !== "low"
    ) {
      const hostKey = String(suspicion.host || targetUrl);
      if (trustedHostsCache.has(hostKey)) {
        proceed();
        return;
      }
      const lastWarnedAt = warnedHostsCache.get(hostKey) || 0;
      const now = Date.now();
      const canShowWarning = now - lastWarnedAt >= HOST_WARNING_COOLDOWN_MS;
      logger.chatEvent("suspiciousLinkScored", {
        url: targetUrl,
        score: suspicion.score,
        level: warningLevel,
      });
      if (!canShowWarning && warningLevel === "medium") {
        // Reduce noisy prompts for medium-risk links if warned recently.
        proceed();
        return;
      }
      warnedHostsCache.set(hostKey, now);
      logger.chatEvent("suspiciousLinkWarningShown", {
        url: targetUrl,
        score: suspicion.score,
        level: warningLevel,
      });
      Alert.alert(
        t("chat.suspiciousLinkTitle", { defaultValue: "Suspicious link" }),
        warningLevel === "high"
          ? t("chat.suspiciousLinkBodyHigh", {
              defaultValue:
                "This link has multiple risk signals. Open it only if you fully trust the sender.",
            })
          : t("chat.suspiciousLinkBody", {
              defaultValue:
                "This link looks unusual. Open it only if you trust the sender.",
            }),
        [
          { text: t("general.cancel", { defaultValue: "Cancel" }), style: "cancel" },
          {
            text: t("chat.trustLinkDomain", {
              defaultValue: "Trust this domain",
            }),
            onPress: () => {
              trustedHostsCache.add(hostKey);
              logger.chatEvent("suspiciousLinkDomainTrusted", {
                host: hostKey,
                score: suspicion.score,
              });
              proceed();
            },
          },
          {
            text: t("chat.openLink", { defaultValue: "Open link" }),
            onPress: proceed,
          },
        ]
      );
      return;
    }
    proceed();
  };

  const title = preview.title || preview.siteName || preview.url;
  const desc = preview.description
    ? preview.description.replace(/\s+/g, " ").trim().slice(0, 220)
    : "";

  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${t("chat.a11y.linkPreviewCard")}: ${title}`}
      className={`mt-2 overflow-hidden rounded-xl border ${
        isDarkColorScheme
          ? "border-slate-600 bg-slate-900/80"
          : "border-slate-200 bg-white"
      }`}
      style={Platform.OS === "web" ? { maxWidth: 280 } : {}}
    >
      {preview.image ? (
        <Image
          source={{ uri: preview.image }}
          className="w-full h-32 bg-slate-200 dark:bg-slate-700"
          resizeMode="cover"
        />
      ) : null}
      <View className="p-2.5">
        {preview.siteName ? (
          <Text
            className="text-xs uppercase mb-0.5"
            numberOfLines={1}
            style={{
              color: isDarkColorScheme ? "#94a3b8" : "#64748b",
            }}
          >
            {preview.siteName}
          </Text>
        ) : null}
        <Text
          className={`text-sm font-semibold ${
            isDarkColorScheme ? "text-slate-100" : "text-slate-900"
          }`}
          numberOfLines={2}
        >
          {title}
        </Text>
        {desc ? (
          <Text
            className={`text-xs mt-1 ${
              isDarkColorScheme ? "text-slate-400" : "text-slate-600"
            }`}
            numberOfLines={3}
          >
            {desc}
          </Text>
        ) : null}
        <Text
          className="text-xs mt-1 text-sky-600 dark:text-sky-400"
          numberOfLines={1}
        >
          {t("chat.openLink")}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
