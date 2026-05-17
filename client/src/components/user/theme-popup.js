import React from "react";
import Popup from "../popup";
import CategoryPicker from "../category-picker";
import { useTranslatedAttributes } from "../../constants";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "~/lib/useColorScheme";

const ThemePopup = ({ showThemePopup, setShowThemePopup }) => {
  const { themes } = useTranslatedAttributes();
  const { colorScheme, setColorScheme } = useColorScheme();
  const { t } = useTranslation();
  return (
    <Popup
      showModal={showThemePopup}
      setShowModal={setShowThemePopup}
      withActions={false}
      w="w-auto"
      p="p-6"
      title={t("user.theme") || "Theme"}
    >
      <CategoryPicker
        label={t("user.theme", "Theme")}
        items={themes}
        mb="mb-0"
        withLabel={false}
        value={colorScheme}
        onChange={async (value) => {
          await setColorScheme(value);
          setShowThemePopup(false);
        }}
        name="education"
      />
    </Popup>
  );
};

export default ThemePopup;
