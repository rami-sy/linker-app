import React from "react";
import { Text } from "react-native";
import moment from "moment";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "~/lib/useColorScheme";

const TimeAgo = ({ date, className }) => {
  let formattedDate;
  const momentDate = moment(date);
  const now = moment();
  const oneDayAgo = now.subtract(1, "day");
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();

  if (momentDate.isBefore(oneDayAgo)) {
    formattedDate = momentDate.format("YYYY-MM-DD");
  } else {
    formattedDate = momentDate.fromNow();
  }

  return (
    <Text
      className={`text-xs text-[#023047] dark:text-[#EDF6F9] ${className}`}
    >
      {t("profileScreen.lastSeen")} {formattedDate}
    </Text>
  );
};

export default TimeAgo;
