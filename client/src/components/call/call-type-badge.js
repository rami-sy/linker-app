import React from "react";
import { View, Text } from "react-native";
import FeIcon from "react-native-vector-icons/Feather";
import { useTranslation } from "react-i18next";

const CALL_TYPE_META = {
  video: {
    icon: "video",
    iconColor: "#a855f7",
    chipClass: "bg-violet-500/15",
    textClass: "text-violet-600 dark:text-violet-400",
  },
  audio: {
    icon: "phone",
    iconColor: "#14b8a6",
    chipClass: "bg-teal-500/15",
    textClass: "text-teal-600 dark:text-teal-400",
  },
};

export const getCallTypeMeta = (isVideoCall) =>
  isVideoCall ? CALL_TYPE_META.video : CALL_TYPE_META.audio;

const CallTypeBadge = ({
  isVideoCall,
  variant = "chip",
  shortLabel = false,
  iconSize,
  containerClassName = "",
  textClassName = "",
}) => {
  const { t } = useTranslation();
  const meta = getCallTypeMeta(isVideoCall);
  const label = shortLabel
    ? isVideoCall
      ? t("callHistory.filters.video")
      : t("callHistory.filters.audio")
    : isVideoCall
      ? t("call.videoCall")
      : t("call.audioCall");

  if (variant === "inline") {
    return (
      <View className={`flex-row items-center ${containerClassName}`}>
        <FeIcon name={meta.icon} size={iconSize || 12} color={meta.iconColor} />
        <Text className={`ml-1 text-xs font-semibold ${meta.textClass} ${textClassName}`}>
          {label}
        </Text>
      </View>
    );
  }

  if (variant === "icon") {
    return <FeIcon name={meta.icon} size={iconSize || 18} color={meta.iconColor} />;
  }

  return (
    <View
      className={`flex-row items-center rounded-full px-2 py-0.5 ${meta.chipClass} ${containerClassName}`}
    >
      <FeIcon name={meta.icon} size={iconSize || 11} color={meta.iconColor} />
      <Text className={`ml-1 text-[11px] font-semibold ${meta.textClass} ${textClassName}`}>
        {label}
      </Text>
    </View>
  );
};

export default CallTypeBadge;
