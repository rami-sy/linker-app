import React, { useState } from "react";
import Popup from "../popup";
import CategoryPicker from "../category-picker";
import { setItem } from "../../utils/localStorage";
import i18n from "../../lang/i18n";

const ChangeLanguagePopup = ({ showLanguageModal, setShowLanguageModal }) => {
  const [language, setLanguage] = useState(i18n.language);

  return (
    <Popup
      showModal={showLanguageModal}
      setShowModal={setShowLanguageModal}
      withActions={false}
      title="Language"
    >
      <CategoryPicker
        name="language"
        label="Language"
        value={language}
        withLabel={false}
        onChange={(value) => {
          setLanguage(value);
          i18n.changeLanguage(value);
          setItem("appLanguage", value);
          setShowLanguageModal(false);
        }}
        items={[
          { name: "English", _id: "en" },
          { name: "العربية", _id: "ar" },
          { name: "Türkçe", _id: "tr" },
          { name: "Français", _id: "fr" },
          { name: "Español", _id: "es" },
          // { name: "Deutsch", _id: "de" },
          // { name: "Italiano", _id: "it" },
          // { name: "Português", _id: "pt" },
          { name: "Русский", _id: "ru" },
          { name: "中文", _id: "zh" },
          // { name: "日本語", _id: "ja" },
          // { name: "한국어", _id: "ko" },
          { name: "हिन्दी", _id: "hi" },
          // { name: "Nederlands", _id: "nl" },
          // { name: "Polski", _id: "pl" },
          // { name: "Bahasa Indonesia", _id: "id" },
          // { name: "Tiếng Việt", _id: "vi" },
          // { name: "ไทย", _id: "th" },
          // { name: "Ελληνικά", _id: "el" },
          // { name: "Svenska", _id: "sv" },
        ]}
      />
    </Popup>
  );
};

export default ChangeLanguagePopup;
