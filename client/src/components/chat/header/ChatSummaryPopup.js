import React from "react";
import { View, Text } from "react-native";
import Popup from "../../popup";
import Button from "../../button";

export default function ChatSummaryPopup({
  open,
  setOpen,
  t,
  chatSummaryData,
  onRefresh,
}) {
  if (!open) return null;

  return (
    <Popup
      showModal={open}
      setShowModal={setOpen}
      withActions={false}
      title={t("chat.aiSummaryTitle", { defaultValue: "Chat summary" })}
      subtitle={t("chat.aiSummarySubtitle", {
        defaultValue: "Quick summary of recent messages and calls.",
      })}
      w="w-[90%] max-w-[560px]"
    >
      <View className="w-full py-2">
        <Text className="text-sm text-slate-600 dark:text-slate-300">
          {t("chat.aiSummaryStats", {
            defaultValue: "Messages: {{messages}} | Call events: {{calls}}",
            messages: chatSummaryData?.textCount || 0,
            calls: chatSummaryData?.callCount || 0,
          })}
        </Text>
        <Text className="text-sm font-semibold mt-3 text-slate-800 dark:text-slate-100">
          {t("chat.aiSummaryCallInsight", { defaultValue: "Call insight" })}
        </Text>
        <Text className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          {chatSummaryData?.callInsight ||
            t("chat.aiSummaryNoCallInsight", {
              defaultValue: "No recent call trend.",
            })}
        </Text>
        {typeof chatSummaryData?.callHealthScore === "number" && (
          <Text className="text-xs text-slate-500 dark:text-slate-300 mt-1">
            {t("chat.aiSummaryCallHealthScore", {
              defaultValue: "Call health score: {{score}}/100",
              score: chatSummaryData.callHealthScore,
            })}
          </Text>
        )}
        {chatSummaryData?.callRecommendation ? (
          <Text className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            {t("chat.aiSummaryCallRecommendation", {
              defaultValue: "{{text}}",
              text: chatSummaryData.callRecommendation,
            })}
          </Text>
        ) : null}
        <Text className="text-sm font-semibold mt-3 text-slate-800 dark:text-slate-100">
          {t("chat.aiSummaryTopics", { defaultValue: "Top topics" })}
        </Text>
        <Text className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          {(chatSummaryData?.topTopics || []).length > 0
            ? chatSummaryData.topTopics.join(", ")
            : t("chat.aiSummaryNoTopics", {
                defaultValue: "No dominant topics yet.",
              })}
        </Text>
        <Text className="text-sm font-semibold mt-3 text-slate-800 dark:text-slate-100">
          {t("chat.aiSummaryActions", { defaultValue: "Action items" })}
        </Text>
        {(chatSummaryData?.actionItems || []).length > 0 ? (
          (chatSummaryData?.actionItems || []).map((item, idx) => (
            <Text
              key={`${idx}-${item.slice(0, 8)}`}
              className="text-sm text-slate-600 dark:text-slate-300 mt-1"
            >
              {`\u2022 ${item}`}
            </Text>
          ))
        ) : (
          <Text className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            {t("chat.aiSummaryNoActions", {
              defaultValue: "No explicit action items detected.",
            })}
          </Text>
        )}
        <View className="mt-3 flex-row justify-end">
          <Button
            label={t("chat.aiSummaryRefresh", { defaultValue: "Refresh summary" })}
            onPress={onRefresh}
          />
        </View>
      </View>
    </Popup>
  );
}
