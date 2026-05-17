import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import FeIcon from "react-native-vector-icons/Feather";
import { useTranslation } from "react-i18next";

export default function PinnedMessagesBar({ room, onJumpToMessageKey }) {
  const { t } = useTranslation();
  const pins = room?.pinnedMessages || [];
  if (!pins.length) return null;
  const messagesMap = room?.messages || {};

  return (
    <View className="bg-amber-100/90 dark:bg-slate-800/95 border-b border-amber-200 dark:border-slate-600 px-2 py-1.5">
      <Text className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1 px-1">
        {t("chat.pinnedMessages")}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {pins.map((pid) => {
          const pidStr = String(pid);
          const m =
            messagesMap[pidStr] ||
            Object.values(messagesMap).find(
              (x) =>
                String(x?._id) === pidStr || String(x?.uuId) === pidStr
            );
          const snippet = (m?.text || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80);
          const jumpKey = m?.uuId || m?._id || pid;
          return (
            <TouchableOpacity
              key={pidStr}
              onPress={() => onJumpToMessageKey?.(jumpKey)}
              className="mr-2 max-w-[220px] rounded-xl bg-white/90 dark:bg-slate-700 px-3 py-2 flex-row items-center"
            >
              <FeIcon name="bookmark" size={14} color="#d97706" />
              <Text
                numberOfLines={1}
                className="ml-2 text-sm text-slate-800 dark:text-slate-100 flex-shrink"
              >
                {snippet || "…"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
