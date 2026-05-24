import { Text, TouchableOpacity, View } from "react-native";
import React from "react";
import { useTranslation } from "react-i18next";
import FeIcon from "@expo/vector-icons/Feather";
import { useExploreSayHi } from "../../hooks/useExploreSayHi";

/**
 * Shared "View profile" + "Say Hi / Continue chat" row (swiper, explore map, explore list, users).
 */
export default function ExploreProfileActionBar({
  user,
  context,
  onViewProfile,
  className = "",
}) {
  const { t } = useTranslation();
  const { hasSayHiSession, canSayHi, handleSayHi } = useExploreSayHi(
    user,
    context
  );

  return (
    <View className={`w-full flex-row items-center gap-x-2 ${className}`}>
      <TouchableOpacity
        className="h-11 flex-1 items-center justify-center rounded-2xl bg-[#0a97b9] px-3"
        activeOpacity={0.85}
        onPress={onViewProfile}
        accessibilityRole="button"
        accessibilityLabel={t("header.viewProfile")}
      >
        <Text className="text-base font-semibold text-white" numberOfLines={1}>
          {t("header.viewProfile")}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        className={`h-11 flex-1 items-center justify-center rounded-2xl border px-3 ${
          hasSayHiSession
            ? "border-emerald-500 bg-emerald-600"
            : "border-[#0a97b9]/60 bg-white/80 dark:bg-[#10141d]/70"
        }`}
        onPress={handleSayHi}
        disabled={!canSayHi}
        style={{ opacity: canSayHi ? 1 : 0.45 }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSayHi }}
        accessibilityLabel={
          hasSayHiSession ? t("header.continueChat") : t("header.sayHi")
        }
      >
        <View className="flex-row items-center gap-x-2">
          {hasSayHiSession && <FeIcon name="message-circle" size={16} color="#ffffff" />}
          <Text
            className={`text-base font-semibold ${
              hasSayHiSession ? "text-white" : "text-[#0a97b9]"
            }`}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {hasSayHiSession ? t("header.continueChat") : t("header.sayHi")}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}
