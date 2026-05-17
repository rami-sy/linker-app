import { View, Text, TouchableOpacity } from "react-native";
import React, { lazy, useState } from "react";
import i18n from "../lang/i18n";
import FeIcon from "react-native-vector-icons/Feather";
import SuspenseWrapper from "../hoc/suspense-wrapper";
import { useColorScheme } from "~/lib/useColorScheme";

const ChangeLanguagePopup = lazy(() => import("./user/change-language-popup"));
const WelcomeTool = () => {
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  
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
          <Text className={`text-papaya text-lg font-semibold uppercase`}>
            {i18n.language.split("-")[0]}
          </Text>
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
