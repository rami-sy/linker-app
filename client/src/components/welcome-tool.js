import { View, Text, TouchableOpacity, Image } from "react-native";
import React, { lazy, useState } from "react";
import i18n from "../lang/i18n";
import FeIcon from "react-native-vector-icons/Feather";
import SuspenseWrapper from "../hoc/suspense-wrapper";
import { useColorScheme } from "~/lib/useColorScheme";

const COUNTRY_CODES = { en: "gb", ar: "sa", tr: "tr", fr: "fr", es: "es", ru: "ru", zh: "cn", hi: "in" };

const ChangeLanguagePopup = lazy(() => import("./user/change-language-popup"));
const WelcomeTool = () => {
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const lang = i18n.language?.split("-")[0] || "en";
  const countryCode = COUNTRY_CODES[lang] || "gb";

  return (
    <>
      <SuspenseWrapper>
        {showLanguageModal && (
          <ChangeLanguagePopup
            showLanguageModal={showLanguageModal}
            setShowLanguageModal={setShowLanguageModal}
          />
        )}
      </SuspenseWrapper>
      <View className={`absolute top-6 right-0 p-3 gap-y-2`}>
        <TouchableOpacity
          className={`bg-[#ef233c] h-12 w-12 flex items-center justify-center rounded-full`}
          onPress={() => setShowLanguageModal(true)}
        >
          <Image
            source={{ uri: `https://flagcdn.com/w80/${countryCode}.png` }}
            style={{ width: 28, height: 19, borderRadius: 3 }}
            resizeMode="cover"
          />
        </TouchableOpacity>
        <TouchableOpacity
          className={`${
            isDark ? "bg-papaya" : "bg-sec"
          } h-12 w-12 flex items-center justify-center rounded-full`}
          onPress={toggleColorScheme}
        >
          <FeIcon
            name={!isDark ? "sun" : "moon"}
            size={32}
            color={isDark ? "#2D2D37" : "#dee4e6"}
          />
        </TouchableOpacity>
      </View>
    </>
  );
};

export default WelcomeTool;
