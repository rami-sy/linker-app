import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import FeIcon from "react-native-vector-icons/Feather";
import { useTranslation } from "react-i18next";
import ContextMenu from "../context-menu";
import accessibility from "../../utils/accessibility";
import { getCallTypeMeta } from "./call-type-badge";

const CallHistoryFilters = ({ filter, setFilter }) => {
  const { t } = useTranslation();

  const statusItems = [
    { value: "all", label: t("callHistory.filters.allStatus"), icon: "list" },
    { value: "answered", label: t("callHistory.filters.answered"), icon: "phone-call" },
    { value: "missed", label: t("callHistory.filters.missed"), icon: "phone-missed" },
    { value: "rejected", label: t("callHistory.filters.rejected"), icon: "phone-off" },
    { value: "cancelled", label: t("callHistory.filters.cancelled"), icon: "slash" },
  ];
  const typeItems = [
    { value: "all", label: t("callHistory.filters.allTypes"), icon: "list" },
    {
      value: "video",
      label: t("callHistory.filters.video"),
      icon: getCallTypeMeta(true).icon,
      color: getCallTypeMeta(true).iconColor,
    },
    {
      value: "audio",
      label: t("callHistory.filters.audio"),
      icon: getCallTypeMeta(false).icon,
      color: getCallTypeMeta(false).iconColor,
    },
  ];
  const directionItems = [
    { value: "all", label: t("callHistory.filters.allDirections"), icon: "list" },
    { value: "outgoing", label: t("callHistory.filters.outgoing"), icon: "arrow-up-right", color: "#38bdf8" },
    { value: "incoming", label: t("callHistory.filters.incoming"), icon: "arrow-down-left", color: "#10b981" },
  ];

  const makeMenuItems = (items, key) =>
    items.map((item) => ({
      name: item.label,
      onPress: () => setFilter((prev) => ({ ...prev, [key]: item.value })),
      icon: <FeIcon name={item.icon} size={16} color={item?.color || "#64748b"} />,
    }));

  const activeDirection = directionItems.find((it) => it.value === filter?.direction);

  return (
    <View className="w-full px-1 pb-2">
      <View className="px-1 py-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <ContextMenu options={makeMenuItems(typeItems, "type")} placement="bottom" width={180}>
            <View
              className="px-3 py-2 rounded-xl bg-chatSurfaceLight dark:bg-chatSurfaceDark border border-slate-200/60 dark:border-slate-700/60 flex-row items-center"
              {...accessibility.getButtonProps(t("callHistory.filters.allTypes"), t("callHistory.toggleViewHint"))}
            >
              <FeIcon
                name={typeItems.find((it) => it.value === filter?.type)?.icon || "list"}
                size={14}
                color="#64748b"
              />
              <Text className="ml-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                {typeItems.find((it) => it.value === filter?.type)?.label || t("callHistory.filters.allTypes")}
              </Text>
            </View>
          </ContextMenu>

          <ContextMenu options={makeMenuItems(statusItems, "status")} placement="bottom" width={180}>
            <View className="px-3 py-2 rounded-xl bg-chatSurfaceLight dark:bg-chatSurfaceDark border border-slate-200/60 dark:border-slate-700/60 flex-row items-center">
              <FeIcon
                name={statusItems.find((it) => it.value === filter?.status)?.icon || "list"}
                size={14}
                color="#64748b"
              />
              <Text className="ml-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                {statusItems.find((it) => it.value === filter?.status)?.label || t("callHistory.filters.allStatus")}
              </Text>
            </View>
          </ContextMenu>

          <ContextMenu options={makeMenuItems(directionItems, "direction")} placement="bottom" width={180}>
            <View className="px-3 py-2 rounded-xl bg-chatSurfaceLight dark:bg-chatSurfaceDark border border-slate-200/60 dark:border-slate-700/60 flex-row items-center">
              <FeIcon
                name={directionItems.find((it) => it.value === filter?.direction)?.icon || "list"}
                size={14}
                color={activeDirection?.color || "#64748b"}
              />
              <Text className={`ml-1.5 text-xs font-semibold ${
                activeDirection?.value === "incoming"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : activeDirection?.value === "outgoing"
                    ? "text-sky-600 dark:text-sky-400"
                    : "text-slate-700 dark:text-slate-200"
              }`}>
                {directionItems.find((it) => it.value === filter?.direction)?.label || t("callHistory.filters.allDirections")}
              </Text>
            </View>
          </ContextMenu>

          {(filter?.type !== "all" ||
            filter?.status !== "all" ||
            filter?.direction !== "all") && (
            <TouchableOpacity
              className="px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30"
              onPress={() => {
                setFilter({ type: "all", status: "all", direction: "all" });
              }}
            >
              <Text className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {t("callHistory.filters.clearFilters")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

export default CallHistoryFilters;

