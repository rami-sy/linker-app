import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import Popup from "../popup";
import { setItem } from "../../utils/localStorage";
import i18n from "../../lang/i18n";
import { useColorScheme } from "~/lib/useColorScheme";
import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", name: "English",  country: "gb" },
  { code: "ar", name: "العربية", country: "sa" },
  { code: "tr", name: "Türkçe",  country: "tr" },
  { code: "fr", name: "Français", country: "fr" },
  { code: "es", name: "Español", country: "es" },
  { code: "ru", name: "Русский", country: "ru" },
  { code: "zh", name: "中文",    country: "cn" },
  { code: "hi", name: "हिन्दी",  country: "in" },
];

const flagUrl = (country) => `https://flagcdn.com/w80/${country}.png`;

const TEAL = "#0a97b9";

const LangCard = ({ item, selected, onPress, isDark }) => {
  const isActive = selected === item.code;
  return (
    <TouchableOpacity
      onPress={() => onPress(item.code)}
      activeOpacity={0.75}
      style={{
        flex: 1,
        margin: 5,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 8,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: isActive ? 2 : 1.5,
        borderColor: isActive ? TEAL : (isDark ? "#2a2f3e" : "#dde4e8"),
        backgroundColor: isActive
          ? "rgba(10,151,185,0.12)"
          : isDark
          ? "rgba(255,255,255,0.04)"
          : "rgba(0,0,0,0.03)",
        shadowColor: isActive ? TEAL : "#000",
        shadowOffset: { width: 0, height: isActive ? 3 : 1 },
        shadowOpacity: isActive ? 0.25 : 0.07,
        shadowRadius: isActive ? 8 : 3,
        elevation: isActive ? 4 : 1,
      }}
    >
      <Image
        source={{ uri: flagUrl(item.country) }}
        style={{ width: 40, height: 27, borderRadius: 4, marginBottom: 8 }}
        resizeMode="cover"
      />
      <Text
        style={{
          fontSize: 13,
          fontWeight: isActive ? "700" : "500",
          color: isActive ? TEAL : isDark ? "#d1d5db" : "#374151",
          textAlign: "center",
        }}
        numberOfLines={1}
      >
        {item.name}
      </Text>
      {isActive && (
        <View
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: TEAL,
          }}
        />
      )}
    </TouchableOpacity>
  );
};

const ChangeLanguagePopup = ({ showLanguageModal, setShowLanguageModal }) => {
  const [language, setLanguage] = useState(i18n.language?.split("-")[0] || "en");
  const { isDarkColorScheme } = useColorScheme();
  const { t } = useTranslation();

  const handleSelect = (code) => {
    setLanguage(code);
    i18n.changeLanguage(code);
    setItem("appLanguage", code);
    setShowLanguageModal(false);
  };

  // Pair languages into rows of 2
  const rows = [];
  for (let i = 0; i < LANGUAGES.length; i += 2) {
    rows.push(LANGUAGES.slice(i, i + 2));
  }

  return (
    <Popup
      showModal={showLanguageModal}
      setShowModal={setShowLanguageModal}
      withActions={false}
      title={t("general.language") || "Language"}
      subtitle={t("general.selectLanguage") || "Choose your preferred language"}
    >
      <View style={{ marginTop: 4 }}>
        {rows.map((row, rowIdx) => (
          <View key={rowIdx} style={{ flexDirection: "row", marginBottom: 2 }}>
            {row.map((item) => (
              <LangCard
                key={item.code}
                item={item}
                selected={language}
                onPress={handleSelect}
                isDark={isDarkColorScheme}
              />
            ))}
            {/* Pad last row if odd number of items */}
            {row.length === 1 && <View style={{ flex: 1, margin: 5 }} />}
          </View>
        ))}
      </View>
    </Popup>
  );
};

export default ChangeLanguagePopup;
