import { TextInput, View, Text, TouchableOpacity } from "react-native";
import React, { forwardRef } from "react";
import FeIcon from "react-native-vector-icons/Feather";
import { useColorScheme } from "~/lib/useColorScheme";
import { getProfileFormChrome } from "./profile-edit/profile-form-theme";

const Input = forwardRef(
  (
    {
      label,
      placeholder,
      value,
      onChange,
      onPress,
      keyboardType,
      autoCapitalize,
      secureTextEntry,
      containerStyle,
      inputStyle,
      type,
      error,
      clear,
      onClear,
      widthLabel = true,
      disabled = false,
      numberOfLines = 1,
      multiline = false,
    },
    ref
  ) => {
    const InputWrapper = onPress ? TouchableOpacity : View;
    const additionalProps = onPress ? { onPress: onPress } : {};
    const { isDarkColorScheme } = useColorScheme();
    const chrome = getProfileFormChrome(isDarkColorScheme);
    return (
      <InputWrapper
        onPress={onPress}
        className={`w-4/5 mb-6 ${containerStyle}`}
        {...additionalProps}
      >
        <View className={`flex-row items-center justify-start flex-wrap`}>
          {clear && value && (
            <TouchableOpacity
              className={`flex-row items-center justify-between w-auto mr-1`}
              onPress={onClear}
            >
              <FeIcon
                name="x"
                size={20}
                color={isDarkColorScheme ? "#f56800" : "#ef233c"}
              />
            </TouchableOpacity>
          )}
          {widthLabel && error ? (
            <Text className="mb-1 ml-0 text-sm text-[#ef233c] dark:text-[#f56800]">
              {error}
            </Text>
          ) : (
            widthLabel && (
              <Text className={`${chrome.labelClass} ml-0`}>
                {label || placeholder}
              </Text>
            )
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
          ref={ref}
          className={`w-full px-4 py-3 min-h-[48px] text-slate-800 dark:text-slate-100 rounded-2xl ${inputStyle}`}
          placeholder={placeholder}
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          placeholderTextColor={chrome.placeholder}
          type={type}
          disable={onPress}
          pointerEvents={() => {
            return onPress ? "none" : "auto";
          }}
          disabled={disabled}
          multiline={multiline}
          numberOfLines={numberOfLines}
        />
        </View>
      </InputWrapper>
    );
  }
);

export default Input;
