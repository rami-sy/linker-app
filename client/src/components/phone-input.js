import {
  View,
  Text,
  TouchableOpacity,
  I18nManager,
  StyleSheet,
} from "react-native";
import React, { forwardRef, useEffect, useRef, useState } from "react";
import PhoneInputNumber from "react-native-phone-number-input";
import parsePhoneNumber from "libphonenumber-js";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { getLocales } from "expo-localization";
import { useColorScheme } from "~/lib/useColorScheme";

const PhoneInput = forwardRef(
  (
    {
      label,
      placeholder,
      value,
      onChange,
      onPress,
      containerStyle,
      error,
      placeholderTextColor,
    },
    ref
  ) => {
    const { t } = useTranslation(); // استخدام الترجمة
    const { isDarkColorScheme } = useColorScheme();

    const InputWrapper = onPress ? TouchableOpacity : View;
    const additionalProps = onPress ? { onPress: onPress } : {};
    const phoneInputRef = useRef(null);
    const [phoneValue, setPhoneValue] = useState(value);
    const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

    useEffect(() => {
      if (phoneValue) {
        const getCountryCode = phoneInputRef.current?.getCountryCode();

        const phoneNumber = parsePhoneNumber(phoneValue, getCountryCode);

        if (
          phoneNumber &&
          phoneNumber.isValid() &&
          phoneNumber.isPossible() &&
          getCountryCode === phoneNumber.country
        ) {
          onChange({ value: phoneNumber?.number, error: "" });
        } else {
          onChange({
            value: phoneNumber?.number,
            error: t("general.pleaseEnterValidPhoneNumber"), // استخدام الترجمة هنا
          });
        }
      }
    }, [phoneValue]);

    return (
      <InputWrapper
        onPress={onPress}
        className={`w-4/5 mb-6 ${containerStyle}`}
        {...additionalProps}
      >
        {error ? (
          <Text
            style={styles.errorText}
            className={`mb-1 ml-2 ${
              isDarkColorScheme ? "text-[#f56800]" : "text-[#ef233c]"
            }`}
          >
            {error}
          </Text>
        ) : (
          <Text
            className="text-placehoder dark:text-papaya mb-1 ml-2"
          >
            {label || placeholder}
          </Text>
        )}

        <PhoneInputNumber
          containerStyle={[
            {
              ...styles.phoneInputContainer,
              backgroundColor: isDarkColorScheme ? "#1e212b" : "#f6f8f9",
            },
            isRTL ? styles.rtlLayout : styles.ltrLayout,
          ]}
          flagButtonStyle={[
            styles.flagButton,
            isRTL ? styles.flagButtonRTL : styles.flagButtonLTR,
          ]}
          disableArrowIcon={true}
          textInputStyle={{
            ...styles.textInput,
            backgroundColor: isDarkColorScheme ? "#1e212b" : "#f6f8f9",
            color: isDarkColorScheme ? "#dee4e6" : "#2D2D37",
          }}
          textContainerStyle={{
            ...styles.textContainer,
            backgroundColor: isDarkColorScheme ? "#1e212b" : "#f6f8f9",
          }}
          codeTextStyle={{
            ...styles.codeText,
            color: isDarkColorScheme ? "#dee4e6" : "#2D2D37",
          }}
          placeholder={placeholder}
          initialCountry={"tr"}
          layout="second"
          textStyle={{
            color: isDarkColorScheme ? "#dee4e6" : "#2D2D37",
          }}
          ref={phoneInputRef}
          value={phoneValue}
          defaultCode="TR"
          onChangeText={(text) => {
            setPhoneValue(text);
          }}
          autoFocus
          textProps={{
            placeholder: t("general.phoneNumber"), // استخدام الترجمة هنا
          }}
          textInputProps={{
            placeholderTextColor: placeholderTextColor,
          }}
        />
      </InputWrapper>
    );
  }
);
const styles = StyleSheet.create({
  phoneInputContainer: {
    width: "100%",
    height: 48,
    backgroundColor: "#1e212b", // sec color
    borderRadius: 16,
    flexDirection: "row",
  },
  rtlLayout: {
    flexDirection: "row-reverse",
  },
  ltrLayout: {
    flexDirection: "row",
  },
  flagButton: {
    width: 64,
    fontSize: 14,
    color: "#e7e5e4", // slate-200
    borderColor: "#78716c", // slate-500
  },
  flagButtonRTL: {
    borderLeftWidth: 1,
    borderRightWidth: 0,
    borderTopRightRadius: 16,
  },
  flagButtonLTR: {
    borderRightWidth: 1,
    borderLeftWidth: 0,
    borderTopLeftRadius: 16,
  },
  textInput: {
    height: "100%",
    fontSize: 14,
    backgroundColor: "#1e212b", // sec color
  },
  textContainer: {
    height: "100%",
    paddingHorizontal: 24,
    paddingRight: 24,
    paddingVertical: 0,
    backgroundColor: "#1e212b", // sec color
    borderRadius: 16,
  },
  codeText: {
    fontSize: 14,
  },
});

export default PhoneInput;
