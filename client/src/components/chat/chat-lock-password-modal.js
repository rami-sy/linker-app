import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  I18nManager,
} from "react-native";
import { useTranslation } from "react-i18next";
import FeIcon from "react-native-vector-icons/Feather";
import Popup from "../popup";
import Input from "../input";
import { useColorScheme } from "~/lib/useColorScheme";

export default function ChatLockPasswordModal({
  mode,
  password,
  onPasswordChange,
  onClose,
  onConfirm,
}) {
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  const isRTL = I18nManager.isRTL;

  if (!mode) {
    return null;
  }

  const title =
    mode === "add"
      ? t("general.addPassword")
      : mode === "remove"
        ? t("general.removePassword")
        : t("general.enterPassword");

  const subtitle =
    mode === "add"
      ? t("general.addPasswordToThisChat")
      : mode === "remove"
        ? t("general.enterPasswordToRemove")
        : t("general.enterThePasswordToOpenThisChat");

  const primaryLabel =
    mode === "add"
      ? t("general.addPassword")
      : mode === "remove"
        ? t("general.removePassword")
        : t("general.openChat");

  const accentMuted = isDarkColorScheme ? "#7dd3fc" : "#0a97b9";

  const cancelButtonStyle = isDarkColorScheme
    ? {
        backgroundColor: "#2d3344",
        borderWidth: 1,
        borderColor: "rgba(148, 163, 184, 0.35)",
      }
    : {
        backgroundColor: "#f1f5f9",
        borderWidth: 1,
        borderColor: "#cbd5e1",
      };

  const cancelLabelColor = isDarkColorScheme ? "#e2e8f0" : "#475569";

  return (
    <Popup
      showModal={true}
      justify="justify-center"
      items="items-center"
      withActions={false}
      title={title}
      onCancel={onClose}
      w="w-11/12"
      minDialogWidth={340}
      maxDialogWidth={680}
      dialogWidthFraction={0.94}
      p="p-5"
      pt="pt-5"
    >
      <View className="w-full -mt-1 mb-1">
        <View
          className={`flex-row items-center gap-2 mb-3 ${isRTL ? "flex-row-reverse" : ""}`}
        >
          <View
            className="h-9 w-9 items-center justify-center rounded-xl"
            style={{
              backgroundColor: isDarkColorScheme
                ? "rgba(10, 151, 185, 0.15)"
                : "rgba(10, 151, 185, 0.12)",
            }}
          >
            <FeIcon name="lock" size={18} color={accentMuted} />
          </View>
          <Text
            className="flex-1 text-sm leading-5 text-slate-600 dark:text-slate-400"
            style={{ textAlign: isRTL ? "right" : "left" }}
          >
            {subtitle}
          </Text>
        </View>

        <Input
          widthLabel={false}
          placeholder={t("auth.login.passwordPlaceholder")}
          value={password}
          onChange={onPasswordChange}
          secureTextEntry
          autoCapitalize="none"
          containerStyle="w-full mb-2"
        />

        <View
          className={`mt-4 w-full flex-row gap-3 ${isRTL ? "flex-row-reverse" : ""}`}
        >
          <TouchableOpacity
            className="flex-1 h-12 rounded-2xl items-center justify-center"
            style={cancelButtonStyle}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text
              className="text-base font-semibold"
              style={{ color: cancelLabelColor }}
            >
              {t("general.cancel")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 h-12 rounded-2xl items-center justify-center bg-[#0a97b9]"
            onPress={onConfirm}
            activeOpacity={0.85}
          >
            <Text className="text-base font-semibold text-white">
              {primaryLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Popup>
  );
}
