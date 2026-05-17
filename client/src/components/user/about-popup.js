import React from "react";
import Popup from "../popup";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import { useColorScheme } from "../../../lib/useColorScheme";

const AboutPopup = ({ showAboutPopup, setShowAboutPopup }) => {
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  return (
    <Popup
      showModal={showAboutPopup}
      setShowModal={setShowAboutPopup}
      withActions={false}
      title={t("about.title") || "About"}
    >
      <Text
        className="mb-3 text-lg text-center text-slate-800 dark:text-slate-200"
      >
        {t("about.title")}
      </Text>
      <Text
        className="mb-6 text-base text-center text-slate-800 dark:text-slate-200"
      >
        {t("about.description")}
      </Text>
      <Text
        className="mb-3 text-base text-center text-slate-800 dark:text-slate-200"
      >
        {t("about.version")}
        {": "}

        {Constants?.expoConfig?.version || "1.0.0"}
      </Text>
    </Popup>
  );
};

export default AboutPopup;
