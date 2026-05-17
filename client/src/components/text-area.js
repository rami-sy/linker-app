import { TextInput, View, Text } from "react-native";
import React from "react";
import { useColorScheme } from "~/lib/useColorScheme";
import { getProfileFormChrome } from "./profile-edit/profile-form-theme";

const TextArea = ({
  placeholder,
  value,
  onChange,
  keyboardType,
  autoCapitalize,
  secureTextEntry,
  containerStyle,
  inputStyle,
  numberOfLines = 6,
  error,
}) => {
  const { isDarkColorScheme } = useColorScheme();
  const chrome = getProfileFormChrome(isDarkColorScheme);
  return (
    <View className={`w-4/5 mb-6 ${containerStyle}`}>
      <View className={`flex-row items-center justify-start`}>
        {error ? (
          <Text
            className="mb-1.5 ml-0 text-sm text-[#ef233c] dark:text-[#f56800]"
          >
            {error}
          </Text>
        ) : (
          <Text className={`${chrome.labelClass} ml-0`}>
            {placeholder}
          </Text>
        )}
      </View>
      <View
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: chrome.fieldBg,
          borderWidth: 1,
          borderColor: chrome.fieldBorder,
          ...chrome.fieldShadow,
        }}
      >
        <TextInput
          className={`w-full px-4 py-3 min-h-[96px] text-slate-800 dark:text-slate-100 rounded-2xl ${inputStyle}`}
          placeholder={placeholder}
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          placeholderTextColor={chrome.placeholder}
          multiline={true}
          numberOfLines={numberOfLines}
          textAlignVertical="top"
        />
      </View>
    </View>
  );
};

export default TextArea;
