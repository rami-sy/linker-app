import { View, Text, TouchableOpacity } from "react-native";
import React, { useState } from "react";
import FeIcon from "react-native-vector-icons/Feather";
import { useColorScheme } from "~/lib/useColorScheme";
import DropDownPicker from "react-native-dropdown-picker";
import { getProfileFormChrome } from "./profile-edit/profile-form-theme";

const Picker = ({
  label,
  placeholder,
  value,
  onChange,
  containerStyle,
  error,
  clear,
  onClear,
  widthLabel = true,
  options = [],
  searchable = false,
  setOptions = () => {},
}) => {
  const { isDarkColorScheme } = useColorScheme();
  const chrome = getProfileFormChrome(isDarkColorScheme);
  const [open, setOpen] = useState(false);

  return (
    <View className={`w-4/5 mb-6 ${containerStyle}`}>
      <View className={`flex-row items-center justify-start`}>
        {clear && value && value.length > 0 && (
          <TouchableOpacity
            className={`flex-row items-center justify-between w-auto`}
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
          <Text
            className="mb-1.5 ml-0 text-sm text-[#ef233c] dark:text-[#f56800]"
          >
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
      <DropDownPicker
        open={open}
        value={value}
        items={options}
        setOpen={setOpen}
        setValue={onChange}
        searchable={searchable}
        searchPlaceholder="Search..."
        translation={{
          PLACEHOLDER: placeholder,
        }}
        searchContainerStyle={
          {
            // width: "100px",
          }
        }
        searchTextInputStyle={
          {
            // width: "100px",
          }
        }
        // setItems={setOptions}
        style={{
          width: "100%",
          backgroundColor: chrome.fieldBg,
          borderColor: chrome.fieldBorder,
          borderWidth: 1,
          height: 48,
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 10,
          color: isDarkColorScheme ? "#f1f5f9" : "#1e293b",
          zIndex: 1000,
          ...chrome.fieldShadow,
        }}
        placeholderStyle={{
          color: chrome.placeholder,
        }}
        dropDownContainerStyle={{
          backgroundColor: chrome.fieldBg,
          borderColor: chrome.fieldBorder,
          borderWidth: 1,
          borderRadius: 16,
        }}
        listItemContainerStyle={{
          backgroundColor: chrome.fieldBg,
          borderRadius: 12,
          zIndex: 1000,
        }}
        listItemLabelStyle={{
          color: isDarkColorScheme ? "#e2e8f0" : "#334155",
        }}
        labelStyle={{
          color: isDarkColorScheme ? "#f1f5f9" : "#1e293b",
        }}
        showArrowIcon={false}
      />
    </View>
  );
};

export default Picker;
